export const GRID_QUALITIES = {
  responsive: { label: 'Responsive', cellBudget: 400_000 },
  fine: { label: 'Fine', cellBudget: 900_000 },
  maximum: { label: 'Maximum detail', cellBudget: 2_000_000 },
} as const;

export type GridQuality = keyof typeof GRID_QUALITIES;

// The device/renderer limits and memory policy determine the achieved resolution.
export const TARGET_CELLS_PER_LENGTH = 128;
