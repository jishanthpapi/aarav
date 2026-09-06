import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
test('source assets and explicit asset rendering path are present', () => {
  const component = fs.readFileSync(path.join(root, 'src/components/three/GenericCar.tsx'), 'utf8');
  const catalog = fs.readFileSync(path.join(root, 'src/data/vehicles/catalog.ts'), 'utf8');
  assert.match(component, /useGLTF/);
  assert.match(component, /<primitive[^>]+object=\{model\}/);
  assert.match(component, /renderMode/);
  assert.match(catalog, /baseModelPath/);
  assert.ok(fs.existsSync(path.join(root, 'assets/B777_LARC_AIR_0626.glb')));
  assert.ok(fs.existsSync(path.join(root, 'assets/kenney-car-kit/Models/GLB format/sedan.glb')));
  assert.ok(fs.existsSync(path.join(root, 'docs/fallback-runtime-measurements.json')));
});
