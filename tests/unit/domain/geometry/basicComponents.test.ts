import { describe, expect, it } from 'vitest';

import { createBand, compileBandGeometry } from '../../../../src/domain/geometry/band.js';
import {
  compileFieldGeometry,
  createDefaultField,
} from '../../../../src/domain/geometry/defaultField.js';
import type { Band, Field } from '../../../../src/domain/recipe/types.js';

const stableId = (prefix: 'cmp' | 'anc', index: number): string =>
  `${prefix}_${String(index).padStart(26, '0')}`;

const componentId = stableId('cmp', 1);
const anchorId = (index: number): string => stableId('anc', index + 1);

const clone = <T>(value: T): T => structuredClone(value);

describe('basic Field and Band geometry contracts', () => {
  it('creates a valid ten-anchor default Field with deterministic IDs and cyclic order', () => {
    const first = createDefaultField({ id: componentId, createAnchorId: anchorId });
    const second = createDefaultField({ id: componentId, createAnchorId: anchorId });

    expect(first).toEqual(second);
    expect(first.type).toBe('field');
    expect(first.id).toBe(componentId);
    expect(first.contour.anchors).toHaveLength(10);
    expect(first.contour.anchors.map(({ id }) => id)).toEqual(
      Array.from({ length: 10 }, (_, index) => anchorId(index)),
    );
    expect(new Set(first.contour.anchors.map(({ id }) => id)).size).toBe(10);
    for (const anchor of first.contour.anchors) {
      expect(anchor.x).toBeGreaterThanOrEqual(0);
      expect(anchor.x).toBeLessThanOrEqual(1);
      expect(anchor.y).toBeGreaterThanOrEqual(0);
      expect(anchor.y).toBeLessThanOrEqual(1);
      expect(Number.isFinite(anchor.x)).toBe(true);
      expect(Number.isFinite(anchor.y)).toBe(true);
    }
  });

  it('keeps Band parametric and deterministic without Field contour state', () => {
    const first = createBand({ id: stableId('cmp', 2) });
    const second = createBand({ id: stableId('cmp', 2) });

    expect(first).toEqual(second);
    expect(first.type).toBe('band');
    expect(first.id).toBe(stableId('cmp', 2));
    expect(first.band.endCap).toMatch(/^(round|flat)$/);
    expect(first.band.taper).toBeGreaterThanOrEqual(0);
    expect(first.band.taper).toBeLessThanOrEqual(1);
    expect(first).not.toHaveProperty('contour');
  });

  it('compiles Field geometry as a closed PathIR with anchor provenance', () => {
    const field = createDefaultField({ id: componentId, createAnchorId: anchorId });
    const path = compileFieldGeometry(field);

    expect(path).toMatchObject({ kind: 'path', version: 'path-ir-v1' });
    expect(path.sourceComponentId).toBe(field.id);
    expect(path.sourceAnchorIds).toEqual(field.contour.anchors.map(({ id }) => id));
    expect(path.commands[0]).toMatchObject({ kind: 'move' });
    expect(path.commands.at(-1)).toEqual({ kind: 'close' });
    expect(path.commands).toHaveLength(field.contour.anchors.length + 2);
    for (const command of path.commands) {
      if (command.kind === 'close') continue;
      expect(Number.isFinite(command.x)).toBe(true);
      expect(Number.isFinite(command.y)).toBe(true);
    }
  });

  it('compiles a parametric Band to a closed PathIR without anchor topology', () => {
    const band = createBand({ id: stableId('cmp', 2) });
    const path = compileBandGeometry(band);

    expect(path).toMatchObject({ kind: 'path', version: 'path-ir-v1' });
    expect(path.sourceComponentId).toBe(band.id);
    expect(path.sourceAnchorIds).toBeUndefined();
    expect(path.commands[0]).toMatchObject({ kind: 'move' });
    expect(path.commands.at(-1)).toEqual({ kind: 'close' });
    expect(path.commands.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects invalid Field and Band inputs atomically', () => {
    const field = createDefaultField({ id: componentId, createAnchorId: anchorId });
    const invalidField = clone(field) as Field;
    invalidField.contour.anchors = invalidField.contour.anchors.slice(0, 9);
    const fieldBefore = clone(invalidField);

    expect(() => compileFieldGeometry(invalidField)).toThrow();
    expect(invalidField).toEqual(fieldBefore);

    const invalidBand = clone(createBand({ id: stableId('cmp', 2) })) as Band;
    invalidBand.band.taper = 2;
    const bandBefore = clone(invalidBand);

    expect(() => compileBandGeometry(invalidBand)).toThrow();
    expect(invalidBand).toEqual(bandBefore);
  });
});
