// 機器人的委託和手動委託共用同一個 Pionex 帳戶，靠 clientOrderId 區分歸屬
const BOT_CLIENT_ORDER_ID = /^[0-9a-f-]{36}-\d+$/;

export const botClientOrderId = (botId: string, sequence: number) =>
  `${botId}-${sequence}`;

export const isBotClientOrderId = (clientOrderId?: string) =>
  !!clientOrderId && BOT_CLIENT_ORDER_ID.test(clientOrderId);
