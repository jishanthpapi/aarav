/**
 * Grid dependence under the wall model — deliberately NOT called convergence
 * and NOT routed through gridConvergenceIndex(). Refining the grid moves the
 * first cell, changes y+, and changes how much of the near-wall momentum
 * transport the model is carrying vs. the solver resolving, so there is no
 * single grid-independent answer to converge toward.
 */
export interface SensitivityResult {
  spread: number;
  yPlusMedians: [number, number, number];
  leavesBand: boolean;
  pass: boolean;
  note: string;
}

const MAX_SPREAD = 0.15;

export function evaluateSensitivity(
  values: [number, number, number],
  yPlusMedians: [number, number, number],
): SensitivityResult {
  const spread = (Math.max(...values) - Math.min(...values)) / Math.abs(values[2]);
  const leavesBand = yPlusMedians[2] < 30;

  const notes: string[] = [];
  if (leavesBand) {
    notes.push(
      `The finest grid has median y+ ${yPlusMedians[2].toFixed(1)}, below the wall ` +
      `model's band. Expect double-counting of near-wall transport — the correct ` +
      `fix is the blend function standing the model down, not a tolerance change.`,
    );
  }
  if (spread > MAX_SPREAD) {
    notes.push(
      `Result moves ${(spread * 100).toFixed(1)}% across the grid triplet. That is ` +
      `model sensitivity, not discretisation error — it must not be quoted as a ` +
      `numerical uncertainty.`,
    );
  }

  return {
    spread, yPlusMedians, leavesBand,
    pass: spread <= MAX_SPREAD,
    note: notes.join(' ') || `Bounded: ${(spread * 100).toFixed(1)}% across the grid triplet.`,
  };
}
