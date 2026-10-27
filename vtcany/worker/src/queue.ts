export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface TranscodeJob {
  id: string;
  sourceUrl: string;
  presets: string[]; // ['p480','p720'] - he thong cu xu ly, worker chi dieu phoi
  status: JobStatus;
  createdAt: number;
}

// Hang doi in-process cho Phase 1.1. Khi co Redis: thay bang BullMQ ma giu
// nguyen interface enqueue/status (da co test bao ve).
export class JobQueue {
  private jobs = new Map<string, TranscodeJob>();

  enqueue(sourceUrl: string, presets = ['p480', 'p720']): TranscodeJob {
    const job: TranscodeJob = {
      id: `job-${Date.now()}`,
      sourceUrl,
      presets,
      status: 'queued',
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  mark(id: string, status: JobStatus): TranscodeJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error('job not found');
    job.status = status;
    return job;
  }

  get(id: string): TranscodeJob {
    const job = this.jobs.get(id);
    if (!job) throw new Error('job not found');
    return job;
  }

  pending(): TranscodeJob[] {
    return [...this.jobs.values()].filter((j) => j.status === 'queued');
  }
}
