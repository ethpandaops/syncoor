
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git make
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Use make build for consistent build process
ARG VERSION
RUN make build

FROM alpine:latest
RUN apk add --no-cache ca-certificates bash docker-cli curl && \
    curl -L "https://github.com/kurtosis-tech/kurtosis-cli-release-artifacts/releases/download/1.10.2/kurtosis-cli_1.10.2_linux_amd64.tar.gz" | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/kurtosis && \
    echo "00000000000000000000000000001337" > /etc/machine-id && \
    /usr/local/bin/kurtosis analytics disable
WORKDIR /app
COPY --from=builder /app/bin/syncoor /usr/local/bin/syncoor
ENTRYPOINT ["syncoor"]
CMD ["--help"]
