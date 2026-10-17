// 本機、stage、正式環境共用同一個資料庫，BETTER_AUTH_URL 是各環境必定不同的設定
export const quantEnvironment = () => {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new Error('BETTER_AUTH_URL is required');

  return new URL(url).origin;
};
