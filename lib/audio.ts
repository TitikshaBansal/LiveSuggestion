'use client';

// MediaRecorder wrapper using a stop/restart-per-segment pattern: every
// chunk we upload is a *complete* webm file with proper headers, not a
// mid-stream fragment. This matters because Whisper rejects fragments —
// requestData() on a running recorder emits continuation bytes that aren't
// standalone-playable, which was producing 400s from /api/transcribe.

export interface AudioControllerOpts {
  chunkMs: number;
  onTranscript: (text: string) => void;
  onError: (err: Error) => void;
  getApiKey: () => string;
}

export class AudioController {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private currentChunks: Blob[] = [];
  private uploadQueue: Promise<void> = Promise.resolve();
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private mimeType = '';
  private opts: AudioControllerOpts;

  constructor(opts: AudioControllerOpts) {
    this.opts = opts;
  }

  get isRecording(): boolean {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  async start(): Promise<void> {
    if (this.isRecording) return;
    this.stopping = false;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mimeType = this.pickMime();
    this.beginSegment();
  }

  // Cut the current segment now, upload it, then start a new segment.
  async flush(): Promise<void> {
    if (!this.isRecording) return;
    await this.cutAndUpload();
    if (!this.stopping) this.beginSegment();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.clearChunkTimer();
    if (this.isRecording) await this.cutAndUpload();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
  }

  // ---------- internals ----------

  private beginSegment(): void {
    if (!this.stream || this.stopping) return;
    const rec = new MediaRecorder(
      this.stream,
      this.mimeType ? { mimeType: this.mimeType } : undefined,
    );
    this.currentChunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.currentChunks.push(e.data);
    };
    rec.onerror = (e) => {
      this.opts.onError(
        new Error((e as unknown as { error?: Error }).error?.message || 'recorder error'),
      );
    };
    rec.start();
    this.recorder = rec;

    // Auto-cut after chunkMs as a backstop. Manual flush() can still cut sooner.
    this.chunkTimer = setTimeout(() => {
      void this.rotateSegment();
    }, this.opts.chunkMs);
  }

  // Auto-rotation path (driven by chunkTimer). Does NOT await the upload
  // to avoid blocking the timer.
  private async rotateSegment(): Promise<void> {
    if (this.stopping || !this.isRecording) return;
    try {
      await this.cutAndUpload();
    } finally {
      if (!this.stopping) this.beginSegment();
    }
  }

  private async cutAndUpload(): Promise<void> {
    this.clearChunkTimer();
    const rec = this.recorder;
    if (!rec) return;

    await new Promise<void>((resolve) => {
      rec.onstop = () => {
        const chunks = this.currentChunks;
        this.currentChunks = [];
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: this.mimeType || 'audio/webm' });
          // Skip tiny blobs (header-only, no real audio) — Whisper would 400.
          if (blob.size > 512) this.enqueueUpload(blob);
        }
        resolve();
      };
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    // Wait for the upload+transcript cycle so callers can rely on
    // transcript-updated-by-now semantics.
    await this.uploadQueue;
  }

  private clearChunkTimer() {
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }
  }

  private enqueueUpload(blob: Blob): void {
    this.uploadQueue = this.uploadQueue
      .then(() => this.upload(blob))
      .catch((e) => {
        this.opts.onError(e instanceof Error ? e : new Error(String(e)));
      });
  }

  private async upload(blob: Blob): Promise<void> {
    const key = this.opts.getApiKey();
    if (!key) {
      this.opts.onError(new Error('MISSING_KEY'));
      return;
    }

    const fd = new FormData();
    const ext =
      (this.mimeType.includes('mp4') && 'm4a') ||
      (this.mimeType.includes('ogg') && 'ogg') ||
      'webm';
    fd.append('file', blob, `chunk.${ext}`);

    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'x-groq-key': key },
      body: fd,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`transcribe ${res.status}: ${text || res.statusText}`);
    }
    const data = (await res.json()) as { text?: string };
    if (data?.text) this.opts.onTranscript(data.text);
  }

  private pickMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) {
        return c;
      }
    }
    return '';
  }
}
