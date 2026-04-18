'use client';

import type { SessionExport } from './types';
import { useSession } from './store';
import { MODEL_CHAT, MODEL_TRANSCRIBE } from './groq';

export function buildSessionExport(): SessionExport {
  const state = useSession.getState();
  const { sessionStart, sessionEnd, transcript, batches, chat, settings } = state;

  return {
    // Recording boundaries vs. export time — kept as three separate fields
    // so downstream tools know *when* the session was captured vs. *when*
    // the file was produced (they may differ if export happens later).
    recordingStart: sessionStart,
    recordingEnd: sessionEnd ?? null,
    exportedAt: new Date().toISOString(),

    config: {
      models: {
        transcription: MODEL_TRANSCRIBE,
        chat: MODEL_CHAT,
      },
      contextWindows: {
        suggestionsChars: settings.suggestionsWindowChars,
        expandChars: settings.expandWindowChars,
      },
      refreshIntervalMs: settings.refreshIntervalMs,
      // Capture prompts as they stood at export time — the user may have
      // edited them in Settings during the session.
      prompts: {
        suggestions: settings.suggestionsPrompt,
        expand: settings.expandPrompt,
        chat: settings.chatPrompt,
      },
    },

    transcript: transcript.map(({ t, text }) => ({ t, text })),

    // Reverse so the exported file reads chronologically. Card `id` is
    // preserved so chat messages' `linkedCardId` can reference back into
    // this list.
    suggestionBatches: [...batches].reverse().map((b) => ({
      t: b.t,
      cards: b.cards.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        preview: c.preview,
      })),
    })),

    chat: chat.map((m) => {
      const out: SessionExport['chat'][number] = {
        id: m.id,
        t: m.t,
        role: m.role,
        content: m.content,
      };
      if (m.kind) out.kind = m.kind;
      if (m.linkedCardId) out.linkedCardId = m.linkedCardId;
      return out;
    }),
  };
}

export function downloadExport() {
  const data = buildSessionExport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `twinmind-session-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
