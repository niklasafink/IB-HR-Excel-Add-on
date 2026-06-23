# --- Build-Stufe ---------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Laufzeit-Stufe ------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Nur Produktions-Abhängigkeiten (office-addin-dev-certs ist devDependency und
# fehlt damit bewusst -> der Server läuft im Container über HTTP; TLS terminiert
# der vorgelagerte Reverse-Proxy / die Plattform).
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public

# Laufzeitdaten (users.json/usage.json) in ein gemountetes Volume legen.
ENV USERS_FILE=/data/users.json
ENV USAGE_FILE=/data/usage.json
VOLUME ["/data"]

EXPOSE 3001
CMD ["node", "dist/server.js"]
