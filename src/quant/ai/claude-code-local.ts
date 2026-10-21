import { quantEnvironment } from '../quant-environment.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** 後端跑在本機時，和已登入的 Claude Code 在同一台電腦，直接在後端判斷，不需要另外執行代理 */
export const isClaudeCodeLocal = () =>
  LOCAL_HOSTS.has(new URL(quantEnvironment()).hostname);
