# Plan: Importación Masiva de Miembros desde Azure DevOps (Modal)

## Objetivo
Implementar un nuevo modal en la página de **Teams** que permita consultar la lista completa de miembros del equipo en Azure DevOps (TFS) y añadir múltiples personas de una sola vez a la aplicación con su nombre de usuario correcto, evitando duplicados.

## Pasos

### 1. Añadir endpoint de miembros al cliente TFS
En `src/services/tfs.ts`, añadiremos una nueva función `listTfsTeamMembers` que consuma la API REST de Azure DevOps para listar los miembros de un equipo:
- **Endpoint**: `GET {colección}/_apis/projects/{proyecto}/teams/{equipo}/members?api-version=5.0`
- **Mapeo**: Extraeremos el `displayName` (Nombre) y `uniqueName` (Login/Email) del objeto `identity` que devuelve TFS.

### 2. Crear Componente `TfsImportDialog`
Crearemos un nuevo componente en `src/components/TfsImportDialog.tsx` que maneje la lógica de importación:
- Consultará la configuración de conexión (`azure_devops_settings`) desde Supabase.
- Si no hay conexión o no se ha seleccionado un equipo en los ajustes de Azure DevOps, mostrará una alerta indicando que es necesario configurarlo.
- Si hay conexión, usará `listTfsTeamMembers` para cargar la lista de personas.
- Mostrará una lista con checkboxes para seleccionar qué personas añadir.
- **Filtro de duplicados**: Detectará qué personas ya existen en el equipo actual de Lovable (comparando el login o nombre) para desactivar el checkbox y no importarlos dos veces.
- Al confirmar, iterará sobre los seleccionados llamando a `addMember({ name, loginName, teamId, role: 'Team Member' })`.

### 3. Integrarlo en `TeamPage.tsx`
- En la página del equipo (`src/pages/TeamPage.tsx`), añadiremos el nuevo botón **"Importar de ADO"** con un icono (ej. `CloudDownload` o `Users`) justo al lado del botón actual de **"Nuevo Miembro"**.
- Conectaremos este botón para que abra el modal `TfsImportDialog`.

### 4. Textos y Traducciones
- Actualizaremos `src/context/LanguageContext.tsx` para incluir los nuevos textos necesarios (título del modal, botón de importar, avisos de configuración ausente) tanto en español como en inglés.