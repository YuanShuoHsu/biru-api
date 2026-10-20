// 美元／每個 token：https://platform.claude.com/docs/en/about-claude/pricing
// Haiku 5.5 帶 fallbacks 會回 400，Sonnet 5.5 文件沒列支援，只有 Opus 帶
export const AI_MODELS = {
  'claude-opus-5-5': {
    fallbacks: true,
    price: { cacheRead: 0.2e-6, cacheWrite: 5e-6, input: 4e-6, output: 20e-6 },
  },
  'claude-sonnet-5-5': {
    fallbacks: false,
    price: {
      cacheRead: 0.2e-6,
      cacheWrite: 2.5e-6,
      input: 2e-6,
      output: 10e-6,
    },
  },
  'claude-haiku-5-5': {
    fallbacks: false,
    price: {
      cacheRead: 0.01e-6,
      cacheWrite: 0.125e-6,
      input: 0.1e-6,
      output: 0.5e-6,
    },
  },
} as const;

export type AiModel = keyof typeof AI_MODELS;

export const AI_MODEL_IDS = Object.keys(AI_MODELS) as AiModel[];

// 舊機器人沒有存模型與 effort，沿用當時寫死的值
export const DEFAULT_AI_MODEL: AiModel = 'claude-opus-5-5';
export const DEFAULT_AI_EFFORT = 'medium' as const;
