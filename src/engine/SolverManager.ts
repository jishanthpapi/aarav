import { SolverTier } from '../types/simulation';

export async function detectBestTier(): Promise<SolverTier> {
  if (!navigator.gpu) {
    console.warn("WebGPU not supported, falling back to WebGL2.");
    return "fallback";
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return "fallback";

    // Simple heuristic: if it's a mobile device or low-power integrated GPU, use Medium
    // In a real app, we'd check adapter.limits or adapter.info
    return "high";
  } catch (e) {
    return "fallback";
  }
}
