'use client';

import React from 'react';
import { Card } from './Card';
import type { SuggestionCard as SC } from '@/lib/types';

// Human-friendly badge labels, one per SuggestionType.
const LABELS: Record<SC['type'], string> = {
  question_to_ask: 'Question',
  talking_point: 'Talking Point',
  answer_to_question: 'Answer',
  fact_check: 'Fact-Check',
  clarification: 'Clarification',
};

// Muted palette per type — readable against the dark panel and enough variety
// to glance-scan without being loud.
const COLORS: Record<SC['type'], string> = {
  question_to_ask: 'bg-blue-500/15 text-blue-200 border-blue-400/30',
  talking_point: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  answer_to_question: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  fact_check: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
  clarification: 'bg-purple-500/15 text-purple-200 border-purple-400/30',
};

interface Props {
  card: SC;
  onClick: (card: SC) => void;
}

export function SuggestionCardView({ card, onClick }: Props) {
  return (
    <Card
      as="button"
      interactive
      onClick={() => onClick(card)}
      className="w-full text-left p-3"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${COLORS[card.type]}`}
        >
          {LABELS[card.type]}
        </span>
      </div>
      <div className="text-sm font-semibold text-white">{card.title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-white/75">{card.preview}</div>
    </Card>
  );
}
