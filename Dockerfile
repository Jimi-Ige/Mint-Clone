# --- Stage 1: Build client ---
FROM node:20-alpine AS client-build
WORKDIR /app

# Copy workspace config and client package files
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install all dependencies (workspace-aware)
RUN npm ci

# Copy client source and build
COPY client/ client/
RUN npm run build -w client

# --- Stage 2: Build server ---
FROM node:20-alpine AS server-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm ci

COPY server/ server/
RUN npm run build -w server

# --- Stage 3: Production image ---
FROM node:20-alpine AS production
WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=client-build /app/client/dist client/dist
COPY --from=server-build /app/server/dist server/dist

# Copy server .env.example as reference (actual .env comes from environment)
COPY server/.env.example server/.env.example

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
