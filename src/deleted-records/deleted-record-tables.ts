// 須與 migration 掛上 trigger 的結果一致（audit_log 於 0191、attendance_audit 於 0198 補掛）
export const UNTRACKED_TABLES = [
  'deleted_record',
  'session',
  'verification',
  'ecpay_callback_log',
  'statutory_holiday',
  'payroll_rule_set',
] as const;

// 出勤與薪資資料不直接寫回，交給各自的建立流程重跑檢查、薪資鎖定與連動效果
export const SERVICE_RESTORED_TABLES = new Set<string>([
  'attendance_employee',
  'attendance_shift_type',
  'attendance_leave_type',
  'attendance_leave_case',
  'attendance_annual_leave_deferral',
  'attendance_holiday_substitute',
  'payroll_earning_type',
]);

// 點數、退款、薪資加項明細的刪除是系統記帳，不是使用者操作，不列入
export const RESTORABLE_TABLES = [
  'organization',
  'user',
  'member',
  'invitation',
  'team',
  'team_member',
  'menu_section',
  'menu_item',
  'offer',
  'menu_item_add_on',
  'modifier_group',
  'modifier',
  'menu_item_modifier_group',
  'coupon',
  'banner',
  'supplier',
  'ingredient',
  'recipe',
  'recipe_ingredient',
  'attendance_employee',
  'attendance_shift_type',
  'attendance_leave_type',
  'attendance_leave_case',
  'attendance_annual_leave_deferral',
  'attendance_holiday_substitute',
  'payroll_earning_type',
] as const;

export type RestorableTable = (typeof RESTORABLE_TABLES)[number];

export const LABEL_COLUMNS = [
  'name',
  'display_name',
  'code',
  'email',
  'reference',
] as const;
