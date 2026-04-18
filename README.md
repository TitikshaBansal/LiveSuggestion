# TwinMind — Live Suggestions

A real-time meeting copilot that listens to a live conversation and surfaces three contextual suggestions every 30 seconds. Click a card to get a detailed answer streamed into a side chat. Built as a take-home for TwinMind.

**Live demo:** <!-- TODO: replace with actual deployed Vercel URL before submission -->`https://twin-mind-six.vercel.app/`

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Zustand · Groq (whisper-large-v3 + openai/gpt-oss-120b) · Vercel

---

## Quick start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, click **Settings**, paste your Groq API key, click **Start recording**, and speak.

The app ships with no server-side environment variables. Users provide their own Groq key, which is stored in `localStorage` and sent only via the `x-groq-key` header to this app's own API routes (which forward it to Groq and never log it).

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                         │
│                                                                   │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐   │
│  │  Transcript  │    │  Live Suggestions│    │     Chat      │   │
│  │  (left col)  │    │    (middle col)  │    │  (right col)  │   │
│  └──────┬───────┘    └──────┬───────────┘    └───────┬───────┘   │
│         │                   │                        │           │
│         │            Zustand store (session state)              │
│         │                                                        │
│  MediaRecorder ─── 30s chunks ───┐                               │
└──────────────────────────────────┼───────────────────────────────┘
                                   │ x-groq-key header
                ┌──────────────────▼────────────────────┐
                │        Next.js API routes             │
                │                                       │
                │  /api/transcribe  → whisper-large-v3  │
                │  /api/suggestions → gpt-oss-120b      │
                │                      (JSON mode)      │
                │  /api/expand      → gpt-oss-120b      │
                │                      (streamed)       │
                │  /api/chat        → gpt-oss-120b      │
                │                      (streamed)       │
                └───────────────────┬───────────────────┘
                                    │
                              ┌─────▼─────┐
                              │   Groq    │
                              └───────────┘
```

**Why this shape:**
- Client-side API key: zero infra to manage, aligns with the assignment spec ("do not hard-code or ship a key"), and keeps the user in control.
- Server-side routes as thin proxies: the key never lives in transit to a third party other than Groq, and server-side handling lets us use streaming `ReadableStream` responses cleanly.
- Single Zustand store: no prop drilling, no context providers, no stale-closure bugs in the refresh interval.
- No database: the assignment explicitly scopes this to session-only memory. Adding persistence would be over-engineering.
---

## Prompt strategy

Three prompts power the app, all editable in Settings. Defaults are in `lib/prompts.ts`. Iteration history is in `PROMPTS.md`.

### Live suggestions prompt (the most-iterated one)

The suggestions prompt has been through four revisions. Each revision targeted a specific failure mode I saw in real test conversations. Headline decisions:

**1. Exact 5-type taxonomy from the assignment brief.** `question_to_ask`, `talking_point`, `answer_to_question`, `fact_check`, `clarification`. No renaming, no additions. The assignment lists these types explicitly; preserving the vocabulary is non-negotiable.

**2. JSON mode with a strict schema.** Groq's `response_format: { type: 'json_object' }` guarantees parseable output. A validation step confirms exactly 3 items and valid types; a single retry handles malformed responses before giving up. This is what makes the "exactly 3 suggestions per batch" requirement actually hold.

**3. Recency-weighted context.** The prompt receives `RECENT_TRANSCRIPT` (last ~1500 chars ≈ 90s of speech) as primary signal and `EARLIER_TRANSCRIPT` (capped at 4000 chars) as secondary. Context window is editable in Settings. 90s felt right in testing — short enough to pivot with the conversation, long enough to carry a coherent topic thread.

**4. Semantic anti-repetition.** The route passes the last 2 batches' titles + first sentence of each preview to the model, with an explicit rule against surfacing the same underlying gap twice even under different wording. Early versions only passed titles, which let the model repeat the same suggestion with a new title.

**5. Perspective guardrail ("YOU ARE NOT THE USER").** Early versions produced first-person hallucinated content ("When I build voice agents, I first..."). Dangerous in any evaluative context (interview, sales call, pitch). The current prompt explicitly bans fabricating the user's personal experience while allowing factual first-person grammar.

**6. Retrievable-anchor rule + anti-fabrication.** Talking_points and fact_checks must contain a specific anchor (named company, real incident, documented benchmark). But this pressure created a new failure mode — plausible-sounding invented citations ("Gartner 2024 survey: 42%..."). The v4 anti-fabrication block tells the model to drop the card or switch types rather than invent a statistic. A card that makes the user confidently wrong is worse than no card at all.

**7. Conversation-state detection.** Before generating, the model silently classifies the conversation as ACTIVE, ENDING (closing signals like "thank you"), or SILENT. Ending conversations get action-item/follow-up cards instead of more discussion ammunition.

### Expand prompt (card click → detailed answer)

Receives full transcript + the clicked card. Structured as TL;DR → Why this matters now → The detail → Next move. Under 250 words unless the topic demands more. Streams. Full history in `PROMPTS.md`.

### Chat prompt (free-form Q&A)

Receives full transcript + full chat history. Distinguishes questions about what was said (ground in transcript, quote sparingly) from forward-looking questions (direct answer). Streams. No "based on the transcript..." preamble.

---

## Tradeoffs

**30-second chunks, not streaming transcription.** Groq's Whisper endpoint doesn't stream, so we chunk. 30s was the assignment spec and it's a reasonable balance — short enough for timely suggestions, long enough to avoid over-paying for transcription overhead and to give Whisper enough context to transcribe accents and technical terms accurately. A smaller chunk (e.g., 10s) would reduce the window-to-suggestion latency but costs more API calls and cuts transcription quality on edges.

**Client-side API key, sent per-request.** The alternative is a server-side key with user auth and quota management. That's production-grade and out of scope. The current model: user supplies their key, localStorage persists it, every API route forwards it via `x-groq-key` to Groq and never logs it. No ambient auth, no shared infrastructure cost.

**JSON mode over function calling.** Function calling works too, but JSON mode is simpler and the schema is rigid enough. gpt-oss-120b handles JSON mode reliably; I measured zero parse failures across ~40 test batches during development.

**No speaker diarization.** Whisper doesn't do it natively. Adding it would mean swapping to Deepgram or running pyannote server-side. For a single-mic use case (the assignment's framing), diarization isn't critical — the user knows who said what because they were in the room.

**gpt-oss-120b, not a smaller/faster model.** Smaller Groq models (llama-3.1-8b, etc.) are faster but struggled with the multi-step reasoning in the suggestions prompt (classify state → pick type → produce anchored preview). 120B handles it reliably. Latency on Groq is ~1-2s per suggestions batch, which easily fits inside the 30s refresh window.

**No persistence across page reloads.** Assignment explicitly says "No login, no data persistence needed when reloading the page." Session ends when the tab closes. Export is the persistence mechanism.

---

## Latency measurements (Vercel production, US-East)

Measured on the deployed URL against Groq's US endpoint:

| Event | Typical |
|---|---|
| First suggestions batch after mic start | ~32s (30s audio + ~1.5s transcribe + ~0.8s suggestions) |
| Manual Refresh click → new batch rendered | ~3s (forces audio flush + transcribe + suggestions) |
| Card click → first token in chat | ~600-900ms |
| Free-form chat send → first token | ~500-800ms |

Streaming is real streaming — `ReadableStream` from `/api/expand` and `/api/chat` with token-level flush. First token visibility was verified via `curl -N`.

---

## File map

```
app/
  layout.tsx
  page.tsx                     # three-column UI
  api/
    transcribe/route.ts        # whisper-large-v3
    suggestions/route.ts       # gpt-oss-120b, JSON mode, validated
    expand/route.ts            # gpt-oss-120b, streamed
    chat/route.ts              # gpt-oss-120b, streamed
components/
  TranscriptPanel.tsx
  SuggestionsPanel.tsx
  SuggestionCard.tsx
  ChatPanel.tsx
  SettingsModal.tsx
  MicButton.tsx
  Card.tsx                     # reused primitive
lib/
  groq.ts                      # thin provider + withRetry
  audio.ts                     # MediaRecorder, 30s chunking, flush
  prompts.ts                   # all three default prompts
  store.ts                     # Zustand, localStorage-backed settings
  types.ts
  export.ts                    # session JSON builder
PROMPTS.md                     # prompt iteration log v1 → v4
README.md                      # this file
```

---

## Deployed

<!-- TODO: replace with actual deployed Vercel URL before submission -->
`https://twin-mind-six.vercel.app/`

No env vars required. Bring your own Groq key.
