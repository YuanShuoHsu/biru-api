import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { and, eq } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

import { quantAiRequest } from 'src/db/schema/quant';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type { AiDecisionDto, QuantAgentRequestDto } from '../dto/quant-bot.dto';
import { QuantEngineService } from '../engine/quant-engine.service';
import { quantEnvironment } from '../quant-environment';

import { isClaudeCodeLocal } from './claude-code-local';
import { decisionSchema } from './quant-ai-advisor.service';
import { QuantAiAgentService } from './quant-ai-agent.service';

const CLAUDE_TIMEOUT_MS = 3 * 60_000;

@Injectable()
export class QuantClaudeCodeService {
  private readonly logger = new Logger(QuantClaudeCodeService.name);
  private busy = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly agent: QuantAiAgentService,
    private readonly engine: QuantEngineService,
  ) {}

  @Interval(5_000)
  async tick() {
    if (!isClaudeCodeLocal() || !this.engine.hasLease || this.busy) return;
    this.busy = true;

    try {
      const users = await this.db
        .selectDistinct({ userId: quantAiRequest.userId })
        .from(quantAiRequest)
        .where(
          and(
            eq(quantAiRequest.environment, quantEnvironment()),
            eq(quantAiRequest.status, 'pending'),
          ),
        );
      for (const { userId } of users)
        for (const request of await this.agent.pending(userId))
          await this.resolve(userId, request);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : error);
    } finally {
      this.busy = false;
    }
  }

  private async resolve(userId: string, request: QuantAgentRequestDto) {
    const symbol = request.snapshot.symbol as string;
    try {
      const decision = await this.decide(request);
      await this.agent.submit(userId, request.id, decision);
      this.logger.log(
        `${request.kind} ${symbol}: ${decision.action} (${Math.round(decision.confidence * 100)}%)`,
      );
    } catch (error) {
      // 沒判斷成功就留著，下一輪再試；過了下一根收盤會自動作廢，不會在過時的價格下單
      this.logger.warn(
        `${request.kind} ${symbol} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 不載入 MCP、工具、設定與 Claude Code 的預設提示，一次判斷只用到快照本身的 token
  private decide({
    effort,
    instructions,
    model,
    schema,
    snapshot,
  }: QuantAgentRequestDto): Promise<AiDecisionDto> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.env.CLAUDE_BIN ?? 'claude',
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
      const timer = setTimeout(() => child.kill(), CLAUDE_TIMEOUT_MS);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const result = JSON.parse(stdout) as {
            is_error?: boolean;
            result?: string;
            structured_output?: unknown;
          };
          const parsed = decisionSchema.safeParse(result.structured_output);
          if (code !== 0 || result.is_error || !parsed.success)
            return reject(
              new Error(result.result ?? (stderr || `claude exited ${code}`)),
            );

          resolve(parsed.data);
        } catch {
          reject(new Error(stderr || stdout || `claude exited ${code}`));
        }
      });
      child.stdin.end(JSON.stringify(snapshot));
    });
  }
}
