# Multi-stage build for ZJump (backend + frontend + nginx)

# ---------- Stage 1: Build frontend (Vite/React) ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

# Copy frontend sources
COPY ui/zjump-web/package*.json ./
COPY ui/zjump-web/ ./

# Install and build
RUN npm ci --no-audit --no-fund && \
    npm run build

# ---------- Stage 2: Build backend (Go) ----------
# 使用 1.23 版本，并通过 GOTOOLCHAIN=auto 自动下载所需的 toolchain
FROM golang:1.23-alpine AS backend-builder
WORKDIR /build/backend

RUN apk add --no-cache git build-base

# 启用自动工具链下载，以支持 go.mod 中要求的 Go 1.24.0
ENV GOTOOLCHAIN=auto

# Copy go modules first for better cache
COPY go.mod go.sum ./
RUN go mod download

# Copy backend sources
COPY . ./

# Build api-server binary (static)
ENV CGO_ENABLED=0 GOOS=linux GOARCH=amd64
RUN go build -o /out/zjump-api ./cmd/api-server

# ---------- Stage 3: Runtime (nginx + backend) ----------
FROM nginx:alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates bash tzdata && \
    update-ca-certificates

# Copy frontend build to nginx html
COPY --from=frontend-builder /build/frontend/dist /usr/share/nginx/html

# Copy backend binary
COPY --from=backend-builder /out/zjump-api /usr/local/bin/zjump-api

RUN mkdir -p /app/config && mkdir -p /app/logs
# Copy backend config (can be overridden by volume)
COPY config /app/config

# Nginx config (proxy /api to 8080)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Start script to run backend and nginx together
COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# Expose ports: 80 (frontend), 8080 (backend API), 2222 (SSH gateway)
EXPOSE 80 8080 2222

ENV ZJUMP_CONFIG=/app/config/config.yaml \
    ZJUMP_ADDR_HTTP=:8080 \
    ZJUMP_ADDR_SSH=:2222

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/start.sh"]


