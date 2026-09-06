import type { AaravMessage, AaravRequestBody, AaravResponseBody, SceneSnapshot } from '../types/aarav';

/**
 * The only place the client talks to the backend. The Anthropic API key
 * never appears here or anywhere else client side; it lives only in
 * api/aarav-chat.ts's server environment.
 */
export async function sendAaravMessage(
  messages: AaravMessage[],
  sceneState: SceneSnapshot,
): Promise<AaravResponseBody> {
  const body: AaravRequestBody = { messages, sceneState };
  const response = await fetch('/api/aarav-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(100000),
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The tutor backend returned an unreadable response (status ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (!data || typeof data !== 'object' || !('content' in data) || !Array.isArray(data.content)) throw new Error('Invalid tutor response.');
  return data as AaravResponseBody;
}
