export interface ConvergenceState {
  converged: boolean;
  developing: boolean;
  mean: number;
  ci95: number;
  samples: number;
  stepsRun: number;
  residual: number;
}

export class ConvergenceMonitor {
  private history: number[] = [];
  private steps = 0;

  constructor(
    private readonly transientSteps: number,
    private readonly window = 400,
    private readonly tol = 0.005,
  ) {}

  push(value: number): ConvergenceState {
    this.steps++;
    if (this.steps <= this.transientSteps || !Number.isFinite(value)) {
      return {
        converged: false, developing: true, mean: value, ci95: NaN,
        samples: 0, stepsRun: this.steps, residual: NaN,
      };
    }

    this.history.push(value);
    if (this.history.length > this.window) this.history.shift();

    const n = this.history.length;
    const mean = this.history.reduce((a, b) => a + b, 0) / n;

    let varSum = 0, autoSum = 0;
    for (let i = 0; i < n; i++) varSum += (this.history[i] - mean) ** 2;
    for (let i = 1; i < n; i++) autoSum += (this.history[i] - mean) * (this.history[i - 1] - mean);
    const variance = varSum / Math.max(n - 1, 1);
    const rho = variance > 0 ? Math.max(-0.99, Math.min(0.99, autoSum / varSum)) : 0;
    const nEff = Math.max(2, n * (1 - rho) / (1 + rho));

    const stderr = Math.sqrt(variance / nEff);
    const ci95 = 1.96 * stderr;
    const residual = Math.abs(mean) > 1e-9 ? stderr / Math.abs(mean) : Infinity;

    return {
      converged: n >= this.window * 0.5 && residual < this.tol,
      developing: false,
      mean, ci95, samples: n, stepsRun: this.steps, residual,
    };
  }

  reset() { this.history = []; this.steps = 0; }
}
