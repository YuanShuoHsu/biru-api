import { sql } from 'drizzle-orm';

import { PLATFORM_TIMEZONE } from '../common/constants/timezone.js';
import {
  attendanceEvent,
  attendanceRequest,
  attendanceShift,
} from '../db/schema/attendance.js';

export const unfinishedShift = sql`NOT EXISTS (SELECT 1 FROM ${attendanceEvent} closing
    WHERE closing.shift_id = ${attendanceShift.id} AND closing.action = 'clockOut')
  AND NOT EXISTS (SELECT 1 FROM ${attendanceRequest} corrected
    WHERE corrected.shift_id = ${attendanceShift.id}
      AND corrected.kind = 'correction' AND corrected.status = 'approved')`;

export const shiftStartDate = sql<string>`to_char(${attendanceShift.startsAt} AT TIME ZONE ${PLATFORM_TIMEZONE}, 'YYYY-MM-DD')`;
