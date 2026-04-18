'use client';

import React, { useEffect, useRef } from 'react';
import { useSession } from '@/lib/store';
import { MicButton } from './MicButton';

interface Props {
  recording: boolean;
  onToggleMic: () => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export function TranscriptPanel({ recording, onToggleMic }: Props) {
  const transcript = useSession((s) => s.transcript);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to newest line whenever transcript grows.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Transcript</h2>
          <p className="text-xs text-muted">
            {recording ? 'Live — chunks every 30s' : 'Idle'}
          </p>
        </div>
        <MicButton recording={recording} onClick={onToggleMic} />
      </header>
      <div ref={scrollerRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {transcript.length === 0 && (
          <div className="text-sm text-muted italic pt-6">
            Press “Start recording” to begin. The transcript will fill in here every 30 seconds.
          </div>
        )}
        {transcript.map((line) => (
          <div key={line.id} className="text-sm leading-relaxed text-white/90">
            <span className="mr-2 text-[11px] font-mono text-muted">
              {formatTime(line.t)}
            </span>
            {line.text}
          </div>
        ))}
      </div>
    </section>
  );
}
