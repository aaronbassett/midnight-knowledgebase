# Memory Tuning for Proof Generation

ZK proof generation is memory-intensive. Proper memory configuration is essential for stable and performant prover services.

## Understanding Memory Usage

### Memory Phases During Proof Generation

1. **Circuit Loading** - Loading proving keys into memory (one-time per circuit)
2. **Witness Processing** - Preparing inputs for the prover
3. **Proof Computation** - Memory-intensive ZK proof generation
4. **Result Serialization** - Converting proof to output format

### Memory Patterns

```
Memory Usage
    ^
    |      ┌─────────────────┐
    |      │                 │
    |      │  Proof Gen      │
    |  ┌───┤                 │
    |  │   │                 ├───┐
    |  │   └─────────────────┘   │
    |──┴─────────────────────────┴──> Time
       Load    Compute         GC
```

## Node.js Memory Configuration

### Heap Size

The V8 heap size limits how much memory Node.js can use.

```bash
# Set max heap size to 8GB
export NODE_OPTIONS="--max-old-space-size=8192"

# Or pass directly to node
node --max-old-space-size=8192 prover.js
```

### Recommended Settings by Circuit Complexity

| Circuit Size | Max Heap | Workers per 16GB RAM |
|--------------|----------|---------------------|
| Simple | 2GB | 6-8 |
| Medium | 4GB | 3-4 |
| Complex | 8GB | 2 |

### Garbage Collection Tuning

```bash
# Expose GC for manual triggering
export NODE_OPTIONS="--expose-gc --max-old-space-size=8192"

# Optimize for throughput (larger young generation)
export NODE_OPTIONS="--max-old-space-size=8192 --max-semi-space-size=64"
```

### Manual Garbage Collection

```typescript
// Force GC between proofs to reduce memory pressure
async function proveWithGC(circuitId: string, witness: WitnessData): Promise<Proof> {
  const proof = await prover.prove(circuitId, witness);

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  return proof;
}
```

## Container Memory Limits

### Docker Memory Configuration

```dockerfile
# Dockerfile
FROM node:20-slim

# Set environment variables for Node.js
ENV NODE_OPTIONS="--max-old-space-size=7168"

# Don't run as root
USER node

# Copy application
COPY --chown=node:node . /app
WORKDIR /app

CMD ["node", "prover.js"]
```

```yaml
# docker-compose.yml
services:
  prover:
    build: .
    deploy:
      resources:
        limits:
          memory: 8G
        reservations:
          memory: 4G
    environment:
      - NODE_OPTIONS=--max-old-space-size=7168
```

**Important:** Set Node.js heap slightly below container limit to avoid OOM kills.

### Kubernetes Memory Configuration

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: prover
          resources:
            requests:
              memory: "4Gi"
              cpu: "2"
            limits:
              memory: "8Gi"
              cpu: "4"
          env:
            - name: NODE_OPTIONS
              value: "--max-old-space-size=7168"
```

## Memory Monitoring

### Process Memory Metrics

```typescript
import v8 from 'v8';

function getDetailedMemoryStats(): {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  heapSizeLimit: number;
} {
  const heap = v8.getHeapStatistics();
  const mem = process.memoryUsage();

  return {
    heapUsedMB: Math.round(heap.used_heap_size / 1024 / 1024),
    heapTotalMB: Math.round(heap.total_heap_size / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    arrayBuffersMB: Math.round(mem.arrayBuffers / 1024 / 1024),
    heapSizeLimit: Math.round(heap.heap_size_limit / 1024 / 1024),
  };
}

// Log periodically
setInterval(() => {
  console.log('Memory:', getDetailedMemoryStats());
}, 30000);
```

### Memory Alerts

```typescript
const MEMORY_THRESHOLD = 0.85; // 85% of limit

function checkMemoryPressure(): boolean {
  const stats = v8.getHeapStatistics();
  const usage = stats.used_heap_size / stats.heap_size_limit;

  if (usage > MEMORY_THRESHOLD) {
    console.warn(`High memory pressure: ${(usage * 100).toFixed(1)}%`);
    return true;
  }

  return false;
}

// Check before accepting new proof requests
app.post('/api/prove', async (req, res) => {
  if (checkMemoryPressure()) {
    return res.status(503).json({
      error: 'Service temporarily unavailable due to high memory pressure',
    });
  }

  // Process request...
});
```

## Memory Leak Prevention

### Common Leak Sources

1. **Unbounded caches** - Use LRU caches with size limits
2. **Event listeners** - Remove listeners when done
3. **Closures** - Avoid capturing large objects
4. **Circuit key references** - Clear unused circuits

### Detecting Leaks

```typescript
// Track heap growth over time
let lastHeapUsed = 0;

setInterval(() => {
  const currentHeap = v8.getHeapStatistics().used_heap_size;
  const growth = currentHeap - lastHeapUsed;

  if (growth > 100 * 1024 * 1024) { // 100MB growth
    console.warn(`Potential memory leak: heap grew ${Math.round(growth / 1024 / 1024)}MB`);
  }

  lastHeapUsed = currentHeap;
}, 60000);
```

### Periodic Worker Restart

```typescript
// Restart workers after N proofs to prevent leak accumulation
const MAX_PROOFS_BEFORE_RESTART = 1000;
let proofCount = 0;

async function proveWithRestart(circuitId: string, witness: WitnessData): Promise<Proof> {
  proofCount++;

  if (proofCount >= MAX_PROOFS_BEFORE_RESTART) {
    console.log('Restarting prover to prevent memory accumulation...');
    await prover.close();
    prover = await createProver(config);
    proofCount = 0;
  }

  return await prover.prove(circuitId, witness);
}
```

## Best Practices

1. **Size heap appropriately** - Not too large (GC pauses) or too small (OOM)
2. **Monitor continuously** - Track heap usage over time
3. **Force GC strategically** - Between proofs or during low traffic
4. **Use bounded caches** - Always set max size on caches
5. **Restart workers periodically** - Prevents memory accumulation
6. **Set container limits** - Match heap size to container memory
7. **Test under load** - Verify memory behavior at peak throughput
8. **Profile periodically** - Use heap snapshots to identify leaks
