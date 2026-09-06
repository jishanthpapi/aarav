import test from 'node:test';
import assert from 'node:assert/strict';
import { gridCellBudget, planDomain, reynoldsFor } from '../src/engine/GridPlanner.ts';
import { CAR_BOUNDS, CAR_LENGTH } from '../src/data/vehicles/genericCar.ts';

const cube = { min: [0, 0, 0], max: [1, 1, 1] };
const cells = plan => plan.grid.nx * plan.grid.ny * plan.grid.nz;
const MiB = 1024 * 1024;
const defaultLimits = { maxStorageBufferBindingSize: 128 * MiB, maxBufferSize: 256 * MiB };

test('domain planning uses the final cell dimensions when enforcing a small budget', () => {
  const smallest = planDomain(cube, 120, 16 ** 3);
  assert.deepEqual([smallest.grid.nx, smallest.grid.ny, smallest.grid.nz], [16, 16, 16]);
  const boundary = planDomain(cube, 120, 20 * 16 * 16);
  assert.deepEqual([boundary.grid.nx, boundary.grid.ny, boundary.grid.nz], [20, 16, 16]);
  assert.ok(Math.abs(boundary.cellsPerLength - 20 / 12) < 1e-12);
  assert.throws(() => planDomain(cube, 120, 4095), /at least/);
});

test('the existing car domain fills the budget without a coarse percentage decrement', () => {
  const plan = planDomain(CAR_BOUNDS, 24, 400_000);
  assert.deepEqual([plan.grid.nx, plan.grid.ny, plan.grid.nz], [207, 42, 46]);
  assert.equal(cells(plan), 399_924);
  assert.ok(Math.abs(CAR_LENGTH / plan.grid.dx - plan.cellsPerLength) < 1e-12);
  // An independently calculated slightly finer spacing exceeds the budget.
  const dx = plan.grid.dx / (1 + 1e-9);
  const n = Math.ceil(51 / dx) * Math.ceil(10.25 / dx) * Math.ceil(11.2 / dx);
  assert.ok(n > 400_000);
});

test('planning retains the target resolution when it already fits', () => {
  const plan = planDomain(CAR_BOUNDS, 24, 2_000_000);
  assert.equal(plan.cellsPerLength, 24);
  assert.equal(plan.grid.dx, CAR_LENGTH / 24);
});

test('a texture dimension limit constrains every axis independently of cell memory', () => {
  const plan = planDomain(cube, 120, 5_000_000, 128);
  assert.equal(plan.grid.nx, 128);
  assert.ok(plan.grid.ny <= 128 && plan.grid.nz <= 128);
  assert.ok(Math.abs(plan.cellsPerLength - 128 / 12) < 1e-12);
  const wide = planDomain({ min: [0, 0, 0], max: [1, 100, 1] }, 120, 5_000_000, 64);
  assert.equal(wide.grid.ny, 64);
  assert.ok(wide.grid.nx <= 64 && wide.grid.nz <= 64);
});

test('larger budgets produce monotonic refinement while Reynolds limits remain explicit', () => {
  let previous = 0;
  for (const budget of [4096, 100_000, 400_000, 800_000, 1_200_000, 1_700_000]) {
    const plan = planDomain(CAR_BOUNDS, 120, budget);
    assert.ok(cells(plan) <= budget);
    assert.ok(plan.cellsPerLength >= previous);
    previous = plan.cellsPerLength;
  }
  const finer = planDomain(CAR_BOUNDS, 120, 1_700_000);
  assert.ok(finer.cellsPerLength > 28);
  assert.ok(finer.grid.dx < 0.16);
  const re = reynoldsFor(100, CAR_LENGTH, finer.cellsPerLength, 0.05, true);
  assert.equal(re.resolutionLimited, true);
  assert.ok(re.achieved < re.requested / 100);
  assert.equal(finer.fidelity, 'coarse');
});

test('invalid geometry, budgets, resolution and dimension limits fail before allocation', () => {
  for (const target of [0, -1, NaN, Infinity]) assert.throws(() => planDomain(cube, target, 400_000));
  for (const budget of [0, -1, 4096.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => planDomain(cube, 24, budget));
  }
  for (const dimension of [0, 15, 16.5, NaN, -Infinity]) {
    assert.throws(() => planDomain(cube, 24, 400_000, dimension));
  }
  for (const max of [[0, 1, 1], [1, -1, 1], [1, 1, Infinity]]) {
    assert.throws(() => planDomain({ ...cube, max }, 24, 400_000));
  }
});

test('cell capacity respects both individual buffer limits and requested budget', () => {
  assert.equal(gridCellBudget(defaultLimits, 3_000_000), Math.floor(128 * MiB / 76));
  assert.equal(gridCellBudget(defaultLimits, 50_000), 50_000);
  assert.equal(gridCellBudget({ ...defaultLimits, maxBufferSize: MiB }, 3_000_000), Math.floor(MiB / 76));
});

test('larger buffer support still respects the 512 MiB solver allocation policy', () => {
  const limits = { maxStorageBufferBindingSize: 512 * MiB, maxBufferSize: 1024 * MiB };
  const budget = gridCellBudget(limits, 20_000_000);
  assert.equal(budget, Math.floor((512 * MiB - 48) / 288));
  assert.ok(budget * 288 + 48 <= 512 * MiB);
  assert.ok((budget + 1) * 288 + 48 > 512 * MiB);
});

test('capacity rejects invalid numeric limits instead of silently returning NaN', () => {
  for (const requested of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => gridCellBudget(defaultLimits, requested));
  }
  assert.throws(() => gridCellBudget({ ...defaultLimits, maxBufferSize: NaN }, 400_000));
  assert.throws(() => gridCellBudget({ ...defaultLimits, maxStorageBufferBindingSize: 0 }, 400_000));
});
