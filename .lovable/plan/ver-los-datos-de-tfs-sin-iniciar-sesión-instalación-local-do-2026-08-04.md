# Ver los datos de TFS sin iniciar sesión (instalación local Docker)

## Diagnóstico

En la nube todo funciona ya: he comprobado que el endpoint `ado-public-connection` responde 200 a una llamada anónima y que, sin sesión, la app pide la configuración del admin y lanza las consultas a TFS directamente desde el navegador.

El fallo está en el stack local de Docker, por dos motivos confirmados leyendo `docker/docker-compose.yml`:

1. El servicio `functions` arranca con `VERIFY_JWT: "true"`, así que el runtime local exige un JWT de usuario y devuelve 401 antes de ejecutar la función. Resultado: el visitante sin sesión no recibe la configuración y la vista muestra el error de conexión con TFS.
2. Ese mismo servicio arranca con `--main-service /home/deno/functions/main`, pero en `supabase/functions/` no existe ninguna carpeta `main`. El runtime self-hosted necesita ese enrutador para servir `ado-public-connection` y `tfs-pat-vault` por su nombre.

## Qué haré

1. **Desactivar la verificación de JWT en el runtime local**: `VERIFY_JWT: "false"` en el servicio `functions`. La validación de sesión se sigue haciendo dentro del código (`tfs-pat-vault` la exige; `ado-public-connection` es pública a propósito).
2. **Añadir el enrutador `supabase/functions/main/index.ts`**: toma el primer segmento de la ruta (`/functions/v1/<nombre>`), carga esa función del disco y la sirve. Es el patrón estándar de Supabase self-hosting y hará que ambas funciones respondan igual que en la nube.
3. **Actualizar `DEPLOYMENT.md`**: dejar claro que hay que aplicar todas las migraciones de `supabase/migrations/` (incluida la última, que da lectura anónima a equipos, ausencias, handovers, temas, notas y versiones de épicas), y que `ADO_PAT_ENC_KEY` en `docker/.env` debe ser exactamente la misma clave con la que se cifró el token; si no, el descifrado falla y aparece el mismo error de TFS.
4. **Mensaje de error más útil**: cuando la configuración compartida no se pueda obtener, distinguir entre "no hay configuración guardada" y "el servidor no ha devuelto la configuración" en Tasks, Bugs, Épicas y En espera, con textos ES/EN, para que un fallo así no se confunda con un problema de red con TFS.

## Notas

- El token del admin sigue llegando al navegador del visitante (decisión ya aceptada): conviene un PAT de solo lectura y caducidad corta, y publicar la app solo en la red interna.
- Las consultas a TFS se hacen desde el navegador del visitante, así que el equipo debe estar en la red corporativa; desde fuera seguirá dando error de resolución de nombre.

## Verificación

`tsgo`, la suite de tests, y comprobación en navegador de que sin sesión la app obtiene la configuración compartida y lanza las consultas a TFS. La parte de red interna solo se puede confirmar en tu máquina, tras `docker compose up -d --build` y aplicar las migraciones.
