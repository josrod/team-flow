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

export function sanitizeText(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
