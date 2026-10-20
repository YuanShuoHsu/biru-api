#!/usr/bin/env node
// 本機 Claude Code 代理：用 Claude 訂閱額度替後台 AI 機器人做判斷。
//
//   node scripts/quant-claude-agent.mjs           處理一次目前的請求就結束
//   node scripts/quant-claude-agent.mjs --watch   每分鐘檢查一次，按 Ctrl+C 停止
//
// 沒有可用的 token 時會自動打開後台請你核准連線，核准後把 token 存到 ~/.biru-quant-agent-token
// 環境變數（都可省略）：
//   QUANT_AGENT_URL        後台 API 位址，預設 http://localhost:3001
//   QUANT_AGENT_ADMIN_URL  後台網頁位址（核准連線用），預設 http://localhost:3002
//   QUANT_AGENT_INTERVAL   監看模式的檢查間隔（秒），預設 60
//   QUANT_AGENT_MAX_STEPS  每次檢查最多回答幾筆（回測會連續產生請求），預設 20
//   CLAUDE_BIN             claude 指令位置，預設 claude

import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const watch = process.argv.includes('--watch');
const tokenFile = join(homedir(), '.biru-quant-agent-token');
let token =
  process.env.QUANT_AGENT_TOKEN ??
  (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
const baseUrl = (
  process.env.QUANT_AGENT_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');
const adminUrl = (
  process.env.QUANT_AGENT_ADMIN_URL ?? 'http://localhost:3002'
).replace(/\/$/, '');
const CONNECT_POLL_MS = 2_000;
const intervalMs = Number(process.env.QUANT_AGENT_INTERVAL ?? 60) * 1000;
const maxSteps = Number(process.env.QUANT_AGENT_MAX_STEPS ?? 20);
const claudeBin = process.env.CLAUDE_BIN ?? 'claude';
const lockPath = join(tmpdir(), 'quant-claude-agent.lock');

const ACTIONS = { close: '平倉', hold: '觀望', open: '開倉' };

let stopping = false;
let running = null;
const stopped = new AbortController();

const time = () => new Date().toLocaleTimeString('zh-TW', { hour12: false });
const log = (message) => console.log(`${time()} ${message}`);

const api = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}/api/quant/agent${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? `HTTP ${response.status}`), {
      status: response.status,
    });
  }

  return response.status === 204 ? null : response.json();
};

// 不載入 MCP、工具、設定與 Claude Code 的預設提示，一次判斷只用到快照本身的 token
const decide = ({ effort, instructions, model, schema, snapshot }) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      claudeBin,
      [
        '-p',
        '--output-format',
        'json',
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
        '--model',
        model,
        '--effort',
        effort,
        '--system-prompt',
        instructions,
        '--json-schema',
        JSON.stringify(schema),
      ],
      { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    running = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      running = null;
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || result.is_error || !result.structured_output)
          return reject(
            new Error(result.result ?? stderr ?? `claude 結束代碼 ${code}`),
          );

        resolve(result.structured_output);
      } catch {
        reject(new Error(stderr || stdout || `claude 結束代碼 ${code}`));
      }
    });
    child.stdin.end(JSON.stringify(snapshot));
  });

// 同時只能有一個代理在跑，避免同一筆請求被判斷兩次、重複消耗額度
const acquireLock = () => {
  try {
    const fd = openSync(lockPath, 'wx');
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch {
    const pid = Number(readFileSync(lockPath, 'utf8'));
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      rmSync(lockPath, { force: true });
      return acquireLock();
    }
  }
};

const describe = (request, decision) => {
  const label = request.kind === 'bot' ? '機器人' : '回測';
  const confidence = Math.round(decision.confidence * 100);

  return `${label} ${request.snapshot.symbol}：${ACTIONS[decision.action]}（信心 ${confidence}%）`;
};

/** 回答目前所有待判斷的請求，回傳處理了幾筆 */
const runOnce = async () => {
  const failed = new Set();
  let handled = 0;

  for (let step = 0; step < maxSteps && !stopping; step++) {
    const requests = (await api('/requests')).filter(
      ({ id }) => !failed.has(id),
    );
    if (!requests.length) break;

    const request = requests[0];
    try {
      const decision = await decide(request);
      await api(`/requests/${request.id}`, {
        body: JSON.stringify(decision),
        method: 'POST',
      });
      handled++;
      log(describe(request, decision));
    } catch (error) {
      if (stopping) break;
      // 失敗的請求留給下一輪重試；過了下一根收盤後台會自動作廢，不會在過時的價格下單
      failed.add(request.id);
      log(`判斷失敗：${error.message}`);
    }
  }

  return handled;
};

// 像 gh auth login：開瀏覽器到後台，使用者核准代碼後輪詢取得 token 並存檔
const connect = async () => {
  const { code, id } = await api('/connect', { method: 'POST' });
  const url = `${adminUrl}/quant/settings?agentCode=${encodeURIComponent(code)}`;
  log(`需要連線：已打開瀏覽器，請確認代碼 ${code} 後按「確認」`);
  log(`如果瀏覽器沒有自動打開，請手動前往 ${url}`);
  spawn('open', [url], { stdio: 'ignore' }).on('error', () => undefined);

  while (!stopping) {
    await sleep(CONNECT_POLL_MS, undefined, { signal: stopped.signal }).catch(
      () => undefined,
    );
    const result = await api(`/connect/${id}`);
    if (result.status === 'expired')
      throw new Error('連線代碼已過期，請重新執行代理');
    if (result.status === 'approved') {
      token = result.token;
      writeFileSync(tokenFile, token, { mode: 0o600 });
      log('已連線，token 已存好，之後不用再處理');
      return;
    }
  }
};

/** token 失效（例如在後台重新產生或撤銷）時自動重新連線 */
const withConnection = async (task) => {
  try {
    return await task();
  } catch (error) {
    if (error.status !== 401) throw error;

    log('連線 token 已失效，重新連線');
    await connect();
    return task();
  }
};

const stop = () => {
  if (stopping) return;
  stopping = true;
  running?.kill();
  stopped.abort();
  log('停止中…');
};

const main = async () => {
  if (!acquireLock())
    throw new Error('已經有另一個代理在執行，請先停止它再啟動');

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    if (!token) await connect();
    if (!watch) {
      const handled = await withConnection(runOnce);
      if (!handled) log('沒有待判斷的請求');
      return;
    }

    log(`監看模式啟動：每 ${intervalMs / 1000} 秒檢查一次，按 Ctrl+C 停止`);
    while (!stopping) {
      try {
        if (!(await withConnection(runOnce)) && !stopping)
          log('沒有待判斷的請求');
      } catch (error) {
        if (error.status === 409) {
          log(error.message);
          process.exitCode = 1;
          break;
        }
        log(`檢查失敗：${error.message}，下次再試`);
      }
      await sleep(intervalMs, undefined, { signal: stopped.signal }).catch(
        () => undefined,
      );
    }
  } finally {
    rmSync(lockPath, { force: true });
    if (watch) log('已停止');
  }
};

main().catch((error) => {
  log(error.message);
  process.exitCode = 1;
});
