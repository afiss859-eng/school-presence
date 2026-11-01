export type AttendanceStatus = "present" | "absent" | "late";

export type DisciplinaryEventType =
  | "course_expulsion"
  | "temporary_exclusion"
  | "permanent_exclusion";

export type UserRole =
  | "super_admin"
  | "school_admin"
  | "life_supervisor"
  | "teacher"
  | "class_delegate"
  | "student"
  | "parent";

export type JustificationStatus = "pending" | "approved" | "rejected";

export interface StudentAttendance {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  status: AttendanceStatus;
}

export function canSubmitJustification(
  role: UserRole,
  event: "absence" | "late"
): boolean {
  return role === "parent" && (event === "absence" || event === "late");
}

export function canCreateCourseExpulsion(role: UserRole): boolean {
  return role === "teacher" || role === "life_supervisor" || role === "school_admin";
}

export function canCreateSchoolExclusion(role: UserRole): boolean {
  return role === "school_admin" || role === "super_admin";
}