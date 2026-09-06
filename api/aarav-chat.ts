import Anthropic from '@anthropic-ai/sdk';
import { AARAV_SYSTEM_PROMPT, AARAV_TOOLS } from '../src/engine/aaravTools';
import type { AaravRequestBody, AaravResponseBody, AaravContentBlock } from '../src/types/aarav';
import { allowedOrigin, ChatRateLimiter, readBoundedJson, validChatBody } from '../server/chatSecurity';

// Fetch-style handler, adapted to the local Node HTTP server by tutorMiddleware.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = 1024;
const limiter = new ChatRateLimiter();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request, context?: { clientAddress?: string }): Promise<Response> {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed. Use POST.' });
  }

  if (!allowedOrigin(req)) return json(403, { error: 'This endpoint only accepts requests from the application origin.' });
  let body: AaravRequestBody;
  try {
    const parsed = await readBoundedJson(req);
    if (!validChatBody(parsed)) return json(400, { error: 'Invalid chat request.' });
    body = parsed;
  } catch { return json(400, { error: 'Invalid chat request.' }); }
  const retryAfter = limiter.take(context?.clientAddress);
  if (retryAfter) {
    const response = json(429, { error: 'Too many tutor requests. Please try again shortly.' });
    response.headers.set('Retry-After', String(retryAfter)); return response;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Deliberately not a generic 500. The chat panel reads this exact
    // message and shows it to the user, the same honesty rule the rest of
    // the app follows for the accuracy panel and the solver status banner.
    return json(503, { error: 'Aarav needs a server API key. Add ANTHROPIC_API_KEY to .env and restart the server.' });
  }

  const anthropic = new Anthropic({ apiKey, timeout: 45000, maxRetries: 1 });
  const system =
    AARAV_SYSTEM_PROMPT +
    '\n\nCurrent scene state, authoritative, read this before answering:\n' +
    JSON.stringify(body.sceneState, null, 2);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: AARAV_TOOLS as unknown as Anthropic.Tool[],
      messages: body.messages as unknown as Anthropic.MessageParam[],
    });

    const result: AaravResponseBody = {
      content: response.content as unknown as AaravContentBlock[],
      stopReason: response.stop_reason,
    };
    return json(200, result);
  } catch (error) {
    return json(502, { error: 'The tutor provider could not complete this request. Check server credentials and provider availability, then retry.' });
  }
}
