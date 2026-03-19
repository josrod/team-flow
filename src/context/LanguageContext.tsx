import React, { createContext, useContext, useState } from "react";

type Lang = "es" | "en";

const translations = {
  es: {
    dashboard: "Dashboard",
    dashboardDesc: "Resumen general de tus equipos",
    searchPeople: "Buscar personas...",
    members: "Miembros",
    absent: "Ausentes",
    upcoming: "Próximas",
    activeHandovers: "Handovers activos",
    noActiveHandovers: "No hay handovers activos en este momento.",
    navigation: "Navegación",
    absences: "Ausencias",
    handovers: "Handovers",
    team: "Equipo",
    // Team page
    teamNotFound: "Equipo no encontrado",
    add: "Añadir",
    newMember: "Nuevo miembro",
    name: "Nombre",
    role: "Rol",
    search: "Buscar...",
    all: "Todos",
    allTeams: "Todos los equipos",
    available: "Disponibles",
    vacation: "Vacaciones",
    sickLeave: "Baja",
    workTopics: "Temas de trabajo",
    addTopic: "Añadir tema",
    topicName: "Nombre del tema...",
    description: "Descripción",
    descPlaceholder: "Descripción...",
    status: "Estado",
    pending: "Pendiente",
    inProgress: "En progreso",
    blocked: "Bloqueado",
    completed: "Completado",
    save: "Guardar",
    create: "Crear",
    noTopics: "Sin temas asignados",
    deleteMember: "Eliminar miembro",
    // Absences page
    absencesDesc: "Gestión de vacaciones y bajas",
    exportCsv: "Exportar CSV",
    newAbsence: "Nueva ausencia",
    editAbsence: "Editar ausencia",
    updateAbsence: "Actualizar ausencia",
    registerAbsence: "Registrar ausencia",
    person: "Persona",
    select: "Seleccionar...",
    type: "Tipo",
    start: "Inicio",
    end: "Fin",
    date: "Fecha",
    register: "Registrar",
    timeline: "Timeline",
    list: "Lista",
    noAbsencesMonth: "Sin ausencias este mes",
    noAbsences: "No hay ausencias registradas.",
    totalDays: "días totales",
    days: "días",
    // Handovers page
    handoversDesc: "Gestión de traspasos de trabajo",
    filterByDate: "Filtrar por fecha",
    from: "Desde",
    to: "Hasta",
    clearFilter: "Limpiar filtro",
    createHandover: "Crear handover",
    newHandover: "Nuevo handover",
    absentPerson: "Persona ausente",
    covers: "Cubre",
    topicsToTransfer: "Temas a traspasar",
    notes: "Notas",
    notesPlaceholder: "Instrucciones para el handover...",
    noHandovers: "No hay handovers creados.",
    editHandover: "Editar handover",
    updateHandover: "Actualizar handover",
    created: "Creado",
    handoverDetail: "Detalle del handover",
    absenceType: "Tipo",
    absencePeriod: "Período de ausencia",
    topicCount: "temas",
    deleteHandoverTitle: "¿Eliminar handover?",
    deleteHandoverDesc: "Esta acción no se puede deshacer. El handover será eliminado permanentemente.",
    deleteAbsenceTitle: "¿Eliminar ausencia?",
    deleteAbsenceDesc: "Esta acción no se puede deshacer. La ausencia será eliminada permanentemente.",
    handoverSelectAbsent: "Selecciona la persona ausente",
    handoverSelectCover: "Selecciona quién cubre",
    handoverSelectTopics: "Selecciona al menos un tema",
    noTopicsAvailable: "Esta persona no tiene temas asignados. Puedes continuar sin seleccionar ninguno.",
    cancel: "Cancelar",
    confirmDelete: "Eliminar",
    // Not found
    pageNotFound: "Oops! Página no encontrada",
    returnHome: "Volver al inicio",
  },
  en: {
    dashboard: "Dashboard",
    dashboardDesc: "General overview of your teams",
    searchPeople: "Search people...",
    members: "Members",
    absent: "Absent",
    upcoming: "Upcoming",
    activeHandovers: "Active handovers",
    noActiveHandovers: "No active handovers at this time.",
    navigation: "Navigation",
    absences: "Absences",
    handovers: "Handovers",
    team: "Team",
    // Team page
    teamNotFound: "Team not found",
    add: "Add",
    newMember: "New member",
    name: "Name",
    role: "Role",
    search: "Search...",
    all: "All",
    allTeams: "All teams",
    available: "Available",
    vacation: "Vacation",
    sickLeave: "Sick leave",
    workTopics: "Work topics",
    addTopic: "Add topic",
    topicName: "Topic name...",
    description: "Description",
    descPlaceholder: "Description...",
    status: "Status",
    pending: "Pending",
    inProgress: "In progress",
    blocked: "Blocked",
    completed: "Completed",
    save: "Save",
    create: "Create",
    noTopics: "No assigned topics",
    deleteMember: "Delete member",
    // Absences page
    absencesDesc: "Vacation and leave management",
    exportCsv: "Export CSV",
    newAbsence: "New absence",
    editAbsence: "Edit absence",
    updateAbsence: "Update absence",
    registerAbsence: "Register absence",
    person: "Person",
    select: "Select...",
    type: "Type",
    start: "Start",
    end: "End",
    date: "Date",
    register: "Register",
    timeline: "Timeline",
    list: "List",
    noAbsencesMonth: "No absences this month",
    noAbsences: "No absences registered.",
    totalDays: "total days",
    days: "days",
    // Handovers page
    handoversDesc: "Work handover management",
    filterByDate: "Filter by date",
    from: "From",
    to: "To",
    clearFilter: "Clear filter",
    createHandover: "Create handover",
    newHandover: "New handover",
    absentPerson: "Absent person",
    covers: "Covers",
    topicsToTransfer: "Topics to transfer",
    notes: "Notes",
    notesPlaceholder: "Instructions for the handover...",
    noHandovers: "No handovers created.",
    editHandover: "Edit handover",
    updateHandover: "Update handover",
    created: "Created",
    handoverDetail: "Handover detail",
    absenceType: "Type",
    absencePeriod: "Absence period",
    topicCount: "topics",
    deleteHandoverTitle: "Delete handover?",
    deleteHandoverDesc: "This action cannot be undone. The handover will be permanently deleted.",
    deleteAbsenceTitle: "Delete absence?",
    deleteAbsenceDesc: "This action cannot be undone. The absence will be permanently deleted.",
    handoverSelectAbsent: "Select the absent person",
    handoverSelectCover: "Select who covers",
    handoverSelectTopics: "Select at least one topic",
    noTopicsAvailable: "This person has no assigned topics. You can continue without selecting any.",
    cancel: "Cancel",
    confirmDelete: "Delete",
    // Not found
    pageNotFound: "Oops! Page not found",
    returnHome: "Return to Home",
  },
} as const;

type Translations = Record<keyof (typeof translations)["es"], string>;

interface LangState {
  lang: Lang;
  toggleLang: () => void;
  t: Translations;
}

const LanguageContext = createContext<LangState | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("teamflow-lang");
    return saved === "en" ? "en" : "es";
  });

  const toggleLang = () =>
    setLang((l) => {
      const next = l === "es" ? "en" : "es";
      localStorage.setItem("teamflow-lang", next);
      return next;
    });

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
