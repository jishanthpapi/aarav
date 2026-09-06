import Anthropic from '@anthropic-ai/sdk';
import { AARAV_SYSTEM_PROMPT, AARAV_TOOLS } from '../src/engine/aaravTools';
import type { AaravRequestBody, AaravResponseBody, AaravContentBlock } from '../src/types/aarav';

// Plain Node.js serverless function (Vercel's default runtime for files
// under /api). The Anthropic SDK requires Node's http client, not the Edge
// runtime, which is the reason this is not declared as an edge function.

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Deliberately not a generic 500. The chat panel reads this exact
    // message and shows it to the user, the same honesty rule the rest of
    // the app follows for the accuracy panel and the solver status banner.
    return json(500, { error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  let body: AaravRequestBody;
  try {
    body = (await req.json()) as AaravRequestBody;
  } catch {
    return json(400, { error: 'Request body was not valid JSON.' });
  }

  if (!Array.isArray(body.messages) || !body.sceneState) {
    return json(400, { error: 'Request must include messages and sceneState.' });
  }

  const anthropic = new Anthropic({ apiKey });
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
    const message = error instanceof Error ? error.message : String(error);
    return json(502, { error: `The Anthropic API request failed: ${message}` });
  }
}
