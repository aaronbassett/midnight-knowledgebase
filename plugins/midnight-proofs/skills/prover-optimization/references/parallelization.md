# Parallelization for Proof Generation

Parallel proof generation enables high-throughput prover services by utilizing multiple CPU cores and worker processes.

## Parallelization Strategies

### 1. Worker Threads (Single Process)

Use Node.js worker threads for CPU-bound proof generation.

**Pros:**
- Shared memory for circuit keys
- Lower overhead than processes
- Simpler deployment

**Cons:**
- Shares heap with main thread
- V8 heap limits apply to entire process

```typescript
import { Worker, isMainThread, parentPort } from 'worker_threads';

if (isMainThread) {
  // Main thread dispatches work
  const worker = new Worker(__filename);

  worker.postMessage({ circuitId: 'transfer', witness: witnessData });

  worker.on('message', (result) => {
    console.log('Proof generated:', result);
  });
} else {
  // Worker thread handles proof generation
  parentPort?.on('message', async (data) => {
    const proof = await prover.prove(data.circuitId, data.witness);
    parentPort?.postMessage({ proof: proof.toString('base64') });
  });
}
```

### 2. Worker Processes (Multi-Process)

Use separate processes for better isolation and memory management.

**Pros:**
- Independent memory per worker
- Can restart workers individually
- Better fault isolation

**Cons:**
- Higher memory overhead (circuit keys duplicated)
- IPC overhead for communication

```typescript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numWorkers = Math.floor(os.cpus().length / 2);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code) => {
    console.log(`Worker ${worker.process.pid} died (${code})`);
    cluster.fork(); // Replace dead worker
  });
} else {
  // Worker process runs prover service
  startProverServer();
}
```

### 3. Job Queue with Workers

Use a job queue (Redis/BullMQ) with multiple worker processes.

**Pros:**
- Horizontal scaling
- Built-in retry and failure handling
- Distributed across machines

**Cons:**
- Additional infrastructure (Redis)
- Network latency for job dispatch

## Determining Optimal Parallelism

### Formula

```
Optimal Workers = Available Memory / (Memory per Proof + Overhead)
```

### Memory-Based Calculation

| Available RAM | Memory per Proof | Recommended Workers |
|---------------|------------------|---------------------|
| 8GB | 2GB | 3-4 |
| 16GB | 2GB | 6-7 |
| 32GB | 4GB | 7-8 |
| 64GB | 4GB | 14-15 |

### CPU-Based Limits

Don't exceed CPU cores. Proof generation is CPU-bound:

```typescript
const os = require('os');

// Leave 1-2 cores for OS and other tasks
const maxWorkers = Math.max(1, os.cpus().length - 2);
```

### Combined Calculation

```typescript
function calculateOptimalWorkers(): number {
  const totalMemoryMB = os.totalmem() / 1024 / 1024;
  const cpuCount = os.cpus().length;
  const memoryPerProofMB = 2048; // Adjust based on circuits
  const overheadMB = 512;

  const memoryBasedLimit = Math.floor(
    (totalMemoryMB - 2048) / (memoryPerProofMB + overheadMB)
  );

  const cpuBasedLimit = cpuCount - 2;

  return Math.max(1, Math.min(memoryBasedLimit, cpuBasedLimit));
}
```

## Worker Pool Implementation

### Basic Worker Pool

```typescript
interface WorkerTask<T, R> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

class WorkerPool<T, R> {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: WorkerTask<T, R>[] = [];

  constructor(
    private workerScript: string,
    private poolSize: number
  ) {
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerScript);

      worker.on('message', (result) => {
        this.handleWorkerResult(worker, result);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(worker, error);
      });

      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  async execute(data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<T, R> = {
        id: crypto.randomUUID(),
        data,
        resolve,
        reject,
      };

      if (this.availableWorkers.length > 0) {
        this.dispatchTask(task);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  private dispatchTask(task: WorkerTask<T, R>): void {
    const worker = this.availableWorkers.pop()!;
    (worker as any).currentTask = task;
    worker.postMessage({ id: task.id, data: task.data });
  }

  private handleWorkerResult(worker: Worker, result: any): void {
    const task = (worker as any).currentTask as WorkerTask<T, R>;
    delete (worker as any).currentTask;

    task.resolve(result.data);

    this.availableWorkers.push(worker);
    this.processQueue();
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    const task = (worker as any).currentTask as WorkerTask<T, R>;
    if (task) {
      delete (worker as any).currentTask;
      task.reject(error);
    }

    // Replace dead worker
    this.replaceWorker(worker);
    this.processQueue();
  }

  private replaceWorker(deadWorker: Worker): void {
    const index = this.workers.indexOf(deadWorker);
    if (index !== -1) {
      const newWorker = new Worker(this.workerScript);
      newWorker.on('message', (r) => this.handleWorkerResult(newWorker, r));
      newWorker.on('error', (e) => this.handleWorkerError(newWorker, e));

      this.workers[index] = newWorker;
      this.availableWorkers.push(newWorker);
    }
  }

  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift()!;
      this.dispatchTask(task);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
```

### Using the Worker Pool

```typescript
const pool = new WorkerPool<ProofRequest, ProofResult>(
  './proof-worker.js',
  calculateOptimalWorkers()
);

// Process proof requests
app.post('/api/prove', async (req, res) => {
  try {
    const result = await pool.execute({
      circuitId: req.body.circuitId,
      witness: req.body.witness,
    });

    res.json({ success: true, proof: result.proof });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Load Balancing Strategies

### Round-Robin

```typescript
class RoundRobinBalancer {
  private currentIndex = 0;
  private workers: Worker[];

  constructor(workers: Worker[]) {
    this.workers = workers;
  }

  getNextWorker(): Worker {
    const worker = this.workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.workers.length;
    return worker;
  }
}
```

### Least-Loaded

```typescript
class LeastLoadedBalancer {
  private workerLoads = new Map<Worker, number>();

  constructor(workers: Worker[]) {
    workers.forEach((w) => this.workerLoads.set(w, 0));
  }

  getNextWorker(): Worker {
    let minLoad = Infinity;
    let selectedWorker: Worker | null = null;

    for (const [worker, load] of this.workerLoads) {
      if (load < minLoad) {
        minLoad = load;
        selectedWorker = worker;
      }
    }

    return selectedWorker!;
  }

  taskStarted(worker: Worker): void {
    this.workerLoads.set(worker, (this.workerLoads.get(worker) || 0) + 1);
  }

  taskCompleted(worker: Worker): void {
    this.workerLoads.set(worker, Math.max(0, (this.workerLoads.get(worker) || 0) - 1));
  }
}
```

## Monitoring Parallelism

### Metrics to Track

```typescript
import { Gauge, Counter } from 'prom-client';

const activeWorkers = new Gauge({
  name: 'prover_active_workers',
  help: 'Number of workers currently processing proofs',
});

const queuedTasks = new Gauge({
  name: 'prover_queued_tasks',
  help: 'Number of tasks waiting in queue',
});

const workerRestarts = new Counter({
  name: 'prover_worker_restarts_total',
  help: 'Total number of worker restarts',
});

// Update metrics
setInterval(() => {
  activeWorkers.set(pool.activeCount);
  queuedTasks.set(pool.queueLength);
}, 5000);
```

## Best Practices

1. **Size pool based on resources** - Balance memory and CPU limits
2. **Use job queues for distributed systems** - Redis/BullMQ for scaling
3. **Monitor worker health** - Restart unhealthy workers automatically
4. **Implement backpressure** - Reject requests when queue is full
5. **Use least-loaded balancing** - For variable proof times
6. **Isolate workers** - Process per worker for better fault isolation
7. **Preload circuits per worker** - Avoid repeated loading
8. **Log per-worker metrics** - Track individual worker performance
