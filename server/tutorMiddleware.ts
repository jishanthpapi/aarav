import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from '../api/aarav-chat';
import { MAX_BODY_BYTES } from './chatSecurity';

export async function tutorMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.url?.split('?')[0] !== '/api/aarav-chat') { next(); return; }
  try {
    req.setEncoding('utf8');
    const chunks: string[] = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid chat request.' })); return; }
      chunks.push(chunk);
    }
    const base = process.env.AARAV_APP_ORIGIN || `http://${req.headers.host || 'localhost'}`;
    const response = await handler(new Request(new URL('/api/aarav-chat', base), {
      method: req.method, headers: { 'Content-Type': 'application/json', ...(req.headers.origin ? { Origin: req.headers.origin } : {}) },
      body: req.method === 'POST' ? chunks.join('') : undefined,
    }), { clientAddress: req.socket.remoteAddress });
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(await response.text());
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Tutor server could not process the request.' })); }
}

