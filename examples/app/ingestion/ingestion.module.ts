/**
 * Ingestion module. It needs to know whether a channel exists, but never imports the
 * channel module: it declares the `ChannelLookup` port in its prerequisites and the
 * app provides it (here, structurally, from the channel module's `channels` binding).
 */
import { defineModule } from '../../../src/index.js';
import type { Route } from '../shared/http.js';
import type { Pool, TemporalClient } from '../shared/resources.js';

export interface ChannelLookup {
  exists(channelId: string): Promise<boolean>;
}

export interface Recording {
  id: string;
  channelId: string;
}

interface OutboxEvent {
  id: string;
  type: 'recording.detected';
  recordingId: string;
}

class RecordingRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Recording | undefined> {
    const sql = 'select * from ingestion.recordings where id = $1';
    const { rows } = await this.pool.query<Recording>(sql, [id]);
    return rows[0];
  }

  /** Saves the recording and its event together, like a transactional outbox. */
  async saveDetected(recording: Recording): Promise<void> {
    const event: OutboxEvent = {
      id: `recording.detected:${recording.id}`,
      type: 'recording.detected',
      recordingId: recording.id,
    };
    await this.pool.query('insert into ingestion.recordings', [recording]);
    await this.pool.query('insert into ingestion.outbox', [event]);
  }
}

class RecordingProcessStarter {
  constructor(private readonly temporal: TemporalClient) {}

  start(recordingId: string): Promise<void> {
    return this.temporal.workflow.start('processRecording', {
      workflowId: `process-recording-${recordingId}`,
      taskQueue: 'orchestrator',
      args: [recordingId],
    });
  }
}

type ProcessingResult = { ok: true } | { ok: false; code: string; message: string };

class RequestRecordingProcessingUseCase {
  constructor(
    private readonly recordings: RecordingRepository,
    private readonly channels: ChannelLookup,
    private readonly starter: RecordingProcessStarter,
  ) {}

  async execute(recordingId: string): Promise<ProcessingResult> {
    const recording = await this.recordings.findById(recordingId);
    if (!recording) {
      const message = `Recording '${recordingId}' does not exist, wait for it to be detected.`;
      return { ok: false, code: 'RECORDING_NOT_FOUND', message };
    }
    if (!(await this.channels.exists(recording.channelId))) {
      const message = `Channel '${recording.channelId}' does not exist, create it first.`;
      return { ok: false, code: 'CHANNEL_NOT_FOUND', message };
    }

    await this.starter.start(recordingId);
    return { ok: true };
  }
}

/** Publishes pending outbox events. The deterministic workflowId makes a redelivery harmless. */
class OutboxRelay {
  constructor(
    private readonly pool: Pool,
    private readonly starter: RecordingProcessStarter,
  ) {}

  async flush(): Promise<void> {
    const { rows } = await this.pool.query<OutboxEvent>('select * from ingestion.outbox');
    for (const event of rows) {
      await this.starter.start(event.recordingId);
      await this.pool.query('delete from ingestion.outbox where id = $1', [event.id]);
    }
  }
}

function recordingRoutes(requestProcessing: RequestRecordingProcessingUseCase): Route[] {
  return [
    {
      method: 'POST',
      path: '/recordings/:id/process',
      async handle({ id = '' }) {
        const result = await requestProcessing.execute(id);
        if (result.ok) return { status: 202, body: { recordingId: id } };
        return { status: 404, body: { code: result.code, message: result.message } };
      },
    },
  ];
}

export const ingestionModule = defineModule<{
  pool: Pool;
  temporal: TemporalClient;
  channels: ChannelLookup;
}>()((b) =>
  b
    .add('recordings', (c) => new RecordingRepository(c.pool))
    .add('recordingProcessStarter', (c) => new RecordingProcessStarter(c.temporal))
    .add(
      'requestRecordingProcessing',
      (c) =>
        new RequestRecordingProcessingUseCase(c.recordings, c.channels, c.recordingProcessStarter),
    )
    .add('ingestionOutbox', (c) => new OutboxRelay(c.pool, c.recordingProcessStarter))
    .add('recordingRoutes', (c) => recordingRoutes(c.requestRecordingProcessing))
    // Plain functions handed to the Temporal worker: the only bridge from workflows to bindings.
    .add('ingestionActivities', (c) => ({
      detectRecording: (recording: Recording) => c.recordings.saveDetected(recording),
      loadRecording: (recordingId: string) => c.recordings.findById(recordingId),
    })),
);
