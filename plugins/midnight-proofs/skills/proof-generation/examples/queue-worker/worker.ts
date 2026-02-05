/**
 * Queue-Based Proof Worker
 *
 * Redis-backed job queue for high-throughput proof generation.
 * Supports multiple workers for horizontal scaling.
 */

import { Worker, Queue, Job } from 'bullmq';
import { createProver, Prover } from '@midnight-ntwrk/midnight-js-prover';
import Redis from 'ioredis';

// Types
interface WitnessData {
  publicInputs: Record<string, unknown>;
  privateInputs: Record<string, unknown>;
}

interface ProofJobData {
  circuitId: string;
  witness: WitnessData;
  requestId: string;
  priority?: number;
}

interface ProofJobResult {
  proof: string;
  circuitId: string;
  duration: number;
}

// Configuration
const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  },
  prover: {
    circuitKeysPath: process.env.CIRCUIT_KEYS_PATH || './circuit-keys',
    memoryLimit: parseInt(process.env.PROVER_MEMORY_LIMIT || '4096'),
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
    timeout: parseInt(process.env.JOB_TIMEOUT || '120000'),
  },
};

// Initialize Redis connection
const redis = new Redis(config.redis);

// Create job queue
const proofQueue = new Queue<ProofJobData, ProofJobResult>('proof-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 1000,
      age: 3600, // Keep completed jobs for 1 hour
    },
    removeOnFail: {
      count: 5000,
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
});

// Initialize prover
let prover: Prover;

async function initializeProver(): Promise<void> {
  console.log('Initializing prover...');

  prover = await createProver({
    circuitKeysPath: config.prover.circuitKeysPath,
    memoryLimit: config.prover.memoryLimit,
  });

  const status = await prover.getStatus();
  console.log('Prover ready:', status);
}

// Job processor
async function processProofJob(job: Job<ProofJobData, ProofJobResult>): Promise<ProofJobResult> {
  const { circuitId, witness, requestId } = job.data;
  const startTime = Date.now();

  console.log(`[${requestId}] Starting proof generation for circuit: ${circuitId}`);

  // Update progress
  await job.updateProgress(10);

  try {
    // Generate proof
    const proof = await prover.prove(circuitId, witness);

    await job.updateProgress(100);

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Proof generated in ${duration}ms`);

    return {
      proof: proof.toString('base64'),
      circuitId,
      duration,
    };
  } catch (error) {
    console.error(`[${requestId}] Proof generation failed:`, error);
    throw error;
  }
}

// Create worker
function createWorker(): Worker<ProofJobData, ProofJobResult> {
  const worker = new Worker<ProofJobData, ProofJobResult>(
    'proof-generation',
    processProofJob,
    {
      connection: redis,
      concurrency: config.worker.concurrency,
      limiter: {
        max: config.worker.concurrency,
        duration: 1000,
      },
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed. Duration: ${result.duration}ms`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });

  return worker;
}

// Helper function to add jobs to queue
export async function submitProofJob(
  circuitId: string,
  witness: WitnessData,
  options?: { priority?: number; requestId?: string }
): Promise<string> {
  const requestId = options?.requestId || crypto.randomUUID();

  const job = await proofQueue.add(
    'generate-proof',
    {
      circuitId,
      witness,
      requestId,
      priority: options?.priority,
    },
    {
      priority: options?.priority,
      jobId: requestId,
    }
  );

  return job.id as string;
}

// Helper function to get job status
export async function getJobStatus(jobId: string): Promise<{
  status: string;
  progress?: number;
  result?: ProofJobResult;
  error?: string;
} | null> {
  const job = await proofQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();

  return {
    status: state,
    progress: job.progress as number,
    result: job.returnvalue ?? undefined,
    error: job.failedReason,
  };
}

// Queue statistics
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const [waiting, active, completed, failed] = await Promise.all([
    proofQueue.getWaitingCount(),
    proofQueue.getActiveCount(),
    proofQueue.getCompletedCount(),
    proofQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down worker...');

  // Close worker (waits for active jobs)
  if (worker) {
    await worker.close();
  }

  // Close prover
  await prover.close();

  // Close Redis
  await redis.quit();

  console.log('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start worker
let worker: Worker<ProofJobData, ProofJobResult>;

async function main(): Promise<void> {
  await initializeProver();

  worker = createWorker();

  console.log(`Proof worker started with concurrency: ${config.worker.concurrency}`);

  // Print queue stats periodically
  setInterval(async () => {
    const stats = await getQueueStats();
    console.log('Queue stats:', stats);
  }, 30000);
}

main().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
