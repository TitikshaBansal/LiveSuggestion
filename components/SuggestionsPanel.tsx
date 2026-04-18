'use client';

import React from 'react';
import { useSession } from '@/lib/store';
import { SuggestionCardView } from './SuggestionCard';
import type { SuggestionCard as SC } from '@/lib/types';

interface Props {
  onRefresh: () => void;
  onCardClick: (card: SC) => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export function SuggestionsPanel({ onRefresh, onCardClick }: Props) {
  const batches = useSession((s) => s.batches);
  const isSuggesting = useSession((s) => s.isSuggesting);

  return (
    <section className="flex h-full flex-col border-x border-border">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Live Suggestions</h2>
          <p className="text-xs text-muted">
            {isSuggesting ? 'Generating…' : batches.length ? `${batches.length} batches` : 'Idle'}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isSuggesting}
          className="rounded-md border border-border bg-[#181a21] px-3 py-1.5 text-xs font-medium text-white hover:border-accent/50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSuggesting ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {batches.length === 0 && !isSuggesting && (
          <div className="text-sm text-muted italic pt-6">
            Start recording and suggestions will appear here every 30 seconds. Click any card to get a detailed answer in chat.
          </div>
        )}

        {batches.map((batch, idx) => (
          <div key={batch.id} className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="font-mono">{formatTime(batch.t)}</span>
              {idx === 0 && (
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">latest</span>
              )}
            </div>
            <div className="space-y-2">
              {batch.cards.map((card) => (
                <SuggestionCardView key={card.id} card={card} onClick={onCardClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
