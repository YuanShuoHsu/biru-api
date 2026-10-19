// 須與 migration 掛上 trigger 的結果一致（audit_log 於 0191、attendance_audit 於 0198 補掛）
export const UNTRACKED_TABLES = [
  'deleted_record',
  'session',
  'verification',
  'ecpay_callback_log',
  'statutory_holiday',
  'payroll_rule_set',
  'quant_bot_order',
  'quant_bot_fill',
  'quant_bot_event',
  'quant_bot_equity',
  'quant_engine_lease',
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

// 還原等於重新建立，店內成員須具備各表建立端點所要求的權限；不在表內的只有平台管理員能還原（例如優惠券定義只由平台建立）
export const RESTORE_PERMISSIONS: Partial<
  Record<string, Record<string, string[]>>
> = {
  attendance_annual_leave_deferral: { leaveBalance: ['create'] },
  attendance_employee: { employee: ['create'] },
  attendance_holiday_substitute: { shift: ['update'] },
  attendance_leave_balance: { leaveBalance: ['create'] },
  attendance_leave_case: { leaveCase: ['create'] },
  attendance_leave_type: { leaveType: ['create'] },
  attendance_shift_type: { shiftType: ['create'] },
  ingredient: { inventory: ['create'] },
  inventory_transaction: { inventoryTransaction: ['create'] },
  invitation: { invitation: ['create'] },
  member: { member: ['create'] },
  menu_item: { menu: ['create'] },
  menu_item_add_on: { menu: ['create'] },
  menu_item_modifier_group: { menu: ['create'] },
  menu_section: { menu: ['create'] },
  modifier: { menu: ['create'] },
  modifier_group: { menu: ['create'] },
  offer: { menu: ['create'] },
  payroll_earning_type: { payrollTerm: ['create'] },
  recipe: { inventory: ['create'] },
  recipe_ingredient: { inventory: ['create'] },
  supplier: { purchasing: ['create'] },
  team: { team: ['create'] },
  team_member: { member: ['update'] },
};
