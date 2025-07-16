.PHONY: build test lint clean install deps

# Build configuration
BINARY_NAME=syncoor
BINARY_PATH=./bin/$(BINARY_NAME)
CMD_PATH=./cmd/syncoor

# Go configuration
GO_VERSION=1.23
LDFLAGS=-w -s

# Default target
all: clean deps test lint build

# Build the binary
build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p bin
	@go build -ldflags "$(LDFLAGS)" -o $(BINARY_PATH) $(CMD_PATH)

# Run tests
test:
	@echo "Running tests..."
	@go test -v -race -cover ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	@go test -v -race -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out -o coverage.html

# Run linting
lint:
	@echo "Running linter..."
	@golangci-lint run --new-from-rev="origin/master"

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf bin/
	@rm -f coverage.out coverage.html

# Install dependencies
deps:
	@echo "Installing dependencies..."
	@go mod tidy
	@go mod download

# Install the binary
install: build
	@echo "Installing $(BINARY_NAME)..."
	@cp $(BINARY_PATH) $(GOPATH)/bin/

# Format code
fmt:
	@echo "Formatting code..."
	@go fmt ./...
	@goimports -w .

# Run all checks
check: deps test lint

# Development workflow
dev: clean deps fmt test lint build