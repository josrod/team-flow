# Multi-stage build para el SPA
# --------------------------------
# 1) Compila con Bun (Vite) inyectando las variables VITE_*
# 2) Sirve el bundle estático con nginx y fallback SPA para React Router

FROM oven/bun:1.1.34-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun run build

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
