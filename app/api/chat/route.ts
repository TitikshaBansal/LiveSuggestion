import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import {
  MODEL_CHAT,
  getGroqKeyFromHeaders,
  makeGroqClient,
} from '@/lib/groq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatRole = 'user' | 'assistant' | 'system';

interface IncomingBody {
  transcript?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  message?: string;
  systemPrompt?: string;
}

export async function POST(req: NextRequest) {
  const key = getGroqKeyFromHeaders(req.headers);
  if (!key) {
    return new Response(JSON.stringify({ error: 'missing_key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: IncomingBody;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid_body', { status: 400 });
  }

  const systemPrompt = body.systemPrompt?.trim();
  if (!systemPrompt || !body.message) {
    return new Response('missing_fields', { status: 400 });
  }

  const transcript = body.transcript || '(empty)';
  const history = Array.isArray(body.history) ? body.history : [];

  const system =
    `${systemPrompt}\n\nFULL_TRANSCRIPT:\n${transcript}`;

  const messages: { role: ChatRole; content: string }[] = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: body.message },
  ];

  const client: Groq = makeGroqClient(key);

  try {
    const stream = (await client.chat.completions.create({
      model: MODEL_CHAT,
      temperature: 0.4,
      stream: true,
      messages,
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
    const message = (e as { message?: string })?.message ?? 'chat_failed';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
