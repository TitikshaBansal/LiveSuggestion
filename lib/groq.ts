import Groq from 'groq-sdk';

// Thin provider wrapper. Any LLM call goes through here so we can swap
// providers or add telemetry in exactly one place.

export const MODEL_CHAT = 'openai/gpt-oss-120b';
export const MODEL_TRANSCRIBE = 'whisper-large-v3';

export function getGroqKeyFromHeaders(headers: Headers): string {
  const key = headers.get('x-groq-key') || '';
  return key.trim();
}

export function makeGroqClient(apiKey: string): Groq {
  if (!apiKey) {
    throw new Error('MISSING_KEY');
  }
  return new Groq({ apiKey });
}

export interface ChatArgs {
  client: Groq;
  system: string;
  user: string;
  temperature?: number;
  jsonMode?: boolean;
  stream?: boolean;
}

export async function callGroqChat(args: ChatArgs) {
  const { client, system, user, temperature = 0.4, jsonMode, stream } = args;
  return client.chat.completions.create({
    model: MODEL_CHAT,
    temperature,
    ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    ...(stream ? { stream: true as const } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
}

// Exponential backoff for transient (429/5xx) failures.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 1000;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const status = (e as { status?: number })?.status ?? 0;
      if (status === 401) throw e; // auth errors must not retry
      if (status && status !== 429 && status < 500) throw e;
      const delay = base * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
