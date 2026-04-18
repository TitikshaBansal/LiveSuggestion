'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from '@/lib/store';

export function SettingsModal() {
  const open = useSession((s) => s.settingsOpen);
  const setOpen = useSession((s) => s.setSettingsOpen);
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const reset = useSession((s) => s.resetPrompts);

  const [local, setLocal] = useState(settings);

  // Sync local draft whenever the modal opens (fresh copy for editing).
  useEffect(() => {
    if (open) setLocal(settings);
  }, [open, settings]);

  if (!open) return null;

  function save() {
    update(local);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold text-white">Settings</h3>
          <button
            onClick={() => setOpen(false)}
            className="text-muted hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <Field label="Groq API key" help="Stored only in your browser. Sent from the server to api.groq.com on each call.">
            <input
              type="password"
              value={local.groqKey}
              onChange={(e) => setLocal({ ...local, groqKey: e.target.value })}
              placeholder="gsk_..."
              className="w-full rounded-md border border-border bg-[#181a21] px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent/60 focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Suggestions window (chars)">
              <NumInput value={local.suggestionsWindowChars} min={300} max={8000} step={100}
                onChange={(v) => setLocal({ ...local, suggestionsWindowChars: v })} />
            </Field>
            <Field label="Expand window (chars)">
              <NumInput value={local.expandWindowChars} min={1000} max={24000} step={500}
                onChange={(v) => setLocal({ ...local, expandWindowChars: v })} />
            </Field>
            <Field label="Refresh interval (ms)">
              <NumInput value={local.refreshIntervalMs} min={10000} max={120000} step={5000}
                onChange={(v) => setLocal({ ...local, refreshIntervalMs: v })} />
            </Field>
          </div>

          <Field label="Live suggestions prompt">
            <PromptArea
              value={local.suggestionsPrompt}
              onChange={(v) => setLocal({ ...local, suggestionsPrompt: v })}
            />
          </Field>
          <Field label="Expand prompt">
            <PromptArea
              value={local.expandPrompt}
              onChange={(v) => setLocal({ ...local, expandPrompt: v })}
            />
          </Field>
          <Field label="Chat prompt">
            <PromptArea
              value={local.chatPrompt}
              onChange={(v) => setLocal({ ...local, chatPrompt: v })}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            onClick={() => {
              reset();
              setLocal({ ...useSession.getState().settings });
            }}
            className="text-xs text-muted hover:text-white"
          >
            Reset prompts & windows to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-[#181a21] px-3 py-1.5 text-sm text-white hover:border-accent/50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/85"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-white/90">{label}</div>
      {children}
      {help && <div className="mt-1 text-[11px] text-muted">{help}</div>}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      className="w-full rounded-md border border-border bg-[#181a21] px-3 py-2 text-sm text-white focus:border-accent/60 focus:outline-none"
    />
  );
}

function PromptArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={8}
      className="w-full rounded-md border border-border bg-[#181a21] px-3 py-2 text-[12px] font-mono leading-relaxed text-white focus:border-accent/60 focus:outline-none"
    />
  );
}
