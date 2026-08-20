import { describe, expect, it } from 'vitest';

import { canonicalSceneV03String, createBlankSceneV03 } from '../../../src/domain';
import {
  addSceneLayerCommand,
  createSceneCommandContext,
  createSceneEditorStore,
  remixScenePaletteCommand,
  updateSceneMaterialCommand,
  updateSceneMaterialBoundaryCommand,
} from '../../../src/editor';
import { createSceneMaterialTemplate } from '../../../src/app/session/sceneTemplates';

function addGlow() {
  const store = createSceneEditorStore(createBlankSceneV03());
  const context = createSceneCommandContext({ value: 500 });
  const result = store.commitDesignCommand(
    addSceneLayerCommand(createSceneMaterialTemplate(store.getCurrentRecipe(), 'glow'), context),
  );
  expect(result.ok).toBe(true);
  const material = store.getCurrentRecipe().rootGroups[0]?.children[0];
  if (material?.kind !== 'material') throw new Error('Glow template did not create one material.');
  return { store, materialId: material.id };
}

describe('v0.3 material commands', () => {
  it('skips occupied deterministic IDs when adding a new top-level layer', () => {
    const store = createSceneEditorStore(createBlankSceneV03());
    const first = createSceneCommandContext({ value: 700 });
    expect(
      store.commitDesignCommand(
        addSceneLayerCommand(createSceneMaterialTemplate(store.getCurrentRecipe(), 'glow'), first),
      ).ok,
    ).toBe(true);

    const reusedSequence = createSceneCommandContext({ value: 700 });
    expect(
      store.commitDesignCommand(
        addSceneLayerCommand(
          createSceneMaterialTemplate(store.getCurrentRecipe(), 'band'),
          reusedSequence,
        ),
      ).ok,
    ).toBe(true);
    expect(store.getCurrentRecipe().rootGroups).toHaveLength(2);
    expect(new Set(store.getCurrentRecipe().rootGroups.map((group) => group.id))).toHaveLength(2);
  });

  it('commits fill, soft edge, bloom, interaction, and grain as one undoable material change', () => {
    const { store, materialId } = addGlow();
    const before = canonicalSceneV03String(store.getCurrentRecipe());
    const result = store.commitDesignCommand(
      updateSceneMaterialCommand(materialId, {
        fill: { kind: 'local', color: '#FF3344' },
        opacity: 0.54,
        edgeFeather: 0.71,
        bloom: 0.38,
        interaction: 'keep-base-hue',
        grain: { kind: 'film', amount: 0.16, scale: 0.48, seed: 47 },
      }),
    );
    expect(result.ok).toBe(true);
    const after = canonicalSceneV03String(store.getCurrentRecipe());
    expect(after).not.toBe(before);
    const material = store.getCurrentRecipe().rootGroups[0]?.children[0];
    expect(material).toMatchObject({
      kind: 'material',
      fill: { kind: 'local', color: '#FF3344' },
      opacity: 0.54,
      edgeFeather: 0.71,
      bloom: 0.38,
      interaction: 'keep-base-hue',
      grain: { kind: 'film', amount: 0.16, scale: 0.48, seed: 47 },
    });
    expect(store.getSnapshot().history.entries).toHaveLength(2);

    expect(store.undo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(before);
    expect(store.redo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(after);
  });

  it('removes a grain overlay explicitly without affecting the material body', () => {
    const { store, materialId } = addGlow();
    expect(
      store.commitDesignCommand(
        updateSceneMaterialCommand(materialId, {
          grain: { kind: 'grain', amount: 0.1, scale: 0.3, seed: 9 },
        }),
      ).ok,
    ).toBe(true);
    expect(
      store.commitDesignCommand(updateSceneMaterialCommand(materialId, { grain: undefined })).ok,
    ).toBe(true);
    const material = store.getCurrentRecipe().rootGroups[0]?.children[0];
    expect(material?.kind === 'material' ? material.grain : undefined).toBeUndefined();
  });

  it('rejects invalid material sources before committed state changes', () => {
    const { store, materialId } = addGlow();
    const before = canonicalSceneV03String(store.getCurrentRecipe());
    const historyLength = store.getSnapshot().history.entries.length;
    const rejected = store.commitDesignCommand(
      updateSceneMaterialCommand(materialId, {
        fill: { kind: 'palette', paletteId: 'pal_000000000000000000000099' },
      }),
    );

    expect(rejected.ok).toBe(false);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(before);
    expect(store.getSnapshot().history.entries).toHaveLength(historyLength);
  });

  it('remixes palette-linked materials without changing local fill overrides', () => {
    const { store, materialId } = addGlow();
    const linkedBefore = store.getCurrentRecipe().palette[0]!.color;
    const localResult = store.commitDesignCommand(
      updateSceneMaterialCommand(materialId, { fill: { kind: 'local', color: '#FF3344' } }),
    );
    expect(localResult.ok).toBe(true);
    const before = canonicalSceneV03String(store.getCurrentRecipe());
    const historyBefore = store.getSnapshot().history.entries.length;

    const result = store.commitDesignCommand(
      remixScenePaletteCommand(['#6FE0D7', '#78A9FF', '#F5A7D8', '#FFF4E8']),
    );
    expect(result.ok).toBe(true);
    const after = canonicalSceneV03String(store.getCurrentRecipe());
    expect(after).not.toBe(before);
    expect(store.getCurrentRecipe().palette[0]?.color).not.toBe(linkedBefore);
    const material = store.getCurrentRecipe().rootGroups[0]?.children[0];
    expect(material).toMatchObject({ kind: 'material', fill: { kind: 'local', color: '#FF3344' } });
    expect(store.getSnapshot().history.entries).toHaveLength(historyBefore + 1);

    expect(store.undo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(before);
    expect(store.redo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(after);
  });

  it('accepts one valid Boundary edit but rejects a crossing replacement before history changes', () => {
    const { store, materialId } = addGlow();
    const before = canonicalSceneV03String(store.getCurrentRecipe());
    const valid = {
      vertices: [
        { x: 0.16, y: 0.18 },
        { x: 0.84, y: 0.24 },
        { x: 0.71, y: 0.8 },
        { x: 0.3, y: 0.72 },
      ],
    };
    expect(
      store.commitDesignCommand(updateSceneMaterialBoundaryCommand(materialId, valid)).ok,
    ).toBe(true);
    const after = canonicalSceneV03String(store.getCurrentRecipe());
    expect(after).not.toBe(before);
    expect(store.undo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(before);
    expect(store.redo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(after);

    const historyLength = store.getSnapshot().history.entries.length;
    const rejected = store.commitDesignCommand(
      updateSceneMaterialBoundaryCommand(materialId, {
        vertices: [
          { x: 0.15, y: 0.15 },
          { x: 0.85, y: 0.85 },
          { x: 0.15, y: 0.85 },
          { x: 0.85, y: 0.15 },
        ],
      }),
    );
    expect(rejected.ok).toBe(false);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(after);
    expect(store.getSnapshot().history.entries).toHaveLength(historyLength);
  });
});
