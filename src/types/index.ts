export type MemberStatus = "available" | "vacation" | "sick-leave" | "work-travel" | "other-project" | "parental-leave";
export type AbsenceType = "vacation" | "sick-leave" | "work-travel" | "other-project" | "parental-leave";
export type WorkTopicStatus = "in-progress" | "pending" | "blocked" | "completed";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  teamId: string;
  avatar?: string;
  baseCapacity?: number; // base/optimal weekly capacity (e.g., 32h)
  maxCapacity?: number; // max weekly capacity (e.g., 40h)
}

export interface WorkTopic {
  id: string;
  memberId: string;
  name: string;
  description: string;
  status: WorkTopicStatus;
  reassignedFrom?: string; // memberId of previous owner
}

export interface Absence {
  id: string;
  memberId: string;
  type: AbsenceType;
  startDate: string; // ISO date
  endDate: string;   // ISO date
}

export interface Handover {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  absenceId: string;
  topicIds: string[];
  notes: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  icon?: string;
}
