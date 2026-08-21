import { describe, expect, it } from 'vitest';

import {
  createBlobBoundary,
  createCircleBoundary,
  createEllipseBoundary,
  createPolygonBoundary,
  createPrimitiveBoundary,
  createRibbonBoundary,
  createRoundedRectangleBoundary,
  createSilhouetteBoundary,
  createSolidStarBoundary,
  createTriangleBoundary,
  signedBoundaryArea,
  validateBoundary,
} from '../../../../src/domain/index.js';

const validTriangle = {
  vertices: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.5, y: 0.8 },
  ],
};

function issueCodes(value: unknown): string[] {
  const result = validateBoundary(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('shared v0.3 Boundary contract', () => {
  it('accepts a simple closed triangle and reports its signed area', () => {
    expect(validateBoundary(validTriangle)).toEqual({ ok: true });
    expect(signedBoundaryArea(validTriangle.vertices)).toBeGreaterThan(0);
  });

  it('permits practical local overscan while keeping a finite authoring boundary', () => {
    expect(
      validateBoundary({
        vertices: [
          { x: -0.35, y: 0.2 },
          { x: 1.25, y: 0.3 },
          { x: 0.5, y: 1.2 },
        ],
      }),
    ).toEqual({ ok: true });
    expect(
      issueCodes({
        vertices: [
          { x: -2.1, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.5, y: 0.8 },
        ],
      }),
    ).toContain('boundary-coordinate-out-of-range');
  });

  it('rejects degenerate, repeated, and self-crossing polygon data', () => {
    expect(issueCodes({ vertices: validTriangle.vertices.slice(0, 2) })).toContain(
      'invalid-boundary-count',
    );
    expect(
      issueCodes({
        vertices: Array.from({ length: 65 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 65;
          return { x: 0.5 + Math.cos(angle) * 0.35, y: 0.5 + Math.sin(angle) * 0.35 };
        }),
      }),
    ).toContain('invalid-boundary-count');
    expect(
      issueCodes({
        vertices: [
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.8 },
        ],
      }),
    ).toContain('repeated-adjacent-vertex');
    expect(
      issueCodes({
        vertices: [
          { x: 0.2, y: 0.2 },
          { x: 0.5, y: 0.5 },
          { x: 0.8, y: 0.8 },
        ],
      }),
    ).toContain('degenerate-boundary');
    expect(
      issueCodes({
        vertices: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.8 },
          { x: 0.8, y: 0.2 },
          { x: 0.2, y: 0.8 },
        ],
      }),
    ).toContain('self-intersection');
  });

  it('creates valid single-body primitive and silhouette Boundaries', () => {
    const boundaries = [
      createRoundedRectangleBoundary(),
      createEllipseBoundary(),
      createCircleBoundary(),
      createTriangleBoundary(),
      createPolygonBoundary(),
      createSolidStarBoundary(),
      createRibbonBoundary(),
      createBlobBoundary(),
      createSilhouetteBoundary('cube'),
      createSilhouetteBoundary('sphere'),
      createSilhouetteBoundary('cylinder'),
      createSilhouetteBoundary('cone'),
      createSilhouetteBoundary('pyramid'),
      createSilhouetteBoundary('prism'),
    ];

    for (const boundary of boundaries) {
      expect(boundary.vertices.length).toBeGreaterThanOrEqual(3);
      expect(boundary.vertices.length).toBeLessThanOrEqual(64);
      expect(validateBoundary(boundary)).toEqual({ ok: true });
    }
  });

  it('keeps the named primitive menu factory complete and produces valid stars and ribbons', () => {
    for (const kind of [
      'rounded-rectangle',
      'ellipse',
      'triangle',
      'polygon',
      'solid-star',
      'ribbon',
      'blob',
      'cube',
      'sphere',
      'cylinder',
      'cone',
      'pyramid',
      'prism',
    ] as const) {
      expect(validateBoundary(createPrimitiveBoundary(kind))).toEqual({ ok: true });
    }

    expect(createSolidStarBoundary().vertices).toHaveLength(10);
    expect(createRibbonBoundary().vertices).toHaveLength(4);
  });
});
