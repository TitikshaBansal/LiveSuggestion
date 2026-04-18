import { NextRequest, NextResponse } from 'next/server';
import {
  callGroqChat,
  getGroqKeyFromHeaders,
  makeGroqClient,
  withRetry,
} from '@/lib/groq';
import type { SuggestionCard, SuggestionType } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TYPES: SuggestionType[] = [
  'question_to_ask',
  'talking_point',
  'answer_to_question',
  'fact_check',
  'clarification',
];

function buildUserPrompt(body: {
  recentTranscript: string;
  earlierTranscript: string;
  previousSuggestions: unknown[];
}): string {
  const prev = body.previousSuggestions?.length
    ? JSON.stringify(body.previousSuggestions, null, 2)
    : '(none)';
  return [
    `RECENT_TRANSCRIPT:\n${body.recentTranscript || '(silent)'}`,
    `EARLIER_TRANSCRIPT:\n${body.earlierTranscript || '(none)'}`,
    `PREVIOUS_SUGGESTIONS:\n${prev}`,
  ].join('\n\n');
}

function parseAndValidate(raw: string): SuggestionCard[] {
  const parsed = JSON.parse(raw) as { suggestions?: unknown[] };
  const list = parsed?.suggestions;
  if (!Array.isArray(list) || list.length !== 3) {
    throw new Error('invalid_count');
  }
  return list.map((item, i) => {
    const s = item as { type?: string; title?: string; preview?: string };
    if (!s || typeof s !== 'object') throw new Error(`invalid_item_${i}`);
    if (!VALID_TYPES.includes(s.type as SuggestionType)) throw new Error(`invalid_type_${i}`);
    if (!s.title || typeof s.title !== 'string') throw new Error(`invalid_title_${i}`);
    if (!s.preview || typeof s.preview !== 'string') throw new Error(`invalid_preview_${i}`);
    return {
      id: '',
      type: s.type as SuggestionType,
      title: s.title.trim(),
      preview: s.preview.trim(),
    };
  });
}

export async function POST(req: NextRequest) {
  const key = getGroqKeyFromHeaders(req.headers);
  if (!key) return NextResponse.json({ error: 'missing_key' }, { status: 401 });

  let body: {
    recentTranscript?: string;
    earlierTranscript?: string;
    previousSuggestions?: unknown[];
    systemPrompt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const systemPrompt = body.systemPrompt?.trim();
  if (!systemPrompt) {
    return NextResponse.json({ error: 'missing_prompt' }, { status: 400 });
  }

  const userPrompt = buildUserPrompt({
    recentTranscript: body.recentTranscript ?? '',
    earlierTranscript: body.earlierTranscript ?? '',
    previousSuggestions: body.previousSuggestions ?? [],
  });

  const client = makeGroqClient(key);

  // Try twice: the model sometimes emits malformed JSON; a single retry clears it.
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < 2) {
    attempt++;
    try {
      const completion = await withRetry(
        () =>
          callGroqChat({
            client,
            system: systemPrompt,
            user: userPrompt,
            temperature: 0.5,
            jsonMode: true,
          }) as Promise<{ choices: { message: { content: string | null } }[] }>,
        { retries: 3 },
      );
      const raw = completion.choices?.[0]?.message?.content ?? '';
      const cards = parseAndValidate(raw);
      return NextResponse.json({ cards });
    } catch (e: unknown) {
      lastErr = e;
      const status = (e as { status?: number })?.status ?? 0;
      if (status === 401) {
        return NextResponse.json({ error: 'invalid_key' }, { status: 401 });
      }
      // fall through, retry once for parse/validation failures
    }
  }

  const message = (lastErr as { message?: string })?.message ?? 'suggestions_failed';
  return NextResponse.json({ error: message }, { status: 502 });
}
