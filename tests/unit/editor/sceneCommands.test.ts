import { describe, expect, it } from 'vitest';

import {
  canonicalSceneV03String,
  createBlankSceneV03,
  createRoundedRectangleBoundary,
  sceneV03IdFromBytes,
  type SceneMaterial,
  type SceneV03,
} from '../../../src/domain';
import {
  addSceneLayerCommand,
  createSceneCommandContext,
  createSceneEditorStore,
  deleteSceneLayerCommand,
  duplicateSceneLayerCommand,
  reframeSceneContentCommand,
  SCENE_REFRAME_SAFE_PADDING,
  renameSceneLayerCommand,
  reorderSceneLayerCommand,
  replaceSceneV03Command,
  setSceneLayerVisibilityCommand,
  updateSceneLayerTransformCommand,
  updateSceneArtboardCommand,
  updateScenePaletteEntryCommand,
  type SceneStoragePort,
} from '../../../src/editor';
import { compileSceneRenderIR, transformSceneRenderPoint } from '../../../src/renderers';

class MemoryStorage implements SceneStoragePort {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function fixedId(kind: 'material', slot: number): string {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, slot, false);
  return sceneV03IdFromBytes(kind, bytes);
}

function material(scene: SceneV03, name: string): SceneMaterial {
  return {
    kind: 'material',
    id: fixedId('material', 900),
    name,
    visible: true,
    geometry: { kind: 'boundary', boundary: createRoundedRectangleBoundary({ cornerRadius: 0 }) },
    fill: { kind: 'palette', paletteId: scene.palette[0]!.id },
    opacity: 0.72,
    edgeFeather: 0.18,
    bloom: 0.12,
    interaction: 'glow',
  };
}

function commit<Command>(store: ReturnType<typeof createSceneEditorStore>, command: Command): void {
  const result = store.commitDesignCommand(command as never);
  expect(result.ok, result.ok ? undefined : result.diagnostics[0]?.message).toBe(true);
}

describe('v0.3 scene editor commands', () => {
  it('adds every new layer at the front and persists each accepted history transition', () => {
    const storage = new MemoryStorage();
    const store = createSceneEditorStore(createBlankSceneV03(), { storage });
    const ids = { value: 100 };
    const context = createSceneCommandContext(ids);

    commit(store, addSceneLayerCommand(material(store.getCurrentRecipe(), 'Blue glow'), context));
    const first = store.getCurrentRecipe().rootGroups[0]!;
    commit(store, addSceneLayerCommand(material(store.getCurrentRecipe(), 'Rose glow'), context));
    const second = store.getCurrentRecipe().rootGroups[1]!;
    commit(store, duplicateSceneLayerCommand(second.id, context));

    const current = store.getCurrentRecipe();
    expect(current.rootGroups.map((group) => group.name)).toEqual([
      'Blue glow',
      'Rose glow',
      'Rose glow copy',
    ]);
    expect(current.rootGroups.at(-1)?.children[0]?.kind).toBe('material');
    expect(current.rootGroups.at(-1)?.id).not.toBe(second.id);
    expect(current.rootGroups[0]?.id).toBe(first.id);
    expect(store.getSnapshot().history.entries).toHaveLength(3);
    expect(store.getSnapshot().persistence.kind).toBe('cached');
    expect(storage.values.size).toBe(1);

    const copiedScene = canonicalSceneV03String(current);
    const undone = store.undo();
    expect(undone.ok).toBe(true);
    expect(store.getCurrentRecipe().rootGroups).toHaveLength(2);
    const redone = store.redo();
    expect(redone.ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(copiedScene);
  });

  it('makes layer and palette edits individually undoable and redoable', () => {
    const store = createSceneEditorStore(createBlankSceneV03());
    const context = createSceneCommandContext({ value: 200 });
    commit(store, addSceneLayerCommand(material(store.getCurrentRecipe(), 'First layer'), context));
    commit(
      store,
      addSceneLayerCommand(material(store.getCurrentRecipe(), 'Second layer'), context),
    );
    const firstId = store.getCurrentRecipe().rootGroups[0]!.id;
    const paletteId = store.getCurrentRecipe().palette[0]!.id;

    const assertAtomic = (next: Parameters<typeof store.commitDesignCommand>[0]): void => {
      const before = canonicalSceneV03String(store.getCurrentRecipe());
      const lengthBefore = store.getSnapshot().history.entries.length;
      commit(store, next);
      const after = canonicalSceneV03String(store.getCurrentRecipe());
      expect(after).not.toBe(before);
      expect(store.getSnapshot().history.entries).toHaveLength(lengthBefore + 1);
      expect(store.undo().ok).toBe(true);
      expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(before);
      expect(store.redo().ok).toBe(true);
      expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(after);
    };

    assertAtomic(renameSceneLayerCommand(firstId, 'Renamed first layer'));
    assertAtomic(setSceneLayerVisibilityCommand(firstId, false));
    assertAtomic(
      updateSceneLayerTransformCommand(firstId, {
        translation: { x: 0.3, y: 0.7 },
        scale: { x: 1.25, y: 1.25 },
        rotationDeg: 27,
      }),
    );
    assertAtomic(
      updateScenePaletteEntryCommand(paletteId, { name: 'Cloud blue', color: '#A0C4FF' }),
    );
    assertAtomic(reorderSceneLayerCommand(firstId, 1));

    const duplicateTarget = store.getCurrentRecipe().rootGroups[1]!.id;
    const beforeDuplicate = canonicalSceneV03String(store.getCurrentRecipe());
    commit(store, duplicateSceneLayerCommand(duplicateTarget, context));
    const duplicateId = store.getCurrentRecipe().rootGroups.at(-1)!.id;
    expect(store.undo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(beforeDuplicate);
    expect(store.redo().ok).toBe(true);
    expect(store.getCurrentRecipe().rootGroups.at(-1)?.id).toBe(duplicateId);

    const beforeDelete = canonicalSceneV03String(store.getCurrentRecipe());
    commit(store, deleteSceneLayerCommand(duplicateId));
    expect(store.undo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(beforeDelete);
    expect(store.redo().ok).toBe(true);
    expect(store.getCurrentRecipe().rootGroups.some((group) => group.id === duplicateId)).toBe(
      false,
    );
  });

  it('rejects invalid imports before state, history, or local storage can change', () => {
    const storage = new MemoryStorage();
    const store = createSceneEditorStore(createBlankSceneV03(), { storage });
    const context = createSceneCommandContext({ value: 300 });
    commit(store, addSceneLayerCommand(material(store.getCurrentRecipe(), 'Safe layer'), context));
    const beforeScene = canonicalSceneV03String(store.getCurrentRecipe());
    const beforeHistoryLength = store.getSnapshot().history.entries.length;
    const beforeStorage = storage.getItem('texture-lab/scene-v0.3/latest');

    const invalid = structuredClone(store.getCurrentRecipe());
    invalid.rootGroups[0]!.children[0]!.visible = 'yes' as unknown as boolean;
    const result = store.commitDesignCommand(replaceSceneV03Command(invalid));

    expect(result.ok).toBe(false);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(beforeScene);
    expect(store.getSnapshot().history.entries).toHaveLength(beforeHistoryLength);
    expect(storage.getItem('texture-lab/scene-v0.3/latest')).toBe(beforeStorage);
  });

  it('reframes only when explicitly requested and restores the exact prior composition on Undo', () => {
    const store = createSceneEditorStore(createBlankSceneV03());
    const context = createSceneCommandContext({ value: 400 });
    commit(store, addSceneLayerCommand(material(store.getCurrentRecipe(), 'Back field'), context));
    const groupId = store.getCurrentRecipe().rootGroups[0]!.id;
    commit(
      store,
      updateSceneLayerTransformCommand(groupId, {
        translation: { x: 0.22, y: 0.76 },
        scale: { x: 0.45, y: 0.45 },
      }),
    );
    const beforeTransform = structuredClone(store.getCurrentRecipe().rootGroups[0]!.transform);
    const beforeRatio = canonicalSceneV03String(store.getCurrentRecipe());
    commit(store, updateSceneArtboardCommand({ ratio: '21:9' }));
    expect(store.getCurrentRecipe().rootGroups[0]?.transform).toEqual(beforeTransform);
    const beforeReframe = canonicalSceneV03String(store.getCurrentRecipe());

    commit(store, reframeSceneContentCommand());
    const afterReframe = canonicalSceneV03String(store.getCurrentRecipe());
    expect(afterReframe).not.toBe(beforeReframe);
    expect(store.getCurrentRecipe().rootGroups[0]?.transform.rotationDeg).toBe(0);
    const ir = compileSceneRenderIR(store.getCurrentRecipe());
    const points = ir.materials.flatMap((material) =>
      material.path.commands.flatMap((command) =>
        command.kind === 'move' || command.kind === 'line'
          ? [transformSceneRenderPoint(material.path.matrix, command)]
          : [],
      ),
    );
    const viewBox = ir.artboard.viewBox;
    const paddingX = viewBox.width * SCENE_REFRAME_SAFE_PADDING;
    const paddingY = viewBox.height * SCENE_REFRAME_SAFE_PADDING;
    expect(Math.min(...points.map((point) => point.x))).toBeGreaterThanOrEqual(
      viewBox.minX + paddingX - 0.01,
    );
    expect(Math.max(...points.map((point) => point.x))).toBeLessThanOrEqual(
      viewBox.minX + viewBox.width - paddingX + 0.01,
    );
    expect(Math.min(...points.map((point) => point.y))).toBeGreaterThanOrEqual(
      viewBox.minY + paddingY - 0.01,
    );
    expect(Math.max(...points.map((point) => point.y))).toBeLessThanOrEqual(
      viewBox.minY + viewBox.height - paddingY + 0.01,
    );
    expect(store.undo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(beforeReframe);
    expect(store.redo().ok).toBe(true);
    expect(canonicalSceneV03String(store.getCurrentRecipe())).toBe(afterReframe);
  });
});
