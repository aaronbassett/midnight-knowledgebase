# Optimized Prover Service Dockerfile
#
# Multi-stage build for a production-ready ZK proof generation service.
# Includes memory optimization and health check configuration.

# ============================================
# Stage 1: Build
# ============================================
FROM node:20-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build if TypeScript
RUN npm run build --if-present

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-slim AS production

# Labels
LABEL maintainer="Midnight Knowledgebase"
LABEL description="ZK Proof Generation Service"

# Create non-root user
RUN groupadd -r prover && useradd -r -g prover prover

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package.json ./

# Copy circuit keys (pre-compiled)
# In production, mount these as a volume instead
# COPY circuit-keys ./circuit-keys

# Environment configuration
ENV NODE_ENV=production

# Memory configuration
# Set heap to 7GB to leave headroom for container overhead
ENV NODE_OPTIONS="--max-old-space-size=7168 --expose-gc"

# Prover-specific settings
ENV PROVER_MEMORY_LIMIT=7168
ENV PROVER_THREADS=4
ENV PROVER_PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PROVER_PORT}/health || exit 1

# Switch to non-root user
USER prover

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.js"]


# ============================================
# Docker Compose Configuration (docker-compose.yml)
# ============================================
# version: '3.8'
#
# services:
#   prover:
#     build:
#       context: .
#       dockerfile: Dockerfile
#     deploy:
#       resources:
#         limits:
#           cpus: '4'
#           memory: 8G
#         reservations:
#           cpus: '2'
#           memory: 4G
#       restart_policy:
#         condition: on-failure
#         delay: 5s
#         max_attempts: 3
#     ports:
#       - "3000:3000"
#     volumes:
#       - ./circuit-keys:/app/circuit-keys:ro
#     environment:
#       - NODE_OPTIONS=--max-old-space-size=7168 --expose-gc
#       - PROVER_MEMORY_LIMIT=7168
#       - PROVER_THREADS=4
#       - PROVER_PRELOAD_CIRCUITS=transfer,mint,burn
#       - REDIS_URL=redis://redis:6379
#     depends_on:
#       - redis
#     networks:
#       - prover-network
#     logging:
#       driver: "json-file"
#       options:
#         max-size: "10m"
#         max-file: "3"
#
#   redis:
#     image: redis:7-alpine
#     deploy:
#       resources:
#         limits:
#           memory: 512M
#     volumes:
#       - redis-data:/data
#     networks:
#       - prover-network
#
# volumes:
#   redis-data:
#
# networks:
#   prover-network:
#     driver: bridge


# ============================================
# Kubernetes Deployment (deployment.yaml)
# ============================================
# apiVersion: apps/v1
# kind: Deployment
# metadata:
#   name: prover-service
#   labels:
#     app: prover
# spec:
#   replicas: 3
#   selector:
#     matchLabels:
#       app: prover
#   template:
#     metadata:
#       labels:
#         app: prover
#     spec:
#       containers:
#         - name: prover
#           image: prover-service:latest
#           ports:
#             - containerPort: 3000
#           resources:
#             requests:
#               memory: "4Gi"
#               cpu: "2"
#             limits:
#               memory: "8Gi"
#               cpu: "4"
#           env:
#             - name: NODE_OPTIONS
#               value: "--max-old-space-size=7168 --expose-gc"
#             - name: PROVER_MEMORY_LIMIT
#               value: "7168"
#             - name: PROVER_THREADS
#               value: "4"
#           volumeMounts:
#             - name: circuit-keys
#               mountPath: /app/circuit-keys
#               readOnly: true
#           livenessProbe:
#             httpGet:
#               path: /health
#               port: 3000
#             initialDelaySeconds: 60
#             periodSeconds: 30
#           readinessProbe:
#             httpGet:
#               path: /health
#               port: 3000
#             initialDelaySeconds: 30
#             periodSeconds: 10
#       volumes:
#         - name: circuit-keys
#           configMap:
#             name: circuit-keys
#       affinity:
#         podAntiAffinity:
#           preferredDuringSchedulingIgnoredDuringExecution:
#             - weight: 100
#               podAffinityTerm:
#                 labelSelector:
#                   matchLabels:
#                     app: prover
#                 topologyKey: kubernetes.io/hostname
