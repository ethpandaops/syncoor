# Syncoor Docker Compose Setup

This directory contains a Docker Compose configuration for running Syncoor in a distributed monitoring setup.

## Quick Start

### 1. Server Only (Recommended)

Run just the centralized server:

```bash
# Start the server
docker-compose up syncoor-server

# With custom auth token
SYNCOOR_AUTH_TOKEN=your-secret-token docker-compose up syncoor-server
```

The server will be available at:
- API: http://localhost:8080
- Health: http://localhost:8080/health

### 2. Server + Dashboard

Run the server with a web dashboard:

```bash
# Start server and dashboard
docker-compose --profile dashboard up syncoor-server syncoor-dashboard
```

Access the dashboard at: http://localhost:8081

### 3. Server + Example Clients

Run the server with example sync clients:

```bash
# Start server and all sync clients
docker-compose --profile sync-clients up
```

**Note**: Sync clients require Docker socket access and may need additional configuration.

## Configuration

### Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` to customize:

```bash
# Authentication (optional)
SYNCOOR_AUTH_TOKEN=your-secret-token-here

# Logging
LOG_LEVEL=info
```

### Service Profiles

The Docker Compose file uses profiles to organize services:

- **Default**: `syncoor-server` (always starts)
- **`dashboard`**: Web dashboard at port 8081
- **`sync-clients`**: Example sync test clients

## Services

### `syncoor-server`

The centralized monitoring server.

**Ports**: 8080 (HTTP API)  
**Volumes**: `./logs:/app/logs`  
**Health Check**: `GET /health`

**API Endpoints**:
- `GET /api/v1/tests` - List all tests
- `GET /api/v1/tests/{id}` - Get test details
- `GET /api/v1/events` - SSE event stream
- `GET /health` - Health check

### `syncoor-dashboard`

Simple web dashboard for monitoring tests.

**Ports**: 8081 (HTTP)  
**Volumes**: `./dashboard:/usr/share/nginx/html`

### `syncoor-client-*`

Example sync test clients that report to the server.

**Volumes**: 
- Docker socket (for Kurtosis)
- Reports directory
- Docker config

## Usage Examples

### Start Server Only

```bash
# Basic server
docker-compose up syncoor-server

# With authentication
SYNCOOR_AUTH_TOKEN=mytoken docker-compose up syncoor-server

# With debug logging
LOG_LEVEL=debug docker-compose up syncoor-server
```

### Start Server + Dashboard

```bash
# Server and dashboard
docker-compose --profile dashboard up syncoor-server syncoor-dashboard

# In background
docker-compose --profile dashboard up -d syncoor-server syncoor-dashboard
```

### Monitor Logs

```bash
# Server logs
docker-compose logs -f syncoor-server

# All logs
docker-compose logs -f

# Follow new logs
docker-compose logs -f --tail=50
```

### Scale Services

```bash
# Scale to multiple dashboard instances
docker-compose --profile dashboard up --scale syncoor-dashboard=3
```

## API Usage

### Without Authentication

```bash
# List tests
curl http://localhost:8080/api/v1/tests

# Get health
curl http://localhost:8080/health

# Stream events
curl -N http://localhost:8080/api/v1/events
```

### With Authentication

```bash
# Set token
export TOKEN="your-secret-token"

# List tests
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/tests

# Health check (no auth required)
curl http://localhost:8080/health
```

## Running External Clients

Connect external sync clients to the Docker Compose server:

```bash
# Run sync client on host
syncoor sync \
  --server http://localhost:8080 \
  --server-auth your-secret-token \
  --network hoodi \
  --el-client geth \
  --cl-client teku
```

## Volumes and Persistence

### Data Volumes

- **`./logs`**: Server logs
- **`./reports`**: Sync test reports
- **`./dashboard`**: Dashboard files

### Docker Volumes

- **`syncoor-reports`**: Persistent reports storage
- **`syncoor-logs`**: Persistent logs storage

### Cleanup

```bash
# Stop all services
docker-compose down

# Remove volumes
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

## Networking

Services communicate via the `syncoor-net` bridge network:

- **`syncoor-server`**: http://syncoor-server:8080
- **`syncoor-dashboard`**: http://syncoor-dashboard:80

## Health Checks

The server includes a health check:

```bash
# Check server health
docker-compose exec syncoor-server curl -f http://localhost:8080/health

# View health status
docker-compose ps
```

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Check what's using port 8080
   lsof -i :8080
   
   # Use different port
   docker-compose up -e SYNCOOR_SERVER_ADDR=:8081
   ```

2. **Permission denied (Docker socket)**:
   ```bash
   # Add user to docker group
   sudo usermod -aG docker $USER
   
   # Or run with sudo
   sudo docker-compose up
   ```

3. **Auth token not working**:
   ```bash
   # Check token is set
   docker-compose exec syncoor-server env | grep TOKEN
   
   # Test with curl
   curl -H "Authorization: Bearer your-token" http://localhost:8080/api/v1/tests
   ```

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug docker-compose up syncoor-server
```

### View Logs

```bash
# Server logs
docker-compose logs syncoor-server

# All logs with timestamps
docker-compose logs -t

# Follow logs
docker-compose logs -f --tail=100
```

## Production Deployment

For production use:

1. **Use external authentication**:
   ```bash
   SYNCOOR_AUTH_TOKEN=$(openssl rand -hex 32)
   ```

2. **Set up reverse proxy** (nginx, traefik, etc.)

3. **Configure persistent volumes**:
   ```yaml
   volumes:
     - /data/syncoor/logs:/app/logs
     - /data/syncoor/reports:/app/reports
   ```

4. **Set resource limits**:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
         cpus: '0.5'
   ```

5. **Use health checks for monitoring**:
   ```bash
   # Monitor with curl
   curl -f http://localhost:8080/health || alert
   ```

## Integration

### Prometheus Metrics

The server exposes Prometheus metrics:

```bash
curl http://localhost:8080/metrics
```

### Grafana Dashboard

Import the dashboard JSON (if available) to visualize metrics.

### Alert Manager

Set up alerts based on health checks and metrics.