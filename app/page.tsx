'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { SuggestionsPanel } from '@/components/SuggestionsPanel';
import { ChatPanel } from '@/components/ChatPanel';
import { SettingsModal } from '@/components/SettingsModal';
import {
  getPreviousSuggestions,
  getRecentAndEarlier,
  getTranscriptText,
  useSession,
} from '@/lib/store';
import { AudioController } from '@/lib/audio';
import { downloadExport } from '@/lib/export';
import type { SuggestionCard } from '@/lib/types';

export default function Page() {
  const {
    settings,
    settingsHydrated,
    isRecording,
    setRecording,
    setSuggesting,
    appendTranscript,
    addBatch,
    appendChat,
    updateChat,
    setSettingsOpen,
    setToast,
    toast,
    hydrateSettings,
  } = useSession();

  const audioRef = useRef<AudioController | null>(null);

  // Refresh guard to prevent overlapping suggestion runs.
  const refreshBusyRef = useRef(false);

  // Pull persisted settings from localStorage AFTER first mount so the
  // initial client render matches the server (avoids hydration mismatch).
  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  // Until we've hydrated, don't render a key state that can disagree with SSR.
  const keyStatus = !settingsHydrated ? 'pending' : settings.groqKey ? 'set' : 'missing';

  /* ------------------------------- toast --------------------------------- */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  /* ----------------------------- suggestions ----------------------------- */

  // Call /api/suggestions with the current windowed transcript.
  // Always defined, but no-ops silently if the transcript is empty.
  const fetchSuggestions = useCallback(async () => {
    const key = useSession.getState().settings.groqKey;
    if (!key) return;

    const { recent, earlier } = getRecentAndEarlier(settings.suggestionsWindowChars);
    if (!recent.trim()) return; // nothing to suggest on yet

    setSuggesting(true);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-groq-key': key },
        body: JSON.stringify({
          recentTranscript: recent,
          earlierTranscript: earlier,
          previousSuggestions: getPreviousSuggestions(2),
          systemPrompt: useSession.getState().settings.suggestionsPrompt,
        }),
      });
      if (res.status === 401) {
        setToast('Invalid API key');
        setSettingsOpen(true);
        return;
      }
      if (!res.ok) {
        setToast('Suggestion request failed');
        return;
      }
      const data = (await res.json()) as { cards?: SuggestionCard[]; error?: string };
      if (data?.cards?.length === 3) addBatch(data.cards);
      else if (data?.error) setToast(`Suggestions: ${data.error}`);
    } catch {
      setToast('Suggestion request failed');
    } finally {
      setSuggesting(false);
    }
  }, [settings.suggestionsWindowChars, setSuggesting, addBatch, setToast, setSettingsOpen]);

  // The shared "flush audio then fetch suggestions" action.
  // Used by the manual Refresh button AND the 30s interval.
  const refreshNow = useCallback(async () => {
    if (refreshBusyRef.current) return;
    refreshBusyRef.current = true;
    try {
      if (audioRef.current?.isRecording) {
        await audioRef.current.flush();
      }
      await fetchSuggestions();
    } finally {
      refreshBusyRef.current = false;
    }
  }, [fetchSuggestions]);

  /* ------------------------------- mic ---------------------------------- */

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const chunkMs = useSession.getState().settings.refreshIntervalMs;
    audioRef.current = new AudioController({
      chunkMs,
      onTranscript: (text) => {
        appendTranscript(text);
        // A new chunk just landed — the audio segment was already cut and
        // uploaded, so we only need to run suggestions. Flushing again here
        // would cut a 0-second segment and waste a Whisper call.
        void fetchSuggestions();
      },
      onError: (err) => {
        if (err.message === 'MISSING_KEY') {
          setToast('Add your Groq API key to start recording');
          setSettingsOpen(true);
          return;
        }
        setToast(err.message.slice(0, 160));
      },
      getApiKey: () => useSession.getState().settings.groqKey,
    });
    return audioRef.current;
  }, [appendTranscript, fetchSuggestions, setSettingsOpen, setToast]);

  const startRecording = useCallback(async () => {
    const s = useSession.getState().settings;
    if (!s.groqKey) {
      setSettingsOpen(true);
      setToast('Add your Groq API key to start');
      return;
    }
    try {
      const a = ensureAudio();
      await a.start();
      setRecording(true);
      // AudioController now handles the 30s cut internally, so we don't
      // need an external setInterval here. Manual Refresh still calls
      // refreshNow() which force-cuts the current segment.
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to access microphone';
      setToast(msg);
    }
  }, [ensureAudio, setRecording, setSettingsOpen, setToast]);

  const stopRecording = useCallback(async () => {
    try {
      await audioRef.current?.stop();
    } finally {
      setRecording(false);
      useSession.getState().endSession();
    }
  }, [setRecording]);

  const toggleMic = useCallback(() => {
    if (isRecording) void stopRecording();
    else void startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      void audioRef.current?.stop();
    };
  }, []);

  /* ------------------------------- chat --------------------------------- */

  // Shared chat send that handles both user-typed and clicked-card cases.
  const sendChat = useCallback(
    async (userContent: string, linkedCardId?: string) => {
      const key = useSession.getState().settings.groqKey;
      if (!key) {
        setSettingsOpen(true);
        setToast('Add your Groq API key to chat');
        return;
      }

      // Snapshot history BEFORE appending this turn so the user message
      // isn't double-counted by the server.
      const history = useSession
        .getState()
        .chat.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      appendChat({
        role: 'user',
        content: userContent,
        kind: 'typed',
        linkedCardId,
      });
      const assistantId = appendChat({
        role: 'assistant',
        content: '',
        streaming: true,
        linkedCardId,
      });

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-groq-key': key },
          body: JSON.stringify({
            transcript: getTranscriptText().slice(-useSession.getState().settings.expandWindowChars),
            history,
            message: userContent,
            systemPrompt: useSession.getState().settings.chatPrompt,
          }),
        });
        if (!res.ok || !res.body) {
          if (res.status === 401) {
            setToast('Invalid API key');
            setSettingsOpen(true);
          }
          updateChat(assistantId, { streaming: false, content: '[Chat request failed]' });
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          updateChat(assistantId, { content: buf });
        }
        updateChat(assistantId, { streaming: false });
      } catch {
        updateChat(assistantId, { streaming: false, content: '[Chat request failed]' });
      }
    },
    [appendChat, updateChat, setSettingsOpen, setToast],
  );

  const handleChatSend = useCallback(
    (message: string) => {
      void sendChat(message);
    },
    [sendChat],
  );

  /* --------------------------- card expansion ---------------------------- */

  const handleCardClick = useCallback(
    async (card: SuggestionCard) => {
      const key = useSession.getState().settings.groqKey;
      if (!key) {
        setSettingsOpen(true);
        setToast('Add your Groq API key to expand');
        return;
      }
      // 1) Post the card as a user-side chat message. Content is just the
      //    title — the full preview is already visible on the card in the
      //    middle panel, and `kind: 'card_click'` lets the UI render a
      //    distinct label.
      appendChat({
        role: 'user',
        content: card.title,
        kind: 'card_click',
        linkedCardId: card.id,
      });
      // 2) Stream the detailed answer from /api/expand.
      const assistantId = appendChat({ role: 'assistant', content: '', streaming: true, linkedCardId: card.id });
      try {
        const res = await fetch('/api/expand', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-groq-key': key },
          body: JSON.stringify({
            transcript: getTranscriptText().slice(-useSession.getState().settings.expandWindowChars),
            card: { type: card.type, title: card.title, preview: card.preview },
            systemPrompt: useSession.getState().settings.expandPrompt,
          }),
        });
        if (!res.ok || !res.body) {
          if (res.status === 401) {
            setToast('Invalid API key');
            setSettingsOpen(true);
          }
          updateChat(assistantId, { streaming: false, content: '[Expand failed]' });
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          updateChat(assistantId, { content: buf });
        }
        updateChat(assistantId, { streaming: false });
      } catch {
        updateChat(assistantId, { streaming: false, content: '[Expand failed]' });
      }
    },
    [appendChat, updateChat, setSettingsOpen, setToast],
  );

  /* ------------------------------- chrome -------------------------------- */

  const header = useMemo(
    () => (
      <header className="flex items-center justify-between border-b border-border bg-[#0e1015] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-sm font-semibold tracking-tight text-white">TwinMind</span>
          <span className="text-xs text-muted">Live Suggestions</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={[
              'rounded-full px-2 py-0.5 text-[11px] border',
              keyStatus === 'set'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : keyStatus === 'missing'
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                : 'border-border bg-[#181a21] text-muted',
            ].join(' ')}
            title="Groq API key status"
          >
            key: {keyStatus === 'set' ? '✓ set' : keyStatus === 'missing' ? '! missing' : '…'}
          </span>
          <button
            onClick={() => downloadExport()}
            className="rounded-md border border-border bg-[#181a21] px-3 py-1.5 text-xs font-medium text-white hover:border-accent/50"
          >
            Export
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-border bg-[#181a21] px-3 py-1.5 text-xs font-medium text-white hover:border-accent/50"
          >
            Settings
          </button>
        </div>
      </header>
    ),
    [keyStatus, setSettingsOpen],
  );

  return (
    <main className="flex h-screen flex-col bg-bg">
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,1fr)_minmax(340px,1fr)_minmax(320px,1fr)]">
        <TranscriptPanel recording={isRecording} onToggleMic={toggleMic} />
        <SuggestionsPanel onRefresh={refreshNow} onCardClick={handleCardClick} />
        <ChatPanel onSend={handleChatSend} />
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md border border-border bg-panel px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <SettingsModal />
    </main>
  );
}
