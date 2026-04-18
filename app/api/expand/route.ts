import { NextRequest } from 'next/server';
import {
  callGroqChat,
  getGroqKeyFromHeaders,
  makeGroqClient,
} from '@/lib/groq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streams a detailed answer for the tapped suggestion card.
export async function POST(req: NextRequest) {
  const key = getGroqKeyFromHeaders(req.headers);
  if (!key) {
    return new Response(JSON.stringify({ error: 'missing_key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: {
    transcript?: string;
    card?: { type: string; title: string; preview: string };
    systemPrompt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid_body', { status: 400 });
  }

  const systemPrompt = body.systemPrompt?.trim();
  const card = body.card;
  if (!systemPrompt || !card) return new Response('missing_fields', { status: 400 });

  const userPrompt = [
    `FULL_TRANSCRIPT:\n${body.transcript || '(empty)'}`,
    `CARD:\n${JSON.stringify(card, null, 2)}`,
  ].join('\n\n');

  const client = makeGroqClient(key);

  try {
    const stream = (await callGroqChat({
      client,
      system: systemPrompt,
      user: userPrompt,
      temperature: 0.4,
      stream: true,
    })) as AsyncIterable<{ choices: { delta: { content?: string | null } }[] }>;

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) controller.enqueue(encoder.encode(token));
          }
        } catch (e: unknown) {
          const msg = (e as { message?: string })?.message ?? 'stream_error';
          controller.enqueue(encoder.encode(`\n\n[error: ${msg}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    const message = (e as { message?: string })?.message ?? 'expand_failed';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
