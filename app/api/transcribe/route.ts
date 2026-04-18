import { NextRequest, NextResponse } from 'next/server';
import {
  MODEL_TRANSCRIBE,
  getGroqKeyFromHeaders,
  makeGroqClient,
  withRetry,
} from '@/lib/groq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const key = getGroqKeyFromHeaders(req.headers);
  if (!key) {
    return NextResponse.json({ error: 'missing_key' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }

  try {
    const client = makeGroqClient(key);
    const res = await withRetry(() =>
      client.audio.transcriptions.create({
        file,
        model: MODEL_TRANSCRIBE,
        language: 'en',
        response_format: 'json',
      }),
    );
    const text = (res as { text?: string })?.text ?? '';
    return NextResponse.json({ text });
  } catch (e: unknown) {
    const status = (e as { status?: number })?.status ?? 500;
    const message = (e as { message?: string })?.message ?? 'transcribe_failed';
    return NextResponse.json({ error: message }, { status });
  }
}
