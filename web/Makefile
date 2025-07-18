.PHONY: help setup dev build lint preview clean deploy

# Variables
S3_BUCKET ?= your-bucket-name
S3_REGION ?= auto
S3_PROVIDER ?= Cloudflare
S3_ENDPOINT ?= $(CLOUDFLARE_R2_ENDPOINT)

# Default target
help:
	@echo "Available commands:"
	@echo "  setup    - Install dependencies"
	@echo "  dev      - Run development server"
	@echo "  build    - Build the application"
	@echo "  lint     - Run linter"
	@echo "  preview  - Preview production build"
	@echo "  clean    - Clean build artifacts"
	@echo "  deploy   - Deploy to S3 bucket"

setup:
	@echo "Installing dependencies..."
	npm install

dev:
	@echo "Starting development server..."
	npm run dev

build:
	@echo "Building application..."
	rm -rf dist
	npm run build

lint:
	@echo "Running linter..."
	npm run lint

preview:
	@echo "Previewing production build..."
	npm run preview

deploy: build
	@echo "Deploying to S3 bucket..."
	@RCLONE_CONFIG_MYS3_TYPE=s3 \
		RCLONE_CONFIG_MYS3_BUCKET=$(S3_BUCKET) \
		RCLONE_CONFIG_MYS3_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) \
		RCLONE_CONFIG_MYS3_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
		RCLONE_CONFIG_MYS3_REGION=$(S3_REGION) \
		RCLONE_CONFIG_MYS3_PROVIDER=$(S3_PROVIDER) \
		RCLONE_CONFIG_MYS3_ENDPOINT=$(S3_ENDPOINT) \
		RCLONE_CONFIG_MYS3_NO_CHECK_BUCKET=true \
		rclone copy dist mys3://$(S3_BUCKET) --no-traverse --progress

clean:
	@echo "Cleaning build artifacts..."
	rm -rf node_modules
	rm -rf dist
