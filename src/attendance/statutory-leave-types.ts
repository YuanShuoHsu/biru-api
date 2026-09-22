import { randomUUID } from 'node:crypto';

import {
  STATUTORY_LEAVE_KINDS,
  type StatutoryLeaveKind,
} from 'src/db/schema/attendance';

export const STATUTORY_LEAVE_NAMES: Record<
  Exclude<StatutoryLeaveKind, 'custom'>,
  string
> = {
  annual: '特別休假',
  personal: '事假',
  familyCare: '家庭照顧假',
  sick: '普通傷病假',
  hospitalSick: '住院傷病假',
  pregnancyRest: '安胎休養假',
  parental: '育嬰留職停薪',
  menstrual: '生理假',
  marriage: '婚假',
  funeral8: '喪假（父母／配偶）',
  funeral6: '喪假（祖父母／子女／配偶父母）',
  funeral3: '喪假（曾祖父母／兄弟姊妹／配偶祖父母）',
  prenatal: '產檢假',
  paternity: '陪產檢及陪產假',
  maternity: '產假',
  miscarriage28: '流產假（妊娠滿 3 個月）',
  miscarriage7: '流產假（妊娠 2–3 個月）',
  miscarriage5: '流產假（妊娠未滿 2 個月）',
};

export const statutoryLeaveTypeSeeds = (organizationId: string) =>
  STATUTORY_LEAVE_KINDS.flatMap((kind) =>
    kind === 'custom'
      ? []
      : [
          {
            id: randomUUID(),
            organizationId,
            statutoryKind: kind,
            name: STATUTORY_LEAVE_NAMES[kind],
            paidPercent: null,
            requiresBalance: null,
            enabled: true,
          },
        ],
  );
