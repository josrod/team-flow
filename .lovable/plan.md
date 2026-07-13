Añadir un script `npm run local:down` que detenga y limpie el entorno local levantado con `local:up`.

Cambios propuestos:

1. Crear `scripts/local-down.sh`
   - Leer `docker/.env` como `--env-file`.
   - Ejecutar `docker compose -f docker/docker-compose.yml down` (elimina contenedores y redes).
   - Soportar `--volumes` para borrar volúmenes (BD) y `--rmi` para borrar imágenes creadas, con aviso previo.
   - Mostrar mensajes claros de éxito/error.

2. Actualizar `package.json`
   - Añadir script `"local:down": "bash scripts/local-down.sh"`.
   - Opcionalmente añadir variantes `local:down:reset` (con `--volumes`) y `local:down:clean` (con `--volumes --rmi`).

3. Actualizar `DEPLOYMENT.md`
   - Documentar `npm run local:down` junto a `local:up` en la sección de operación del stack local.

Ejemplo de uso final:
- `npm run local:down` — para el stack y elimina contenedores/redes.
- `npm run local:down:reset` — además borra el volumen de Postgres (pérdida de datos).
