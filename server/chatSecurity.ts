import type { AaravRequestBody } from '../src/types/aarav';

export const MAX_BODY_BYTES = 128 * 1024;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max = 16384): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function boundedTree(value: unknown, depth = 0, budget = { remaining: 4096 }): boolean {
  if (--budget.remaining < 0 || depth > 12) return false;
  if (value === null || typeof value === 'boolean' || finite(value)) return true;
  if (typeof value === 'string') return value.length <= 16384;
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length <= 100 && value.every(v => boundedTree(v, depth + 1, budget));
  const keys = Object.keys(value);
  return keys.length <= 100 && keys.every(key => !['__proto__', 'constructor', 'prototype'].includes(key) &&
    key.length <= 128 && boundedTree((value as Record<string, unknown>)[key], depth + 1, budget));
}

export function validChatBody(value: unknown): value is AaravRequestBody {
  if (!record(value) || !boundedTree(value) || !Array.isArray(value.messages) || value.messages.length < 1 ||
      !record(value.sceneState)) return false;
  const scene = value.sceneState;
  const computed = scene.computed;
  if (!string(scene.vehicleId, 128) || !finite(scene.windSpeedKph) || scene.windSpeedKph < 10 || scene.windSpeedKph > 250 ||
      !record(scene.slotValues) || !Object.values(scene.slotValues).every(v => finite(v) || typeof v === 'boolean') ||
      !record(computed) || !['Cd','Cl','wakeSize','stability'].every(k => finite(computed[k])) ||
      typeof scene.readoutValid !== 'boolean' || !(scene.readoutReason === null || string(scene.readoutReason)) ||
      !record(scene.telemetry) || !Array.isArray(scene.availableSlots)) return false;
  return value.messages.every(message => {
    if (!record(message) || !['user','assistant'].includes(String(message.role))) return false;
    if (typeof message.content === 'string') return string(message.content);
    if (!Array.isArray(message.content) || !message.content.length || message.content.length > 64) return false;
    return message.content.every(block => {
      if (!record(block)) return false;
      if (block.type === 'text') return string(block.text);
      if (block.type === 'tool_use') return message.role === 'assistant' && string(block.id,128) &&
        ['set_part','focus_camera','highlight','get_scene_state','start_lesson'].includes(String(block.name)) && record(block.input);
      if (block.type === 'tool_result') return message.role === 'user' && string(block.tool_use_id,128) && string(block.content);
      return false;
    });
  });
}

export async function readBoundedJson(req: Request): Promise<unknown> {
  const declared = req.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new Error('Invalid body size.');
  if (!req.body) throw new Error('Missing body.');
  const reader = req.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('Body too large.'); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode(); return JSON.parse(text);
  } finally { reader.releaseLock(); }
}

export function allowedOrigin(req: Request): boolean {
  try {
    const expected = new URL(process.env.AARAV_APP_ORIGIN || req.url).origin;
    const supplied = req.headers.get('origin');
    return supplied !== null && supplied !== 'null' && new URL(supplied).origin === supplied && supplied === expected;
  } catch { return false; }
}

/** Bounded process-local budget. Caller identity comes only from the server socket. */
export class ChatRateLimiter {
  private callers = new Map<string, { start: number; count: number }>();
  private global = { start: 0, count: 0 };
  constructor(private now = () => Date.now()) {}
  take(clientAddress = 'shared-direct-handler'): number {
    const now = this.now();
    if (now - this.global.start >= 60000) this.global = { start: now, count: 0 };
    for (const [key, value] of this.callers) if (now - value.start >= 60000) this.callers.delete(key);
    const key = clientAddress.length <= 128 ? clientAddress : 'shared-direct-handler';
    const caller = this.callers.get(key) ?? { start: now, count: 0 };
    if (this.global.count >= 60) return Math.max(1, Math.ceil((60000 - now + this.global.start) / 1000));
    if (caller.count >= 20 || (!this.callers.has(key) && this.callers.size >= 1024)) return Math.max(1, Math.ceil((60000 - now + caller.start) / 1000));
    caller.count++; this.global.count++; this.callers.set(key, caller); return 0;
  }
}
