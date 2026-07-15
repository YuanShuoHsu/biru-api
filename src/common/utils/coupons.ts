import { and, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { coupon, userCoupon } from 'src/db/schema/coupons';

// 排除點數兌換券：僅能以點數兌換取得，不參與輸碼／領取／自動發放
export const notPointsRedeem = () => isNull(coupon.pointsCost);

// 尚有額度：totalLimit 扣除已使用與已發出未使用（保留額度）的券
export const withinCapacity = () =>
  or(
    isNull(coupon.totalLimit),
    // RQB（db.query）會把 where 內 sql fragment 的所有 Column 改寫成主表別名，跨表欄位須寫死別名
    sql`${coupon.usedCount} + (SELECT COUNT(*) FROM ${userCoupon} AS "uc" WHERE "uc"."coupon_id" = ${coupon.id} AND "uc"."used_at" IS NULL) < ${coupon.totalLimit}`,
  );

// 效期內：validFrom / validThrough 為 null 表示不限
export const withinValidity = () => {
  const now = new Date();
  return and(
    or(isNull(coupon.validFrom), lte(coupon.validFrom, now)),
    or(isNull(coupon.validThrough), gte(coupon.validThrough, now)),
  );
};
