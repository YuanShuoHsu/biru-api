import type {
  AttendanceEmploymentType,
  WeeklyMinutesChange,
} from 'src/db/schema/attendance';

export const FULL_TIME_WEEKLY_MINUTES = 2400;

export interface EmployeeHours {
  weeklyMinutes: number;
  weeklyMinutesHistory: WeeklyMinutesChange[];
}

export const weeklyMinutesAt = (employee: EmployeeHours, at: Date): number => {
  const [first] = employee.weeklyMinutesHistory;
  if (!first) return employee.weeklyMinutes;
  const applied = employee.weeklyMinutesHistory.filter(
    (change) => new Date(change.from) <= at,
  );

  return (applied.at(-1) ?? first).minutes;
};

export const weeklyMinutesOf =
  (employee: EmployeeHours) =>
  (at: Date): number =>
    weeklyMinutesAt(employee, at);

export const employmentType = (
  weeklyMinutes: number,
): AttendanceEmploymentType =>
  weeklyMinutes < FULL_TIME_WEEKLY_MINUTES ? 'partTime' : 'fullTime';
