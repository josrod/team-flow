import { z } from "zod";

export const memberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  role: z.string().trim().min(1, "Role is required").max(50, "Role must be less than 50 characters"),
  teamId: z.string().min(1),
});

export const teamNameSchema = z.string().trim().min(1, "Team name is required").max(100, "Team name must be less than 100 characters");

export const topicSchema = z.object({
  name: z.string().trim().min(1, "Topic name is required").max(100, "Topic name must be less than 100 characters"),
  description: z.string().trim().max(500, "Description must be less than 500 characters"),
  status: z.enum(["pending", "in-progress", "blocked", "completed"]),
});

export const handoverNotesSchema = z.string().trim().max(1000, "Notes must be less than 1000 characters");

const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  teamId: z.string(),
  avatar: z.string().optional(),
  baseCapacity: z.number().optional(),
  maxCapacity: z.number().optional(),
  loginName: z.string().optional(),
});

const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
});

const workTopicSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in-progress", "blocked", "completed"]),
});

const absenceSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  type: z.enum(["vacation", "sick-leave", "work-travel", "other-project", "parental-leave"]),
  startDate: z.string(),
  endDate: z.string(),
});

const handoverSchema = z.object({
  id: z.string(),
  fromMemberId: z.string(),
  toMemberId: z.string(),
  absenceId: z.string(),
  topicIds: z.array(z.string()),
  notes: z.string(),
  createdAt: z.string(),
});

export const importDataSchema = z.object({
  teams: z.array(teamSchema).optional(),
  members: z.array(teamMemberSchema).optional(),
  workTopics: z.array(workTopicSchema).optional(),
  absences: z.array(absenceSchema).optional(),
  handovers: z.array(handoverSchema).optional(),
}).refine(
  (d) => d.teams || d.members || d.workTopics || d.absences || d.handovers,
  { message: "El archivo no contiene datos válidos" }
);

export function sanitizeText(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
