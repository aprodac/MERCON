# Build from the repo root: docker build -f backend/api-server/Dockerfile .
FROM node:20-alpine

RUN apk add --no-cache openssl curl

WORKDIR /app

# Workspace manifests first (for layer caching)
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/api-server/package.json ./backend/api-server/
RUN npm install --workspace=@mercon/shared-types --workspace=@mercon/api-server --ignore-scripts && npm cache clean --force


# Shared types (built explicitly since --ignore-scripts skips prepare)
COPY packages/shared-types ./packages/shared-types
RUN npm run build -w @mercon/shared-types

# Prisma client
COPY backend/api-server/prisma ./backend/api-server/prisma
RUN cd backend/api-server && npx prisma generate

# API source + build
COPY backend/api-server ./backend/api-server
RUN npm run build -w @mercon/api-server

WORKDIR /app/backend/api-server
RUN mkdir -p /app/backend/api-server/uploads && chown -R node:node /app

EXPOSE 3000

# node:20-alpine ships a built-in unprivileged 'node' user (uid 1000) — run as
# that instead of root. Bind-mounted upload dirs are chmod 777 on the host by
# CI, so this doesn't affect their write access.
USER node

# Start command: serve compiled Node app.
# Migrations are executed in CI/CD before replacing the running container.
CMD ["node", "dist/index.js"]

