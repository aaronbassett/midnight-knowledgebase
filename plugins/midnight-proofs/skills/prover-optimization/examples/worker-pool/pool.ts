/**
 * Prover Worker Pool
 *
 * Multi-process worker pool for parallel proof generation.
 * Supports dynamic scaling, health monitoring, and graceful shutdown.
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import os from 'os';
import v8 from 'v8';

// Types
interface ProofRequest {
  circuitId: string;
  witness: Record<string, unknown>;
}

interface ProofResult {
  proof: string;  // base64 encoded
  circuitId: string;
  duration: number;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  proofCount: number;
  lastProofTime: number;
  memoryUsage: number;
}

interface PoolConfig {
  minWorkers: number;
  maxWorkers: number;
  workerScript: string;
  maxProofsPerWorker: number;
  workerTimeout: number;
  memoryThreshold: number;  // MB
}

interface Task {
  id: string;
  request: ProofRequest;
  resolve: (result: ProofResult) => void;
  reject: (error: Error) => void;
  createdAt: number;
}

// Worker Pool implementation
export class ProverWorkerPool extends EventEmitter {
  private config: PoolConfig;
  private workers: Map<number, WorkerState> = new Map();
  private taskQueue: Task[] = [];
  private nextWorkerId = 0;
  private shuttingDown = false;

  // Metrics
  private totalProofs = 0;
  private totalErrors = 0;
  private totalDuration = 0;

  constructor(config: Partial<PoolConfig> = {}) {
    super();

    this.config = {
      minWorkers: config.minWorkers ?? Math.max(1, Math.floor(os.cpus().length / 2)),
      maxWorkers: config.maxWorkers ?? os.cpus().length - 1,
      workerScript: config.workerScript ?? './proof-worker.js',
      maxProofsPerWorker: config.maxProofsPerWorker ?? 500,
      workerTimeout: config.workerTimeout ?? 120000,
      memoryThreshold: config.memoryThreshold ?? 7000,
    };
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    console.log(`Initializing worker pool with ${this.config.minWorkers} workers`);

    for (let i = 0; i < this.config.minWorkers; i++) {
      await this.spawnWorker();
    }

    // Start health monitoring
    this.startHealthMonitor();
  }

  /**
   * Submit a proof request to the pool
   */
  async prove(request: ProofRequest): Promise<ProofResult> {
    if (this.shuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    return new Promise((resolve, reject) => {
      const task: Task = {
        id: crypto.randomUUID(),
        request,
        resolve,
        reject,
        createdAt: Date.now(),
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    const availableWorker = this.findAvailableWorker();

    if (availableWorker) {
      const task = this.taskQueue.shift()!;
      this.dispatchTask(availableWorker, task);
    } else if (this.workers.size < this.config.maxWorkers) {
      // Scale up if possible
      this.spawnWorker().then(() => this.processQueue());
    }
  }

  /**
   * Find an available worker
   */
  private findAvailableWorker(): WorkerState | undefined {
    for (const state of this.workers.values()) {
      if (!state.busy && state.proofCount < this.config.maxProofsPerWorker) {
        return state;
      }
    }
    return undefined;
  }

  /**
   * Dispatch a task to a worker
   */
  private dispatchTask(state: WorkerState, task: Task): void {
    state.busy = true;

    // Set up timeout
    const timeout = setTimeout(() => {
      state.worker.terminate();
      task.reject(new Error('Proof generation timeout'));
      this.replaceWorker(state);
    }, this.config.workerTimeout);

    // Send task to worker
    state.worker.postMessage({
      type: 'prove',
      id: task.id,
      request: task.request,
    });

    // Handle response
    const messageHandler = (message: any) => {
      if (message.id !== task.id) return;

      clearTimeout(timeout);
      state.worker.off('message', messageHandler);
      state.busy = false;
      state.proofCount++;
      state.lastProofTime = Date.now();

      if (message.error) {
        this.totalErrors++;
        task.reject(new Error(message.error));
      } else {
        this.totalProofs++;
        this.totalDuration += message.result.duration;
        task.resolve(message.result);
      }

      // Check if worker should be recycled
      if (state.proofCount >= this.config.maxProofsPerWorker) {
        this.recycleWorker(state);
      }

      // Process next task
      this.processQueue();
    };

    state.worker.on('message', messageHandler);
  }

  /**
   * Spawn a new worker
   */
  private async spawnWorker(): Promise<WorkerState> {
    const workerId = this.nextWorkerId++;

    console.log(`Spawning worker ${workerId}`);

    const worker = new Worker(this.config.workerScript, {
      workerData: { workerId },
    });

    const state: WorkerState = {
      worker,
      busy: false,
      proofCount: 0,
      lastProofTime: 0,
      memoryUsage: 0,
    };

    // Wait for worker to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, 30000);

      worker.once('message', (message) => {
        if (message.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      });

      worker.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    worker.on('error', (error) => {
      console.error(`Worker ${workerId} error:`, error);
      this.replaceWorker(state);
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !this.shuttingDown) {
        console.warn(`Worker ${workerId} exited with code ${code}`);
        this.workers.delete(workerId);
        this.spawnWorker();
      }
    });

    this.workers.set(workerId, state);
    this.emit('workerSpawned', workerId);

    return state;
  }

  /**
   * Recycle a worker (graceful replacement)
   */
  private async recycleWorker(state: WorkerState): Promise<void> {
    console.log('Recycling worker after', state.proofCount, 'proofs');

    // Find worker ID
    let workerId: number | undefined;
    for (const [id, s] of this.workers) {
      if (s === state) {
        workerId = id;
        break;
      }
    }

    if (workerId !== undefined) {
      this.workers.delete(workerId);
      await state.worker.terminate();
      await this.spawnWorker();
    }
  }

  /**
   * Replace a failed worker
   */
  private async replaceWorker(state: WorkerState): Promise<void> {
    for (const [id, s] of this.workers) {
      if (s === state) {
        this.workers.delete(id);
        break;
      }
    }

    try {
      await state.worker.terminate();
    } catch {
      // Ignore termination errors
    }

    if (!this.shuttingDown) {
      await this.spawnWorker();
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitor(): void {
    setInterval(() => {
      this.checkWorkerHealth();
      this.checkMemoryPressure();
      this.checkScaling();
    }, 10000);
  }

  /**
   * Check worker health
   */
  private checkWorkerHealth(): void {
    const now = Date.now();

    for (const [id, state] of this.workers) {
      // Check for stuck workers
      if (state.busy && now - state.lastProofTime > this.config.workerTimeout) {
        console.warn(`Worker ${id} appears stuck, replacing`);
        this.replaceWorker(state);
      }
    }
  }

  /**
   * Check memory pressure
   */
  private checkMemoryPressure(): void {
    const heapStats = v8.getHeapStatistics();
    const heapUsedMB = Math.round(heapStats.used_heap_size / 1024 / 1024);

    if (heapUsedMB > this.config.memoryThreshold) {
      console.warn(`High memory pressure: ${heapUsedMB}MB`);

      // Reject new tasks if memory is critical
      if (heapUsedMB > this.config.memoryThreshold * 0.95) {
        const queuedTasks = this.taskQueue.splice(0);
        queuedTasks.forEach((task) => {
          task.reject(new Error('Service unavailable due to high memory pressure'));
        });
      }
    }
  }

  /**
   * Check if scaling is needed
   */
  private checkScaling(): void {
    const busyWorkers = Array.from(this.workers.values()).filter((w) => w.busy).length;
    const totalWorkers = this.workers.size;
    const queueLength = this.taskQueue.length;

    // Scale up if queue is growing and we have capacity
    if (queueLength > 0 && busyWorkers === totalWorkers && totalWorkers < this.config.maxWorkers) {
      this.spawnWorker();
    }

    // Scale down if workers are idle
    if (queueLength === 0 && busyWorkers === 0 && totalWorkers > this.config.minWorkers) {
      const idleWorker = Array.from(this.workers.entries()).find(([, s]) => !s.busy);
      if (idleWorker) {
        const [id, state] = idleWorker;
        this.workers.delete(id);
        state.worker.terminate();
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    workers: number;
    busyWorkers: number;
    queueLength: number;
    totalProofs: number;
    totalErrors: number;
    avgDuration: number;
  } {
    const busyWorkers = Array.from(this.workers.values()).filter((w) => w.busy).length;

    return {
      workers: this.workers.size,
      busyWorkers,
      queueLength: this.taskQueue.length,
      totalProofs: this.totalProofs,
      totalErrors: this.totalErrors,
      avgDuration: this.totalProofs > 0 ? Math.round(this.totalDuration / this.totalProofs) : 0,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down worker pool...');
    this.shuttingDown = true;

    // Reject queued tasks
    const queuedTasks = this.taskQueue.splice(0);
    queuedTasks.forEach((task) => {
      task.reject(new Error('Worker pool shutting down'));
    });

    // Wait for busy workers
    const busyWorkers = Array.from(this.workers.values()).filter((w) => w.busy);
    if (busyWorkers.length > 0) {
      console.log(`Waiting for ${busyWorkers.length} workers to finish...`);
      await new Promise((r) => setTimeout(r, 10000));
    }

    // Terminate all workers
    await Promise.all(
      Array.from(this.workers.values()).map((s) => s.worker.terminate())
    );

    this.workers.clear();
    console.log('Worker pool shut down');
  }
}

// Factory function
export function createProverPool(config?: Partial<PoolConfig>): ProverWorkerPool {
  return new ProverWorkerPool(config);
}

// Example usage
async function main(): Promise<void> {
  const pool = createProverPool({
    minWorkers: 2,
    maxWorkers: 4,
    workerScript: './proof-worker.js',
  });

  await pool.initialize();

  console.log('Pool initialized:', pool.getStats());

  // Submit proof requests
  const requests = Array.from({ length: 10 }, (_, i) => ({
    circuitId: 'transfer',
    witness: { index: i },
  }));

  const results = await Promise.all(
    requests.map((req) => pool.prove(req).catch((e) => ({ error: e.message })))
  );

  console.log('Results:', results);
  console.log('Final stats:', pool.getStats());

  await pool.shutdown();
}

main().catch(console.error);
