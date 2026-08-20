import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createBlankSceneV03,
  type GroupId,
  type SceneGroup,
  type SceneMaterial,
  type ScenePoint,
  type SceneV03,
} from '../../domain';
import {
  addSceneLayerAtTransformCommand,
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
  updateSceneMaterialCommand,
  updateScenePaletteEntryCommand,
  type SceneArtboardPatch,
  type SceneCommandDiagnostic,
  type SceneLayerTransformPatch,
  type SceneMaterialPatch,
  type ScenePaletteEntryPatch,
  type SceneStoragePort,
} from '../../editor';
import type { DesignCommand } from '../../editor/state/commands';
import {
  checkFreeformAppend,
  checkFreeformClosure,
  createFreeformLayerTemplate,
  isNearFreeformStart,
} from './freeformBoundary';
import { createSceneMaterialTemplate, type SceneShapePresetId } from './sceneTemplates';
import { createSceneStarter, type SceneStarterId } from './sceneStarters';

type SceneStore = ReturnType<typeof createSceneEditorStore>;
type BrowserTimer = ReturnType<typeof globalThis.setTimeout>;
type ActiveCanvasGesture = {
  readonly group: ReturnType<SceneStore['beginInteraction']>;
  readonly baseScene: SceneV03;
  readonly groupId: GroupId;
  latestCandidate: SceneV03;
  changed: boolean;
};

export type SceneFreeformDraft = Readonly<{
  readonly points: readonly ScenePoint[];
  readonly hoverPoint?: ScenePoint;
  readonly canClose: boolean;
}>;

type MutableFreeformDraft = Readonly<{
  readonly points: readonly ScenePoint[];
  readonly hoverPoint?: ScenePoint;
}>;

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
  const activeCanvasGesture = useRef<ActiveCanvasGesture | undefined>(undefined);
  const [freeformDraft, setFreeformDraft] = useState<MutableFreeformDraft | undefined>(undefined);
  const freeformDraftRef = useRef<MutableFreeformDraft | undefined>(undefined);

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

  function replaceFreeformDraft(next: MutableFreeformDraft | undefined): void {
    freeformDraftRef.current = next;
    setFreeformDraft(next);
  }

  function discardFreeformDraft(): void {
    replaceFreeformDraft(undefined);
  }

  function settleCanvasGesture(commitChange: boolean): void {
    const active = activeCanvasGesture.current;
    if (active === undefined) return;
    const result =
      commitChange && active.changed
        ? store.finishInteraction(active.group, active.latestCandidate)
        : store.cancelInteraction(active.group);
    activeCanvasGesture.current = undefined;
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
  }

  function commit(command: DesignCommand<SceneV03, SceneCommandDiagnostic>): boolean {
    settleCanvasGesture(true);
    discardFreeformDraft();
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

  function updateMaterial(materialId: string, patch: SceneMaterialPatch): void {
    commit(updateSceneMaterialCommand(materialId, patch));
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

  function beginFreeform(): void {
    settleCanvasGesture(true);
    replaceFreeformDraft({ points: [] });
    setSelectedGroupId(undefined);
    setFeedback(
      'Place three or more points. Click near the first point to close one solid Boundary.',
    );
  }

  function cancelFreeform(): void {
    if (freeformDraftRef.current === undefined) return;
    discardFreeformDraft();
    setFeedback('Boundary draft cancelled.');
  }

  function undoFreeformPoint(): void {
    const draft = freeformDraftRef.current;
    if (draft === undefined || draft.points.length === 0) return;
    const points = draft.points.slice(0, -1);
    replaceFreeformDraft({
      points,
      ...(draft.hoverPoint === undefined ? {} : { hoverPoint: draft.hoverPoint }),
    });
    setFeedback(
      points.length === 0
        ? 'Boundary draft is clear. Place the first point.'
        : `${points.length} Boundary point${points.length === 1 ? '' : 's'} placed.`,
    );
  }

  function hoverFreeform(point: ScenePoint | undefined): void {
    const draft = freeformDraftRef.current;
    if (draft === undefined) return;
    replaceFreeformDraft({
      points: draft.points,
      ...(point === undefined ? {} : { hoverPoint: point }),
    });
  }

  function placeFreeformPoint(point: ScenePoint): void {
    const draft = freeformDraftRef.current;
    if (draft === undefined) return;
    if (isNearFreeformStart(draft.points, point)) {
      const closure = checkFreeformClosure(draft.points);
      if (!closure.ok) {
        setFeedback(closure.message);
        return;
      }
      try {
        const template = createFreeformLayerTemplate(scene, draft.points);
        if (
          commit(
            addSceneLayerAtTransformCommand(
              template.material,
              template.transform,
              createSceneCommandContext(sequence.current),
            ),
          )
        ) {
          setSelectedGroupId(store.getCurrentRecipe().rootGroups.at(-1)?.id);
          setFeedback(
            'Freeform Boundary added on top. Refine its color, edge fade, and interaction.',
          );
        }
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'The Boundary could not be created.');
      }
      return;
    }
    const append = checkFreeformAppend(draft.points, point);
    if (!append.ok) {
      setFeedback(append.message);
      return;
    }
    const points = [...draft.points, point];
    replaceFreeformDraft({ points, hoverPoint: point });
    setFeedback(
      points.length < 3
        ? `${points.length} Boundary point${points.length === 1 ? '' : 's'} placed. Keep drawing.`
        : `${points.length} Boundary points placed. Click near the highlighted first point to close.`,
    );
  }

  function applyCanvasDrag(
    groupId: GroupId,
    phase: 'start' | 'move' | 'end' | 'cancel',
    deltaX = 0,
    deltaY = 0,
  ): void {
    if (phase === 'cancel') {
      settleCanvasGesture(false);
      return;
    }
    if (phase === 'start') {
      settleCanvasGesture(true);
      const baseScene = store.getCurrentRecipe();
      const group = baseScene.rootGroups.find((entry) => entry.id === groupId);
      if (group === undefined) return;
      activeCanvasGesture.current = {
        group: store.beginInteraction('scene-layer-translate'),
        baseScene,
        groupId,
        latestCandidate: baseScene,
        changed: false,
      };
      setSelectedGroupId(groupId);
      return;
    }

    const active = activeCanvasGesture.current;
    if (active === undefined || active.groupId !== groupId) return;
    const baseGroup = active.baseScene.rootGroups.find((entry) => entry.id === groupId);
    if (baseGroup === undefined) return;
    if (deltaX !== 0 || deltaY !== 0) {
      const prepared = updateSceneLayerTransformCommand(groupId, {
        translation: {
          x: baseGroup.transform.translation.x + deltaX,
          y: baseGroup.transform.translation.y + deltaY,
        },
      }).prepare(active.baseScene);
      if (prepared.kind !== 'success') {
        setFeedback(feedbackFrom(prepared.diagnostics));
        return;
      }
      const result = store.promoteInteraction(active.group, prepared.candidate);
      if (!result.ok) {
        setFeedback(feedbackFrom(result.diagnostics));
        return;
      }
      active.latestCandidate = prepared.candidate;
      active.changed = true;
      setFeedback(undefined);
    }
    if (phase === 'end') settleCanvasGesture(true);
  }

  function undo(): void {
    settleCanvasGesture(true);
    discardFreeformDraft();
    const result = store.undo();
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
    else setFeedback(undefined);
  }

  function redo(): void {
    settleCanvasGesture(true);
    discardFreeformDraft();
    const result = store.redo();
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
    else setFeedback(undefined);
  }

  function importScene(candidate: unknown): boolean {
    const imported = commit(replaceSceneV03Command(candidate));
    if (imported) setSelectedGroupId(store.getCurrentRecipe().rootGroups.at(-1)?.id);
    return imported;
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
    freeformDraft:
      freeformDraft === undefined
        ? undefined
        : {
            points: freeformDraft.points,
            ...(freeformDraft.hoverPoint === undefined
              ? {}
              : { hoverPoint: freeformDraft.hoverPoint }),
            canClose:
              freeformDraft.hoverPoint !== undefined &&
              isNearFreeformStart(freeformDraft.points, freeformDraft.hoverPoint),
          },
    selectGroup: setSelectedGroupId,
    clearSelection: () => {
      settleCanvasGesture(false);
      setSelectedGroupId(undefined);
    },
    addShape,
    chooseStarter,
    duplicate,
    remove,
    rename: (groupId: GroupId, name: string) => commit(renameSceneLayerCommand(groupId, name)),
    setVisibility: (groupId: GroupId, visible: boolean) =>
      commit(setSceneLayerVisibilityCommand(groupId, visible)),
    reorder,
    updateTransform,
    updateMaterial,
    updateArtboard,
    updateBackground,
    updatePaletteEntry,
    beginFreeform,
    cancelFreeform,
    undoFreeformPoint,
    hoverFreeform,
    placeFreeformPoint,
    applyCanvasDrag,
    importScene,
    undo,
    redo,
  };
}
