export interface FuzzCase {
  id: string;
  description: string;
  build: () => Float32Array;
  expectInvalidReadout: boolean;
}

const tri = (...v: number[]) => v;

export const FUZZ_CASES: FuzzCase[] = [
  {
    id: 'degenerate-triangle',
    description: 'Three identical vertices — zero area',
    build: () => new Float32Array(tri(0, 0, 0, 0, 0, 0, 0, 0, 0)),
    expectInvalidReadout: true,
  },
  {
    id: 'zero-thickness-plate',
    description: 'Two coplanar triangles, no enclosed volume',
    build: () => new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 0, 1,
      0, 0, 0, 1, 0, 1, 0, 0, 1,
    ]),
    expectInvalidReadout: false,
  },
  {
    id: 'sub-cell-part',
    description: 'Body smaller than one lattice cell — voxelizes to nothing',
    build: () => new Float32Array([0, 0, 0, 1e-4, 0, 0, 0, 1e-4, 0]),
    expectInvalidReadout: true,
  },
  {
    id: 'self-intersecting',
    description: 'Two triangles crossing through each other',
    build: () => new Float32Array([
      0, 0, 0, 2, 0, 0, 1, 2, 0,
      1, -1, 0, 1, 1, 0, 1, 0, 2,
    ]),
    expectInvalidReadout: false,
  },
  {
    id: 'non-finite-vertex',
    description: 'NaN in the vertex buffer',
    build: () => new Float32Array([0, 0, 0, NaN, 0, 0, 1, 1, 0]),
    expectInvalidReadout: true,
  },
  {
    id: 'inverted-winding',
    description: 'Reversed winding order',
    build: () => new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]),
    expectInvalidReadout: false,
  },
  {
    id: 'far-outside-domain',
    description: 'Geometry entirely outside the tunnel',
    build: () => new Float32Array([1e6, 1e6, 1e6, 1e6 + 1, 1e6, 1e6, 1e6, 1e6 + 1, 1e6]),
    expectInvalidReadout: true,
  },
];

export interface FuzzResult {
  id: string;
  crashed: boolean;
  producedNonFinite: boolean;
  readoutValid: boolean;
  pass: boolean;
  failure?: string;
}

export function judgeFuzz(c: FuzzCase, r: Omit<FuzzResult, 'pass' | 'failure' | 'id'>): FuzzResult {
  if (r.crashed) return { id: c.id, ...r, pass: false, failure: 'threw or hung' };
  if (r.producedNonFinite) return { id: c.id, ...r, pass: false, failure: 'NaN/Inf reached the field' };
  if (c.expectInvalidReadout && r.readoutValid) {
    return { id: c.id, ...r, pass: false, failure: 'reported a confident number for invalid geometry' };
  }
  return { id: c.id, ...r, pass: true };
}
