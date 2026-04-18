'use client';

import React from 'react';

interface Props {
  recording: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function MicButton({ recording, disabled, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-3 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
        'border',
        recording
          ? 'border-red-400/50 bg-red-500/15 text-red-200 hover:bg-red-500/20'
          : 'border-accent/40 bg-accent/15 text-white hover:bg-accent/25',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
      aria-pressed={recording}
    >
      <span
        className={[
          'inline-block h-2.5 w-2.5 rounded-full',
          recording ? 'bg-red-400 animate-pulseDot' : 'bg-accent',
        ].join(' ')}
      />
      {recording ? 'Stop recording' : 'Start recording'}
    </button>
  );
}
