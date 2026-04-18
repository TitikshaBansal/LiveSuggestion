'use client';

import { create } from 'zustand';
import type {
  ChatMessage,
  Settings,
  SuggestionBatch,
  SuggestionCard,
  TranscriptLine,
} from './types';
import { DEFAULT_SETTINGS } from './prompts';

const SETTINGS_KEY = 'twinmind.settings.v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Always return pure defaults at init — SSR and first client render must
// agree, so we never touch localStorage here. Real persisted settings are
// merged in via hydrateSettings() after mount.
function initialSettings(): Settings {
  return { groqKey: '', ...DEFAULT_SETTINGS };
}

function readPersisted(): Partial<Settings> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

function persistSettings(s: Settings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // localStorage disabled — silently ignore
  }
}

interface SessionState {
  sessionStart: string;
  sessionEnd: string | null;
  transcript: TranscriptLine[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];
  isRecording: boolean;
  isSuggesting: boolean;
  settings: Settings;
  settingsHydrated: boolean;
  settingsOpen: boolean;
  toast: string | null;

  appendTranscript: (text: string) => void;
  addBatch: (cards: SuggestionCard[]) => void;
  appendChat: (msg: Omit<ChatMessage, 'id' | 't'>) => string;
  updateChat: (id: string, patch: Partial<ChatMessage>) => void;
  setRecording: (v: boolean) => void;
  setSuggesting: (v: boolean) => void;
  endSession: () => void;
  resetSession: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  resetPrompts: () => void;
  hydrateSettings: () => void;
  setSettingsOpen: (v: boolean) => void;
  setToast: (m: string | null) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  sessionStart: new Date().toISOString(),
  sessionEnd: null,
  transcript: [],
  batches: [],
  chat: [],
  isRecording: false,
  isSuggesting: false,
  settings: initialSettings(),
  settingsHydrated: false,
  settingsOpen: false,
  toast: null,

  appendTranscript: (text) => {
    const clean = text.trim();
    if (!clean) return;
    set((s) => ({
      transcript: [...s.transcript, { id: uid(), t: new Date().toISOString(), text: clean }],
    }));
  },

  addBatch: (cards) => {
    const batch: SuggestionBatch = {
      id: uid(),
      t: new Date().toISOString(),
      cards: cards.map((c) => ({ ...c, id: c.id || uid() })),
    };
    // Newest batch first so the UI can render in order.
    set((s) => ({ batches: [batch, ...s.batches] }));
  },

  appendChat: (msg) => {
    const id = uid();
    set((s) => ({
      chat: [...s.chat, { id, t: new Date().toISOString(), ...msg }],
    }));
    return id;
  },

  updateChat: (id, patch) =>
    set((s) => ({
      chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  setRecording: (v) => set({ isRecording: v }),
  setSuggesting: (v) => set({ isSuggesting: v }),

  endSession: () => set({ sessionEnd: new Date().toISOString(), isRecording: false }),

  resetSession: () =>
    set({
      sessionStart: new Date().toISOString(),
      sessionEnd: null,
      transcript: [],
      batches: [],
      chat: [],
      isRecording: false,
    }),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    persistSettings(next);
    set({ settings: next });
  },

  resetPrompts: () => {
    const next: Settings = {
      ...get().settings,
      suggestionsPrompt: DEFAULT_SETTINGS.suggestionsPrompt,
      expandPrompt: DEFAULT_SETTINGS.expandPrompt,
      chatPrompt: DEFAULT_SETTINGS.chatPrompt,
      suggestionsWindowChars: DEFAULT_SETTINGS.suggestionsWindowChars,
      expandWindowChars: DEFAULT_SETTINGS.expandWindowChars,
      refreshIntervalMs: DEFAULT_SETTINGS.refreshIntervalMs,
    };
    persistSettings(next);
    set({ settings: next });
  },

  hydrateSettings: () => {
    if (get().settingsHydrated) return;
    const persisted = readPersisted();
    if (persisted) {
      set({ settings: { ...get().settings, ...persisted }, settingsHydrated: true });
    } else {
      set({ settingsHydrated: true });
    }
  },

  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setToast: (m) => set({ toast: m }),
}));

// Helpers that read from the store but are convenient to call from UI glue.

export function getTranscriptText(): string {
  return useSession
    .getState()
    .transcript.map((l) => l.text)
    .join(' ');
}

export function getRecentAndEarlier(limitChars: number) {
  const full = getTranscriptText();
  if (full.length <= limitChars) {
    return { recent: full, earlier: '' };
  }
  return {
    recent: full.slice(full.length - limitChars),
    earlier: full.slice(0, full.length - limitChars),
  };
}

export function getPreviousSuggestions(n = 2) {
  const { batches } = useSession.getState();
  return batches.slice(0, n).flatMap((b) =>
    b.cards.map((c) => ({ type: c.type, title: c.title, preview: c.preview })),
  );
}
