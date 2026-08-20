import { describe, expect, it } from 'vitest';

import { createBlankSceneV03, validateBoundary, validateSceneV03 } from '../../../src/domain';
import {
  addSceneLayerAtTransformCommand,
  createSceneCommandContext,
  createSceneEditorStore,
} from '../../../src/editor';
import {
  checkFreeformAppend,
  checkFreeformClosure,
  createFreeformLayerTemplate,
  isNearFreeformStart,
} from '../../../src/app/session/freeformBoundary';

describe('v0.3 freeform Boundary authoring', () => {
  it('rejects a crossing segment before it becomes part of the draft', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ];

    expect(checkFreeformAppend(points, { x: 0.9, y: 0.1 })).toMatchObject({ ok: false });
    expect(checkFreeformAppend(points, { x: 0.1, y: 0.1 })).toMatchObject({ ok: false });
  });

  it('only closes when a draft reaches its first point and the resulting body is simple', () => {
    const triangle = [
      { x: 0.18, y: 0.2 },
      { x: 0.82, y: 0.32 },
      { x: 0.45, y: 0.78 },
    ];

    expect(isNearFreeformStart(triangle, { x: 0.2, y: 0.22 })).toBe(true);
    expect(isNearFreeformStart(triangle, { x: 0.35, y: 0.35 })).toBe(false);
    expect(checkFreeformClosure(triangle)).toEqual({ ok: true });
    expect(
      checkFreeformClosure([
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.9, y: 0.1 },
        { x: 0.1, y: 0.9 },
      ]),
    ).toMatchObject({ ok: false });
  });

  it('creates one valid frontmost portable layer from the artboard-relative points', () => {
    const scene = createBlankSceneV03();
    scene.artboard = { ratio: '2:1', fitMode: 'cover' };
    const template = createFreeformLayerTemplate(scene, [
      { x: 0.15, y: 0.2 },
      { x: 0.8, y: 0.3 },
      { x: 0.52, y: 0.75 },
    ]);
    const store = createSceneEditorStore(scene);
    const result = store.commitDesignCommand(
      addSceneLayerAtTransformCommand(
        template.material,
        template.transform,
        createSceneCommandContext({ value: 900 }),
      ),
    );

    expect(result.ok).toBe(true);
    const layer = store.getCurrentRecipe().rootGroups.at(-1);
    const material = layer?.children[0];
    expect(layer?.name).toBe('Freeform Boundary 1');
    expect(
      material?.kind === 'material' ? validateBoundary(material.geometry.boundary) : undefined,
    ).toEqual({
      ok: true,
    });
    expect(validateSceneV03(store.getCurrentRecipe()).ok).toBe(true);
    expect(store.getSnapshot().history.entries).toHaveLength(1);
  });
});
