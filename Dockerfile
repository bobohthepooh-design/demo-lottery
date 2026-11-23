# syntax=docker/dockerfile:1

# ---------- Stage 1: build frontend ----------
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---------- Stage 2: production server ----------
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
ENV NODE_ENV=production
WORKDIR /app

# non-root user
RUN addgroup -S app && adduser -S app -G app

# server deps (prod only)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force

# server source + built client (layout must match config.js path resolution)
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

# data dir for SQLite (mount a volume here in production)
RUN mkdir -p /app/server/data && chown -R app:app /app
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "server/src/index.js"]
