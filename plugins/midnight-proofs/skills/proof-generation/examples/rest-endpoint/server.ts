/**
 * REST API Proof Generation Server
 *
 * Express server that provides proof generation as a service.
 * Supports both synchronous and asynchronous proof requests.
 */

import express, { Request, Response, NextFunction } from 'express';
import { createProver, Prover, ProverError } from '@midnight-ntwrk/midnight-js-prover';
import { z } from 'zod';
import crypto from 'crypto';

// Types
interface WitnessData {
  publicInputs: Record<string, unknown>;
  privateInputs: Record<string, unknown>;
}

interface ProofJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  circuitId: string;
  createdAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

// In-memory job store (use Redis in production)
const jobs = new Map<string, ProofJob>();

// Request validation schemas
const SyncProofRequestSchema = z.object({
  circuitId: z.string().min(1),
  witness: z.object({
    publicInputs: z.record(z.unknown()),
    privateInputs: z.record(z.unknown()),
  }),
  timeout: z.number().optional().default(60000),
});

const AsyncProofRequestSchema = z.object({
  circuitId: z.string().min(1),
  witness: z.object({
    publicInputs: z.record(z.unknown()),
    privateInputs: z.record(z.unknown()),
  }),
});

// Initialize prover
let prover: Prover;

async function initializeProver(): Promise<void> {
  prover = await createProver({
    circuitKeysPath: process.env.CIRCUIT_KEYS_PATH || './circuit-keys',
    memoryLimit: parseInt(process.env.PROVER_MEMORY_LIMIT || '4096'),
    preloadCircuits: (process.env.PRELOAD_CIRCUITS || '').split(',').filter(Boolean),
  });

  console.log('Prover initialized successfully');
}

// Error handling middleware
function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', error);

  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      details: error.errors,
    });
    return;
  }

  if (error instanceof ProverError) {
    const statusCode = error.code === 'CIRCUIT_NOT_FOUND' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
}

// Create Express app
const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    const status = await prover.getStatus();

    res.json({
      status: status.ready ? 'healthy' : 'degraded',
      proverReady: status.ready,
      activeJobs: status.activeJobs,
      queuedJobs: status.queuedJobs,
      memoryUsage: `${status.memoryUsage}MB / ${status.memoryLimit}MB`,
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

// Synchronous proof generation
app.post('/api/prove', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { circuitId, witness, timeout } = SyncProofRequestSchema.parse(req.body);

    console.log(`Generating proof for circuit: ${circuitId}`);

    // Generate proof with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const proof = await prover.prove(circuitId, witness as WitnessData, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      res.json({
        success: true,
        proof: proof.toString('base64'),
        circuitId,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Asynchronous proof generation - submit job
app.post('/api/prove/async', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { circuitId, witness } = AsyncProofRequestSchema.parse(req.body);

    // Create job
    const jobId = crypto.randomUUID();
    const job: ProofJob = {
      id: jobId,
      status: 'queued',
      circuitId,
      createdAt: new Date(),
    };
    jobs.set(jobId, job);

    // Start proof generation in background
    processJob(jobId, circuitId, witness as WitnessData);

    res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      statusUrl: `/api/prove/status/${jobId}`,
    });
  } catch (error) {
    next(error);
  }
});

// Background job processor
async function processJob(
  jobId: string,
  circuitId: string,
  witness: WitnessData
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';

  try {
    const proof = await prover.prove(circuitId, witness);

    job.status = 'completed';
    job.completedAt = new Date();
    job.result = proof.toString('base64');
  } catch (error) {
    job.status = 'failed';
    job.completedAt = new Date();
    job.error = (error as Error).message;
  }
}

// Check job status
app.get('/api/prove/status/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    res.status(404).json({
      success: false,
      error: 'Job not found',
    });
    return;
  }

  const response: Record<string, unknown> = {
    success: true,
    jobId: job.id,
    status: job.status,
    circuitId: job.circuitId,
    createdAt: job.createdAt.toISOString(),
  };

  if (job.completedAt) {
    response.completedAt = job.completedAt.toISOString();
    response.duration = job.completedAt.getTime() - job.createdAt.getTime();
  }

  if (job.status === 'completed') {
    response.proof = job.result;
  }

  if (job.status === 'failed') {
    response.error = job.error;
  }

  res.json(response);
});

// List circuits
app.get('/api/circuits', async (req: Request, res: Response) => {
  try {
    const status = await prover.getStatus();

    res.json({
      success: true,
      circuits: status.loadedCircuits,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// Error handler
app.use(errorHandler);

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down...');

  // Wait for in-progress jobs
  const inProgress = Array.from(jobs.values()).filter(
    (j) => j.status === 'processing'
  );

  if (inProgress.length > 0) {
    console.log(`Waiting for ${inProgress.length} jobs to complete...`);
    await new Promise((r) => setTimeout(r, 30000));
  }

  await prover.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = parseInt(process.env.PORT || '3000');

initializeProver()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Proof generation server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize prover:', error);
    process.exit(1);
  });
