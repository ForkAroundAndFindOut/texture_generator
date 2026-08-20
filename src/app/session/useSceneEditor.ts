import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createBlankSceneV03,
  type GroupId,
  type SceneGroup,
  type SceneMaterial,
  type SceneV03,
} from '../../domain';
import {
  addSceneLayerCommand,
  createSceneCommandContext,
  createSceneEditorStore,
  deleteSceneLayerCommand,
  duplicateSceneLayerCommand,
  readStoredSceneV03,
  renameSceneLayerCommand,
  reorderSceneLayerCommand,
  replaceSceneV03Command,
  setSceneLayerVisibilityCommand,
  updateSceneArtboardCommand,
  updateSceneBackgroundCommand,
  updateSceneLayerTransformCommand,
  updateScenePaletteEntryCommand,
  type SceneArtboardPatch,
  type SceneCommandDiagnostic,
  type SceneLayerTransformPatch,
  type ScenePaletteEntryPatch,
  type SceneStoragePort,
} from '../../editor';
import type { DesignCommand } from '../../editor/state/commands';
import { createSceneMaterialTemplate, type SceneShapePresetId } from './sceneTemplates';
import { createSceneStarter, type SceneStarterId } from './sceneStarters';

type SceneStore = ReturnType<typeof createSceneEditorStore>;
type BrowserTimer = ReturnType<typeof globalThis.setTimeout>;

type BootstrappedScene = {
  readonly scene: SceneV03;
  readonly restored: boolean;
  readonly initialPersistence?: ReturnType<SceneStore['getSnapshot']>['persistence'];
  readonly feedback?: string;
};

function browserStorage(): SceneStoragePort | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function bootstrap(
  initialScene: SceneV03 | undefined,
  storage: SceneStoragePort | undefined,
): BootstrappedScene {
  if (initialScene !== undefined) return { scene: initialScene, restored: false };
  if (storage !== undefined) {
    const restored = readStoredSceneV03(storage);
    if (restored.kind === 'loaded') {
      return {
        scene: restored.scene,
        restored: true,
        initialPersistence: {
          kind: 'cached',
          currentRecipeHash: restored.sceneHash,
          cachedRecipeHash: restored.sceneHash,
        },
      };
    }
    if (restored.kind === 'rejected') {
      return {
        scene: createBlankSceneV03(),
        restored: false,
        feedback: restored.diagnostic.message,
      };
    }
  }
  return { scene: createBlankSceneV03(), restored: false };
}

function firstMaterial(group: SceneGroup | undefined): SceneMaterial | undefined {
  if (group === undefined) return undefined;
  for (const child of group.children) {
    if (child.kind === 'material') return child;
    const nested = firstMaterial(child);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function feedbackFrom(diagnostics: readonly SceneCommandDiagnostic[]): string {
  return diagnostics[0]?.message ?? 'That change could not be applied. Keep the last valid scene.';
}

/** React composition around the v0.3 scene store; durable state never lives in React. */
export function useSceneEditor(initialScene?: SceneV03) {
  const storage = useMemo(() => browserStorage(), []);
  const boot = useMemo(() => bootstrap(initialScene, storage), [initialScene, storage]);
  const store = useMemo(
    () =>
      createSceneEditorStore(boot.scene, {
        ...(storage === undefined ? {} : { storage }),
        ...(boot.initialPersistence === undefined
          ? {}
          : { initialPersistence: boot.initialPersistence }),
      }),
    [boot, storage],
  );
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());
  const [selectedGroupId, setSelectedGroupId] = useState<GroupId | undefined>(
    () => store.getCurrentRecipe().rootGroups.at(-1)?.id,
  );
  const [feedback, setFeedback] = useState<string | undefined>(boot.feedback);
  const sequence = useRef({ value: 10_000 });
  const disposeTimer = useRef<BrowserTimer | undefined>(undefined);

  useEffect(() => {
    if (disposeTimer.current !== undefined) globalThis.clearTimeout(disposeTimer.current);
    return store.subscribe(() => setSnapshot(store.getSnapshot()));
  }, [store]);

  useEffect(() => {
    // Persist a valid initial/loaded scene too, so "Saved locally" is an
    // observable fact rather than a promise that only starts after editing.
    store.retryLatestCache();
  }, [store]);

  useEffect(
    () => () => {
      disposeTimer.current = globalThis.setTimeout(() => store.dispose(), 0);
    },
    [store],
  );

  const scene = snapshot.currentRecipe;
  const selectedGroup = scene.rootGroups.find((group) => group.id === selectedGroupId);
  const selectedMaterial = firstMaterial(selectedGroup);

  function commit(command: DesignCommand<SceneV03, SceneCommandDiagnostic>): boolean {
    const result = store.commitDesignCommand(command);
    if (!result.ok) {
      setFeedback(feedbackFrom(result.diagnostics));
      return false;
    }
    setFeedback(undefined);
    return true;
  }

  function addShape(presetId: SceneShapePresetId): GroupId | undefined {
    const template = createSceneMaterialTemplate(scene, presetId);
    if (!commit(addSceneLayerCommand(template, createSceneCommandContext(sequence.current))))
      return undefined;
    const groupId = store.getCurrentRecipe().rootGroups.at(-1)?.id;
    setSelectedGroupId(groupId);
    return groupId;
  }

  function chooseStarter(starterId: SceneStarterId): void {
    if (!commit(replaceSceneV03Command(createSceneStarter(starterId)))) return;
    setSelectedGroupId(store.getCurrentRecipe().rootGroups.at(-1)?.id);
  }

  function duplicate(groupId: GroupId): GroupId | undefined {
    if (!commit(duplicateSceneLayerCommand(groupId, createSceneCommandContext(sequence.current)))) {
      return undefined;
    }
    const duplicateId = store.getCurrentRecipe().rootGroups.at(-1)?.id;
    setSelectedGroupId(duplicateId);
    return duplicateId;
  }

  function remove(groupId: GroupId): void {
    const index = scene.rootGroups.findIndex((group) => group.id === groupId);
    const nextSelection = scene.rootGroups[index + 1]?.id ?? scene.rootGroups[index - 1]?.id;
    if (commit(deleteSceneLayerCommand(groupId))) setSelectedGroupId(nextSelection);
  }

  function reorder(groupId: GroupId, direction: 'up' | 'down'): void {
    const index = scene.rootGroups.findIndex((group) => group.id === groupId);
    const target = direction === 'up' ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= scene.rootGroups.length) return;
    commit(reorderSceneLayerCommand(groupId, target));
  }

  function updateTransform(groupId: GroupId, patch: SceneLayerTransformPatch): void {
    commit(updateSceneLayerTransformCommand(groupId, patch));
  }

  function updateArtboard(patch: SceneArtboardPatch): void {
    commit(updateSceneArtboardCommand(patch));
  }

  function updateBackground(color: string): void {
    commit(updateSceneBackgroundCommand(color));
  }

  function updatePaletteEntry(paletteId: string, patch: ScenePaletteEntryPatch): void {
    commit(updateScenePaletteEntryCommand(paletteId, patch));
  }

  function undo(): void {
    const result = store.undo();
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
    else setFeedback(undefined);
  }

  function redo(): void {
    const result = store.redo();
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
    else setFeedback(undefined);
  }

  return {
    scene,
    history: snapshot.history,
    persistence: snapshot.persistence,
    restored: boot.restored,
    feedback,
    selectedGroupId: selectedGroup?.id,
    selectedGroup,
    selectedMaterial,
    selectGroup: setSelectedGroupId,
    clearSelection: () => setSelectedGroupId(undefined),
    addShape,
    chooseStarter,
    duplicate,
    remove,
    rename: (groupId: GroupId, name: string) => commit(renameSceneLayerCommand(groupId, name)),
    setVisibility: (groupId: GroupId, visible: boolean) =>
      commit(setSceneLayerVisibilityCommand(groupId, visible)),
    reorder,
    updateTransform,
    updateArtboard,
    updateBackground,
    updatePaletteEntry,
    undo,
    redo,
  };
}
