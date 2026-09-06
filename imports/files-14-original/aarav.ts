// Shared between the client (src/engine/aaravClient.ts) and the server route
// (api/aarav-chat.ts). Kept intentionally small and structural rather than
// importing the full Anthropic SDK's types into client bundle code.

export type AaravRole = 'user' | 'assistant';

export type AaravContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface AaravMessage {
  role: AaravRole;
  content: string | AaravContentBlock[];
}

// A deliberately narrow slice of SceneState: only what Aarav actually needs
// to ground an explanation, not the full store (no UI-only fields like
// highlightedSlotId, which Aarav should not be reasoning about directly).
export interface SceneSnapshot {
  vehicleId: string;
  windSpeedKph: number;
  slotValues: Record<string, number | boolean>;
  computed: { Cd: number; Cl: number; wakeSize: number; stability: number };
  readoutValid: boolean;
  readoutReason: string | null;
}

export interface AaravRequestBody {
  messages: AaravMessage[];
  sceneState: SceneSnapshot;
}

export interface AaravResponseBody {
  content: AaravContentBlock[];
  stopReason: string | null;
}

export interface AaravErrorBody {
  error: string;
}
