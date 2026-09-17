import type { WeeklyMinutesChange } from 'src/db/schema/attendance';

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
