import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3 } from 'three';

// Bake the bundled CC0 meshes once so the renderer and voxel worker use exactly
// the same transformed vertices. This does not download or approximate assets.
const names = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'van', 'race', 'race-future'];
const output = {};
for (const name of names) {
  const file = await readFile(new URL(`../assets/kenney-car-kit/Models/GLB format/${name}.glb`, import.meta.url));
  const jsonLength = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString());
  const binary = file.subarray(28 + jsonLength);
  const accessor = index => {
    const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    if (!bytes || !components || a.sparse) throw new Error('Unsupported asset accessor.');
    const values = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < components; c++) {
      const at = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? bytes * components) + c * bytes;
      values.push(a.componentType === 5126 ? binary.readFloatLE(at) : binary.readUIntLE(at, bytes));
    }
    return values;
  };
  const parts = [];
  const walk = (index, parent) => {
    const node = gltf.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
      new Vector3(...(node.scale ?? [1, 1, 1])));
    const matrix = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Only triangle assets are supported.');
      const positions = accessor(primitive.attributes.POSITION);
      const uv = primitive.attributes.TEXCOORD_0 !== undefined ? accessor(primitive.attributes.TEXCOORD_0) : null;
      const indices = primitive.indices !== undefined ? accessor(primitive.indices) : positions.map((_, i) => i).filter(i => i < positions.length / 3);
      const p = [], u = [];
      for (const i of indices) {
        const v = new Vector3(...positions.slice(i * 3, i * 3 + 3)).applyMatrix4(matrix);
        // Pack front wheels are on +Z. Rotate that nose to -X, the flow inlet.
        p.push(-v.z, v.y, v.x);
        if (uv) u.push(...uv.slice(i * 2, i * 2 + 2));
      }
      parts.push({ id: node.name === 'body' ? 'chassis' : node.name, positions: p, uvs: u });
    }
    for (const child of node.children ?? []) walk(child, matrix);
  };
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) walk(index, new Matrix4());
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) part.positions.forEach((v, i) => { min[i % 3] = Math.min(min[i % 3], v); max[i % 3] = Math.max(max[i % 3], v); });
  const scale = 4 / (max[0] - min[0]);
  for (const part of parts) part.positions = part.positions.map((v, i) => Number(((v - (i % 3 === 1 ? min[1] : (min[i % 3] + max[i % 3]) / 2)) * scale).toFixed(6)));
  output[name] = { height: (max[1] - min[1]) * scale, width: (max[2] - min[2]) * scale, parts };
}
await mkdir(new URL('../src/data/vehicles/generated/', import.meta.url), { recursive: true });
await writeFile(new URL('../src/data/vehicles/generated/kenney.json', import.meta.url), JSON.stringify(output));
console.log(`Baked ${names.length} CC0 vehicle assets with shared positions and UVs.`);
