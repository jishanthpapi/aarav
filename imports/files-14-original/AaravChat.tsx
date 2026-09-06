import { useState } from 'react';
import { MessageSquare, Loader2 } from 'lucide-react';
import { sendAaravMessage } from '../../engine/aaravClient';
import { runAaravTool, snapshotSceneState } from '../../engine/aaravToolHandlers';
import type { AaravContentBlock, AaravMessage } from '../../types/aarav';

// Guards against a runaway tool-call loop if the model keeps calling tools
// without ever producing a final text answer.
const MAX_TOOL_ROUNDS = 4;

function textOf(content: AaravMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block): block is Extract<AaravContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

function hasVisibleText(message: AaravMessage): boolean {
  return typeof message.content === 'string'
    ? message.content.length > 0
    : message.content.some(block => block.type === 'text');
}

export default function AaravChat() {
  const [messages, setMessages] = useState<AaravMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    setInput('');
    setError(null);
    let history: AaravMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setBusy(true);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await sendAaravMessage(history, snapshotSceneState());
        history = [...history, { role: 'assistant', content: response.content }];

        const toolUses = response.content.filter(
          (block): block is Extract<AaravContentBlock, { type: 'tool_use' }> => block.type === 'tool_use',
        );

        if (response.stopReason !== 'tool_use' || toolUses.length === 0) {
          setMessages(history);
          return;
        }

        setMessages(history);
        const results: AaravContentBlock[] = toolUses.map(call => ({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(runAaravTool(call.name, call.input)),
        }));
        history = [...history, { role: 'user', content: results }];
        setMessages(history);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-4 hidden w-56 lg:block bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-20">
      <div className="p-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${busy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
        <span className="text-xs font-semibold text-white/80 tracking-tight">Aarav AI</span>
      </div>

      <div className="p-3 h-40 overflow-y-auto text-[11px] leading-relaxed space-y-2">
        {messages.length === 0 && (
          <p className="text-white/40 italic">Ask about what you are seeing.</p>
        )}
        {messages.filter(hasVisibleText).map((message, i) => (
          <p key={i} className={message.role === 'user' ? 'text-white' : 'text-blue-200'}>
            {textOf(message.content)}
          </p>
        ))}
        {error && <p className="text-red-400">{error}</p>}
      </div>

      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void send(); }}
          disabled={busy}
          placeholder="Ask Aarav about aerodynamics..."
          className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50"
        />
        <button
          onClick={() => void send()}
          disabled={busy}
          aria-label="Send"
          className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-md transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <MessageSquare className="w-4 h-4 text-white" />}
        </button>
      </div>
    </div>
  );
}
