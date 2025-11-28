
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git make
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Use make build for consistent build process
ARG VERSION
RUN make build

FROM alpine:latest
ARG KURTOSIS_VERSION=1.13.2
RUN apk add --no-cache ca-certificates bash docker-cli curl jq && \
    if [ "$KURTOSIS_VERSION" = "latest" ]; then \
        KURTOSIS_VERSION=$(curl -s https://api.github.com/repos/kurtosis-tech/kurtosis-cli-release-artifacts/releases/latest | jq -r .tag_name); \
    fi && \
    ARCH=$(uname -m) && \
    case ${ARCH} in \
        x86_64) KURTOSIS_ARCH="amd64" ;; \
        aarch64) KURTOSIS_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac && \
    curl -L "https://github.com/kurtosis-tech/kurtosis-cli-release-artifacts/releases/download/${KURTOSIS_VERSION}/kurtosis-cli_${KURTOSIS_VERSION}_linux_${KURTOSIS_ARCH}.tar.gz" | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/kurtosis && \
    echo "00000000000000000000000000001337" > /etc/machine-id && \
    /usr/local/bin/kurtosis analytics disable
WORKDIR /app
COPY --from=builder /app/bin/syncoor /usr/local/bin/syncoor
ENTRYPOINT ["syncoor"]
CMD ["--help"]
