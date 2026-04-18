# TwinMind — Live Suggestions

A real-time meeting copilot built for the TwinMind take-home. Speak into your mic, and every 30 seconds the app surfaces 3 contextually-aware suggestions — questions to ask, talking points, factual answers, fact-checks, or clarifications — tuned to what was *just* said. Tap any card to get a detailed, streamed answer in the side chat. Free-form chat stays grounded in the full transcript.

## Stack

- **Next.js 14** App Router + **TypeScript** + **Tailwind CSS**
- **Zustand** for client state (transcript, batches, chat, settings)
- **Groq SDK** for everything LLM: `whisper-large-v3` for ASR, `openai/gpt-oss-120b` for suggestions / expand / chat
- Deployed on **Vercel**. No database, no auth — session state lives in memory only.

## Setup

```bash
pnpm install           # or npm install / yarn
pnpm dev               # localhost:3000
```

1. Visit the app and open **Settings** (top-right).
2. Paste your Groq API key (get one at [console.groq.com](https://console.groq.com/keys)). The key is stored in `localStorage` and sent only via an `x-groq-key` header on your own server routes.
3. Click **Start recording** in the left panel.
4. Wait ~30s for the first batch of suggestions to appear.

### Deployed URL

_(Fill in after your first `vercel --prod`.)_

### Deploy

```bash
pnpm build
vercel --prod
```

No environment variables are required — the API key is supplied per-user, per-request.

## Architecture

```
                 ┌──────────────────────── Browser ────────────────────────┐
                 │                                                        │
   MediaRecorder │  ── 30s webm/opus blobs ──▶ /api/transcribe            │
                 │                                                        │
                 │  transcript ─▶ /api/suggestions ─▶ 3 cards (JSON mode) │
                 │                                                        │
                 │  card click  ─▶ /api/expand      (SSE-style stream)    │
                 │  chat send   ─▶ /api/chat        (SSE-style stream)    │
                 │                                                        │
                 │  Zustand store: transcript · batches · chat · settings │
                 └────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                                    Groq API
                         whisper-large-v3  /  openai/gpt-oss-120b
```

- `lib/groq.ts` — single thin wrapper (`makeGroqClient`, `callGroqChat`, `withRetry`). Every server route flows through here.
- `lib/prompts.ts` — default prompts. Editable at runtime in Settings.
- `lib/store.ts` — one Zustand store. Selectors: `getTranscriptText`, `getRecentAndEarlier`, `getPreviousSuggestions`.
- `lib/audio.ts` — `MediaRecorder` + chunked upload + manual flush.
- `app/api/*` — four routes, each returning either JSON or a streamed `ReadableStream`.
- `components/` — one `Card` primitive shared by every panel. Three column panels + settings modal + mic button + suggestion card.

## Prompt strategy (the part they're grading)

### Suggestions prompt — 5-type taxonomy with anti-repetition

The live-suggestions prompt forces a **strict JSON schema** (`{ suggestions: [...] }`) and a fixed 5-type taxonomy:

| Type                 | When                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `answer_to_question` | Someone just asked a factual question the user likely doesn't know   |
| `fact_check`         | A specific claim (number/date/name) was stated that is off or worth verifying |
| `question_to_ask`    | Conversation has a gap — unstated assumption, unnamed stakeholder    |
| `talking_point`      | User is about to present/respond; a specific angle strengthens them  |
| `clarification`      | A term or acronym was used that the user may not know                |

Key design decisions:

- **Recency-weighted context.** The prompt receives `RECENT_TRANSCRIPT` (the last ~90s, default 1500 chars) and `EARLIER_TRANSCRIPT` as two separate sections. This nudges the model to react to *what's happening now* rather than paraphrasing opening small-talk from minutes ago.
- **Anti-repetition.** The last 2 batches are passed in as `PREVIOUS_SUGGESTIONS` with explicit instructions to never repeat or trivially rephrase. Without this, the model loops on whatever the most salient-but-static topic is.
- **Type mixing.** The prompt says "Do NOT return 3 of the same type unless the moment genuinely demands it." Mixed types catch more angles per batch and make the panel feel alive.
- **Finished-thought previews.** Previews are written to deliver value *on their own* — so even if the user never clicks, skim-reading the card is useful. No teasers, no hedging.
- **JSON mode.** The `/api/suggestions` route uses Groq's `response_format: { type: 'json_object' }` and server-side validates: exactly 3 items, each with a valid type enum, title, preview. On validation failure we retry once before surfacing an error.

### Expand prompt — structured, bounded

The expand prompt locks the response into a 4-part skeleton — **TL;DR (bold) → Why this matters now → The detail → Next move (optional)** — capped at 250 words. The card's `{type, title, preview}` goes in alongside the full transcript so the answer picks up exactly where the card left off.

### Chat prompt — grounded, terse

The chat prompt enforces three rules: ground in transcript, keep it tight, and never say "based on the transcript…". The **full running transcript** is prepended to the system message on every request — combined with the full chat history, the copilot has everything it needs without the client having to manage memory.

## Tradeoffs

- **Why 30s chunks?** Whisper likes longer chunks — accuracy degrades on 5–10s clips because context is lost. 30s is the sweet spot: good enough transcription quality, suggestions feel live, API cost stays reasonable. The manual **Refresh** button exists for the moments when 30s is too slow (e.g., you urgently need help right now) — it force-flushes the current chunk and runs suggestions immediately.
- **Why not streaming Whisper?** Groq's hosted Whisper doesn't stream, and rolling a WebSocket-based ASR pipeline would have pushed this outside the take-home scope. Chunked POSTs give us ordered, deterministic transcript updates with simple code.
- **Why client-side API key?** No auth, no DB, no secrets management. Each user brings their own Groq key, stored in `localStorage`, passed through an `x-groq-key` header to our own API routes, which forward to Groq. We never log it, never persist it server-side, and never ship a shared key in an env var.
- **Why no WebSockets?** Plain `fetch` + `ReadableStream` handles streaming with less moving parts and deploys perfectly on Vercel's serverless runtime.
- **Why no database?** The assignment is scoped to a live-session experience. Export produces a JSON file with everything needed to reconstruct the session offline.

## Files

```
app/
  layout.tsx                 # preconnect + global styles
  page.tsx                   # three-column UI + all glue (mic, refresh, chat)
  globals.css
  api/
    transcribe/route.ts      # Whisper; multipart upload
    suggestions/route.ts     # 3-card JSON mode + validation + 1x retry
    expand/route.ts          # streamed detailed card answer
    chat/route.ts            # streamed chat
components/
  Card.tsx                   # single reused primitive
  MicButton.tsx
  TranscriptPanel.tsx
  SuggestionCard.tsx
  SuggestionsPanel.tsx
  ChatPanel.tsx
  SettingsModal.tsx
lib/
  types.ts
  prompts.ts                 # DEFAULT_SUGGESTIONS_PROMPT + expand + chat
  store.ts                   # Zustand + localStorage-backed settings
  groq.ts                    # makeGroqClient, callGroqChat, withRetry
  audio.ts                   # MediaRecorder + chunked upload + flush
  export.ts                  # JSON session download
README.md
```

## Latency notes

- `<link rel="preconnect">` to `api.groq.com` in `layout.tsx` — shaves a round-trip off the first call.
- Suggestion fetch kicks off the moment a new transcript chunk lands, rather than waiting for the next timer tick.
- `/api/expand` and `/api/chat` stream tokens through a `ReadableStream` so the first token paints quickly.
- Shared `refreshNow()` function guards against overlapping runs, so a manual Refresh never races with the 30s timer.
