import 'dotenv/config';

// 未設 CRON_ENABLED 時，本機、stage、正式環境共用同一個資料庫，排程只能在正式環境跑，否則 stage 會拿 Test 商店代號處理正式訂單
export const CRON_ENABLED = process.env.CRON_ENABLED
  ? process.env.CRON_ENABLED === 'true'
  : process.env.ECPAY_OPERATION_MODE === 'Production';
