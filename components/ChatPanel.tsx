'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/store';
import { Card } from './Card';

interface Props {
  onSend: (message: string) => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Lightweight inline markdown for bold and code spans — enough for the
// expand/chat output style without a heavyweight dependency.
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let i = 0;
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const tokens = text.split(pattern);
  for (const tok of tokens) {
    if (!tok) continue;
    if (tok.startsWith('**') && tok.endsWith('**')) {
      parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`') && tok.endsWith('`')) {
      parts.push(<code key={i++}>{tok.slice(1, -1)}</code>);
    } else {
      parts.push(<span key={i++}>{tok}</span>);
    }
  }
  return parts;
}

function MessageBody({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose-compact">
      {lines.map((l, idx) => {
        if (!l.trim()) return <div key={idx} className="h-2" />;
        const bullet = l.match(/^\s*[-*]\s+(.*)$/);
        const numbered = l.match(/^\s*\d+\.\s+(.*)$/);
        if (bullet) return <div key={idx} className="ml-3">• {renderInline(bullet[1])}</div>;
        if (numbered) return <div key={idx} className="ml-3">{renderInline(l.trim())}</div>;
        return <p key={idx}>{renderInline(l)}</p>;
      })}
    </div>
  );
}

export function ChatPanel({ onSend }: Props) {
  const chat = useSession((s) => s.chat);
  const [draft, setDraft] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  function handleSend() {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    onSend(v);
  }

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-white">Chat</h2>
          <p className="text-xs text-muted">Ask your copilot anything</p>
        </div>
      </header>

      <div ref={scrollerRef} className="scroll-thin flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chat.length === 0 && (
          <div className="text-sm text-muted italic pt-6">
            Tap a suggestion card on the left or type a question below. Your copilot has the full transcript in context.
          </div>
        )}
        {chat.map((m) => {
          const isCardClick = m.role === 'user' && m.kind === 'card_click';
          return (
            <Card
              key={m.id}
              className={[
                'p-3',
                m.role === 'user' ? 'bg-accentSoft/40 border-accent/30' : 'bg-panel',
              ].join(' ')}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                <span>{m.role === 'user' ? 'You' : 'Copilot'}</span>
                <span className="font-mono">{formatTime(m.t)}</span>
                {m.streaming && <span className="text-accent">typing…</span>}
                {isCardClick && (
                  <span
                    className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent"
                    title="You tapped a suggestion card"
                  >
                    📎 Clicked suggestion
                  </span>
                )}
              </div>
              {isCardClick ? (
                <div className="text-sm font-semibold text-white">{m.content}</div>
              ) : (
                <MessageBody content={m.content} />
              )}
            </Card>
          );
        })}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Ask a question…"
            className="flex-1 resize-none rounded-md border border-border bg-[#181a21] px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent/60 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/85 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
