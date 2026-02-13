import { Team, TeamMember, WorkTopic, Absence, Handover } from "@/types";

export const teams: Team[] = [
  { id: "team-1", name: "RODAT", icon: "shield" },
  { id: "team-2", name: "Processing", icon: "cpu" },
];

const firstNames = [
  "Carlos", "María", "Andrés", "Laura", "Diego", "Sofía", "Pablo", "Elena",
  "Javier", "Ana", "Miguel", "Lucía", "Fernando", "Carmen", "Raúl", "Isabel",
  "Tomás", "Valeria", "Héctor", "Patricia", "Sergio", "Daniela", "Adrián", "Marta",
  "Óscar", "Natalia", "Iván", "Claudia", "Alberto", "Rosa", "Guillermo", "Teresa",
];

const roles = [
  "Frontend Dev", "Backend Dev", "QA Engineer", "Product Manager",
  "UX Designer", "DevOps", "Data Analyst", "Scrum Master",
  "Tech Lead", "Full Stack Dev", "Security Engineer", "Mobile Dev",
  "Cloud Architect", "Business Analyst", "Support Engineer", "SRE",
];

export const members: TeamMember[] = firstNames.map((name, i) => ({
  id: `member-${i + 1}`,
  name,
  role: roles[i % roles.length],
  teamId: i < 16 ? "team-1" : "team-2",
}));

const topicNames = [
  "Migración API v3", "Rediseño checkout", "Pipeline CI/CD", "Dashboard analytics",
  "Módulo de pagos", "Optimización DB", "App móvil iOS", "Sistema de alertas",
  "Integración SSO", "Refactor auth", "Tests E2E", "Documentación API",
  "Microservicios", "Cache Redis", "Landing page", "Sistema de logs",
  "Onboarding flow", "Feature flags", "Rate limiting", "Backup system",
  "Search engine", "Notification service", "User profiles", "Admin panel",
  "Billing module", "Audit trail", "Config service", "Health checks",
  "Load balancer", "Data export", "Import wizard", "Report builder",
];

const topicStatuses: WorkTopic["status"][] = ["in-progress", "pending", "blocked", "completed"];

export const workTopics: WorkTopic[] = members.flatMap((m, mi) => {
  const count = 1 + (mi % 3); // 1-3 topics per member
  return Array.from({ length: count }, (_, ti) => ({
    id: `topic-${mi}-${ti}`,
    memberId: m.id,
    name: topicNames[(mi * 3 + ti) % topicNames.length],
    description: `Trabajo activo en ${topicNames[(mi * 3 + ti) % topicNames.length].toLowerCase()} — ${m.name} es responsable.`,
    status: topicStatuses[(mi + ti) % topicStatuses.length],
  }));
});

// Some absences around current date
const today = new Date();
const d = (offset: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
};

export const absences: Absence[] = [
  { id: "abs-1", memberId: "member-2", type: "vacation", startDate: d(-2), endDate: d(5) },
  { id: "abs-2", memberId: "member-5", type: "sick-leave", startDate: d(-1), endDate: d(3) },
  { id: "abs-3", memberId: "member-8", type: "vacation", startDate: d(3), endDate: d(10) },
  { id: "abs-4", memberId: "member-12", type: "vacation", startDate: d(7), endDate: d(14) },
  { id: "abs-5", memberId: "member-18", type: "sick-leave", startDate: d(-3), endDate: d(1) },
  { id: "abs-6", memberId: "member-21", type: "vacation", startDate: d(5), endDate: d(12) },
  { id: "abs-7", memberId: "member-25", type: "vacation", startDate: d(10), endDate: d(17) },
  { id: "abs-8", memberId: "member-30", type: "sick-leave", startDate: d(0), endDate: d(4) },
];

export const handovers: Handover[] = [
  {
    id: "ho-1",
    fromMemberId: "member-2",
    toMemberId: "member-3",
    absenceId: "abs-1",
    topicIds: ["topic-1-0"],
    notes: "Revisar PR #234 pendiente y seguir con la integración del endpoint /users.",
    createdAt: d(-3),
  },
  {
    id: "ho-2",
    fromMemberId: "member-5",
    toMemberId: "member-6",
    absenceId: "abs-2",
    topicIds: ["topic-4-0", "topic-4-1"],
    notes: "Pipeline desplegado en staging, falta validar producción.",
    createdAt: d(-2),
  },
];
