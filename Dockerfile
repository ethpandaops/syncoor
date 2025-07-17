
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git make
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o syncoor ./cmd/syncoor

FROM alpine:latest
RUN apk add --no-cache ca-certificates bash docker-cli curl && \
    curl -L "https://github.com/kurtosis-tech/kurtosis-cli-release-artifacts/releases/download/1.10.2/kurtosis-cli_1.10.2_linux_amd64.tar.gz" | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/kurtosis && \
    addgroup -g 1000 syncoor && \
    adduser -u 1000 -G syncoor -s /bin/sh -D syncoor
WORKDIR /app
COPY --from=builder /app/syncoor /usr/local/bin/syncoor
RUN mkdir -p /app/reports && \
    chown -R syncoor:syncoor /app
USER syncoor
ENTRYPOINT ["syncoor"]
