import { AARAV_SYSTEM_PROMPT, AARAV_TOOLS } from '../src/engine/aaravTools';
import type { AaravRequestBody, AaravResponseBody, AaravContentBlock, AaravMessage } from '../src/types/aarav';
import { allowedOrigin, ChatRateLimiter, readBoundedJson, validChatBody } from '../server/chatSecurity';

// Fetch-style handler, adapted to the local Node HTTP server by tutorMiddleware.
// Talks to Groq's OpenAI-compatible chat completions endpoint instead of the
// Anthropic API. The wire contract with the client (AaravResponseBody, with
// Anthropic-shaped content blocks and a stopReason of 'tool_use' or
// 'end_turn') is unchanged, so aaravClient.ts and AaravChat.tsx need no edits.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOKENS = 1024;
const limiter = new ChatRateLimiter();

type GroqToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };
type GroqMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: GroqToolCall[]; tool_call_id?: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Anthropic-shaped history (string content, or blocks with tool_use / tool_result)
// -> OpenAI-shaped messages (assistant.tool_calls, separate role:'tool' replies).
function toGroqMessages(messages: AaravMessage[], system: string): GroqMessage[] {
  const out: GroqMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === 'assistant') {
      const text = message.content
        .filter((block): block is Extract<AaravContentBlock, { type: 'text' }> => block.type === 'text')
        .map(block => block.text)
        .join('\n');
      const toolCalls: GroqToolCall[] = message.content
        .filter((block): block is Extract<AaravContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
        .map(block => ({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }));
      const assistantMessage: GroqMessage = { role: 'assistant', content: text.length ? text : null };
      if (toolCalls.length) assistantMessage.tool_calls = toolCalls;
      out.push(assistantMessage);
    } else {
      // User turns carrying tool results: one 'tool' role message per result,
      // matched back to the assistant's tool_calls by id.
      for (const block of message.content) {
        if (block.type === 'tool_result') out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
        else if (block.type === 'text') out.push({ role: 'user', content: block.text });
      }
    }
  }
  return out;
}

function toGroqTools(tools: typeof AARAV_TOOLS) {
  return tools.map(tool => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  }));
}

// OpenAI-shaped choice -> Anthropic-shaped content blocks + stopReason.
// AaravChat.tsx only branches on stopReason === 'tool_use', so anything else
// (Groq's 'stop', 'length', etc.) is safe to normalize to 'end_turn'.
function fromGroqChoice(choice: { message: { content: string | null; tool_calls?: GroqToolCall[] } }): AaravResponseBody {
  const content: AaravContentBlock[] = [];
  if (choice.message.content) content.push({ type: 'text', text: choice.message.content });
  const toolCalls = choice.message.tool_calls ?? [];
  for (const call of toolCalls) {
    let input: unknown = {};
    try { input = JSON.parse(call.function.arguments || '{}'); } catch { input = {}; }
    content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
  }
  return { content, stopReason: toolCalls.length ? 'tool_use' : 'end_turn' };
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Deliberately not a generic 500. The chat panel reads this exact
    // message and shows it to the user, the same honesty rule the rest of
    // the app follows for the accuracy panel and the solver status banner.
    return json(503, { error: 'Aarav needs a server API key. Add GROQ_API_KEY to .env and restart the server.' });
  }

  const system =
    AARAV_SYSTEM_PROMPT +
    '\n\nCurrent scene state, authoritative, read this before answering:\n' +
    JSON.stringify(body.sceneState, null, 2);

  try {
    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: toGroqMessages(body.messages, system),
        tools: toGroqTools(AARAV_TOOLS),
        tool_choice: 'auto',
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!groqResponse.ok) {
      return json(502, { error: 'The tutor provider could not complete this request. Check server credentials and provider availability, then retry.' });
    }

    const data = await groqResponse.json();
    const choice = data?.choices?.[0];
    if (!choice) return json(502, { error: 'The tutor provider returned an empty response.' });

    return json(200, fromGroqChoice(choice));
  } catch (error) {
    return json(502, { error: 'The tutor provider could not complete this request. Check server credentials and provider availability, then retry.' });
  }
}
