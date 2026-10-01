export const ATTENDANCE_REQUEST_SUBMITTED_EVENT =
  'attendance.request.submitted';

export const ATTENDANCE_REQUEST_REVIEWED_EVENT = 'attendance.request.reviewed';

export type AttendanceNotificationKind =
  | 'leave'
  | 'correction'
  | 'overtime'
  | 'cancellation'
  | 'extraWork'
  | 'parentalReturn';

interface AttendanceNotificationSubject {
  organizationId: string;
  employeeId: string;
  kind: AttendanceNotificationKind;
  startsAt: Date;
  endsAt: Date;
}

export interface AttendanceRequestSubmittedEvent extends AttendanceNotificationSubject {
  kind: Exclude<AttendanceNotificationKind, 'extraWork'>;
}

export interface AttendanceRequestReviewedEvent extends AttendanceNotificationSubject {
  reviewerUserId: string;
  status: 'approved' | 'rejected';
  reason: string;
}
