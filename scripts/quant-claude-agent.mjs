#!/usr/bin/env node
// 本機 Claude Code 代理：用 Claude 訂閱額度替後台 AI 機器人做判斷。
// 只回傳判斷；模擬盤與回測由後台套用，實盤一律等使用者在後台確認才下單。
//
// 環境變數：
//   QUANT_AGENT_TOKEN      必填，後台「API KEY」頁產生的 Claude Code 連線 token
//   QUANT_AGENT_URL        後台 API 位址，預設 http://localhost:3001
//   QUANT_AGENT_MODEL      傳給 claude --model，省略時用 Claude Code 的預設模型
//   QUANT_AGENT_MAX_STEPS  單次執行最多回答幾筆（回測會連續產生請求），預設 20
//   CLAUDE_BIN             claude 指令位置，預設 claude

import { spawn } from 'node:child_process';
import {
  closeSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const token = process.env.QUANT_AGENT_TOKEN;
const baseUrl = (
  process.env.QUANT_AGENT_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');
const model = process.env.QUANT_AGENT_MODEL;
const maxSteps = Number(process.env.QUANT_AGENT_MAX_STEPS ?? 20);
const claudeBin = process.env.CLAUDE_BIN ?? 'claude';
const lockPath = join(tmpdir(), 'quant-claude-agent.lock');

const log = (message) => console.log(`${new Date().toISOString()} ${message}`);

const api = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}/api/quant/agent${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(
      `${init.method ?? 'GET'} ${path} ${response.status}: ${await response.text()}`,
    );

  return response.status === 204 ? null : response.json();
};

// 不載入 MCP、工具、設定與 Claude Code 的預設提示，一次判斷只用到快照本身的 token
const decide = ({ instructions, schema, snapshot }) =>
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
        '--system-prompt',
        instructions,
        '--json-schema',
        JSON.stringify(schema),
        ...(model ? ['--model', model] : []),
      ],
      { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout);
        if (code !== 0 || result.is_error || !result.structured_output)
          return reject(
            new Error(result.result ?? stderr ?? `claude exited ${code}`),
          );

        resolve(result.structured_output);
      } catch {
        reject(new Error(stderr || stdout || `claude exited ${code}`));
      }
    });
    child.stdin.end(JSON.stringify(snapshot));
  });

// launchd 定時觸發；上一輪還在跑（例如回測連續判斷）就跳過，不重複呼叫
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

const main = async () => {
  if (!token) throw new Error('QUANT_AGENT_TOKEN is required');
  if (!acquireLock()) return log('previous run still active, skipped');

  try {
    const failed = new Set();
    for (let step = 0; step < maxSteps; step++) {
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
        log(`${request.kind} ${request.id}: ${decision.action}`);
      } catch (error) {
        // 失敗的請求留給下一輪重試；過了下一根收盤後台會自動作廢，不會在過時的價格下單
        failed.add(request.id);
        log(`${request.kind} ${request.id} failed: ${error.message}`);
      }
    }
  } finally {
    rmSync(lockPath, { force: true });
  }
};

main().catch((error) => {
  log(error.message);
  process.exitCode = 1;
});
