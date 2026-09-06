import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLogLaw, checkSkinFriction, checkYPlusBand, checkModelInertWhenResolved, checkStallAngleUnmoved } from '../src/validation/wallModel.ts';

// Tests of the gate logic, not simulated evidence that the wall model is valid.
test('all five wall gates reject missing or clearly invalid benchmark evidence', () => {
  assert.equal(checkLogLaw([]).pass, false);
  assert.equal(checkSkinFriction([]).pass, false);
  assert.equal(checkYPlusBand({ min:0,max:300,median:10,inBandFraction:0.1,resolvedFraction:0.1,nonFinite:1,uiWarnsCoverage:true }).pass, false);
  assert.equal(checkModelInertWhenResolved(0.3,0.5,0.5).pass, false);
  assert.equal(checkModelInertWhenResolved(0.3,0.3,10).pass, false);
  assert.equal(checkStallAngleUnmoved(12,16).pass, false);
});
