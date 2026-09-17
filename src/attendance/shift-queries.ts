import { sql } from 'drizzle-orm';

import {
  attendanceEvent,
  attendanceRequest,
  attendanceShift,
} from 'src/db/schema/attendance';

export const unfinishedShift = sql`NOT EXISTS (SELECT 1 FROM ${attendanceEvent} closing
    WHERE closing.shift_id = ${attendanceShift.id} AND closing.action = 'clockOut')
  AND NOT EXISTS (SELECT 1 FROM ${attendanceRequest} corrected
    WHERE corrected.shift_id = ${attendanceShift.id}
      AND corrected.kind = 'correction' AND corrected.status = 'approved')`;
