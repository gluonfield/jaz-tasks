FROM oven/bun:1.3-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

FROM golang:1.26-alpine AS server
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
COPY httpx/ /httpx/
RUN go mod download
COPY backend/ ./
COPY --from=web /backend/internal/httpapi/mcpapi/app/mcp-app.html internal/httpapi/mcpapi/app/mcp-app.html
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /out/server /app/server
COPY --from=web /web/dist/client /app/web
ENV ADDR=:7400 WEB_DIR=/app/web
EXPOSE 7400
ENTRYPOINT ["/app/server"]
