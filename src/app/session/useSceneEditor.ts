import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createBlankSceneV03,
  type GroupId,
  type SceneGroup,
  type SceneMaterial,
  type SceneNode,
  type ScenePoint,
  type SceneV03,
} from '../../domain';
import {
  addSceneLayerAtTransformCommand,
  addSceneLayerCommand,
  addScenePaletteEntryCommand,
  createSceneCommandContext,
  createSceneEditorStore,
  deleteScenePaletteEntryCommand,
  deleteSceneLayerCommand,
  duplicateSceneLayerCommand,
  importScenePaletteCommand,
  readStoredSceneV03,
  remixScenePaletteCommand,
  reframeSceneContentCommand,
  renameSceneLayerCommand,
  reorderSceneLayerCommand,
  replaceSceneV03Command,
  setSceneLayerVisibilityCommand,
  updateSceneArtboardCommand,
  updateSceneBackgroundCommand,
  updateSceneLayerTransformCommand,
  updateSceneMaterialCommand,
  updateSceneMaterialBoundaryCommand,
  updateScenePaletteEntryCommand,
  type SceneArtboardPatch,
  type SceneCommandDiagnostic,
  type SceneLayerTransformPatch,
  type SceneMaterialPatch,
  type PaletteImportEntry,
  type PaletteImportMode,
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
import { nextScenePaletteRemix } from './paletteRemix';

type SceneStore = ReturnType<typeof createSceneEditorStore>;
type BrowserTimer = ReturnType<typeof globalThis.setTimeout>;
type BrowserFrame = ReturnType<typeof globalThis.requestAnimationFrame>;
type ActiveCanvasGesture = {
  readonly group: ReturnType<SceneStore['beginInteraction']>;
  readonly baseScene: SceneV03;
  readonly groupId: GroupId;
  latestCandidate: SceneV03;
  changed: boolean;
};

type ActiveBoundaryGesture = {
  readonly group: ReturnType<SceneStore['beginInteraction']>;
  readonly baseScene: SceneV03;
  readonly materialId: string;
  readonly vertexIndex: number;
  latestCandidate: SceneV03;
  pendingCandidate?: SceneV03;
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

function findSceneMaterial(node: SceneNode, materialId: string): SceneMaterial | undefined {
  if (node.kind === 'material') return node.id === materialId ? node : undefined;
  for (const child of node.children) {
    const material = findSceneMaterial(child, materialId);
    if (material !== undefined) return material;
  }
  return undefined;
}

function materialInScene(scene: SceneV03, materialId: string): SceneMaterial | undefined {
  for (const group of scene.rootGroups) {
    const material = findSceneMaterial(group, materialId);
    if (material !== undefined) return material;
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
  const [pinnedGroupId, setPinnedGroupId] = useState<GroupId | undefined>(undefined);
  const [scaleLocked, setScaleLocked] = useState(true);
  const [resizeFromCenter, setResizeFromCenter] = useState(false);
  const [feedback, setFeedback] = useState<string | undefined>(boot.feedback);
  const [isInteracting, setIsInteracting] = useState(false);
  const [interactionRevision, setInteractionRevision] = useState(0);
  const sequence = useRef({ value: 10_000 });
  const disposeTimer = useRef<BrowserTimer | undefined>(undefined);
  const activeCanvasGesture = useRef<ActiveCanvasGesture | undefined>(undefined);
  const activeBoundaryGesture = useRef<ActiveBoundaryGesture | undefined>(undefined);
  const interactionFrame = useRef<BrowserFrame | undefined>(undefined);
  const scheduledInteractionMove = useRef<(() => void) | undefined>(undefined);
  const [freeformDraft, setFreeformDraft] = useState<MutableFreeformDraft | undefined>(undefined);
  const freeformDraftRef = useRef<MutableFreeformDraft | undefined>(undefined);
  const [boundaryEditMaterialId, setBoundaryEditMaterialId] = useState<string | undefined>(
    undefined,
  );
  const [selectedBoundaryVertexIndex, setSelectedBoundaryVertexIndex] = useState<
    number | undefined
  >(undefined);
  const [invalidBoundaryVertexIndex, setInvalidBoundaryVertexIndex] = useState<number | undefined>(
    undefined,
  );

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
      if (interactionFrame.current !== undefined) {
        globalThis.cancelAnimationFrame(interactionFrame.current);
      }
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

  function discardBoundaryEdit(): void {
    setBoundaryEditMaterialId(undefined);
    setSelectedBoundaryVertexIndex(undefined);
    setInvalidBoundaryVertexIndex(undefined);
  }

  function cancelScheduledInteractionMove(): void {
    if (interactionFrame.current !== undefined) {
      globalThis.cancelAnimationFrame(interactionFrame.current);
      interactionFrame.current = undefined;
    }
    scheduledInteractionMove.current = undefined;
  }

  function flushScheduledInteractionMove(): void {
    const move = scheduledInteractionMove.current;
    cancelScheduledInteractionMove();
    move?.();
  }

  /** Collapse pointer storms into one cheap scene update per animation frame. */
  function scheduleInteractionMove(move: () => void): void {
    scheduledInteractionMove.current = move;
    if (interactionFrame.current !== undefined) return;
    interactionFrame.current = globalThis.requestAnimationFrame(() => {
      interactionFrame.current = undefined;
      const latest = scheduledInteractionMove.current;
      scheduledInteractionMove.current = undefined;
      latest?.();
    });
  }

  function settleCanvasGesture(commitChange: boolean): void {
    const active = activeCanvasGesture.current;
    if (active === undefined) return;
    if (commitChange) flushScheduledInteractionMove();
    else cancelScheduledInteractionMove();
    const result =
      commitChange && active.changed
        ? store.finishInteraction(active.group, active.latestCandidate)
        : store.cancelInteraction(active.group);
    activeCanvasGesture.current = undefined;
    setIsInteracting(false);
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
  }

  function settleBoundaryGesture(commitChange: boolean): void {
    const active = activeBoundaryGesture.current;
    if (active === undefined) return;
    if (commitChange) flushScheduledInteractionMove();
    else cancelScheduledInteractionMove();
    const result =
      commitChange && active.changed
        ? store.finishInteraction(active.group, active.latestCandidate)
        : store.cancelInteraction(active.group);
    activeBoundaryGesture.current = undefined;
    setIsInteracting(false);
    setInvalidBoundaryVertexIndex(undefined);
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
  }

  function commit(command: DesignCommand<SceneV03, SceneCommandDiagnostic>): boolean {
    settleCanvasGesture(true);
    settleBoundaryGesture(true);
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

  function reframeVisibleContent(): void {
    commit(reframeSceneContentCommand());
  }

  function updateBackground(color: string): void {
    commit(updateSceneBackgroundCommand(color));
  }

  function updatePaletteEntry(paletteId: string, patch: ScenePaletteEntryPatch): void {
    commit(updateScenePaletteEntryCommand(paletteId, patch));
  }

  function addPaletteEntry(): void {
    commit(addScenePaletteEntryCommand(createSceneCommandContext(sequence.current)));
  }

  function deletePaletteEntry(paletteId: string): void {
    commit(deleteScenePaletteEntryCommand(paletteId));
  }

  function importPalette(entries: readonly PaletteImportEntry[], mode: PaletteImportMode): boolean {
    return commit(
      importScenePaletteCommand(entries, mode, createSceneCommandContext(sequence.current)),
    );
  }

  function remixPalette(): void {
    commit(remixScenePaletteCommand(nextScenePaletteRemix(scene)));
  }

  function beginFreeform(): void {
    settleCanvasGesture(true);
    settleBoundaryGesture(true);
    discardBoundaryEdit();
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

  function closeFreeform(): void {
    const draft = freeformDraftRef.current;
    if (draft === undefined) return;
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
  }

  function placeFreeformPoint(point: ScenePoint): void {
    const draft = freeformDraftRef.current;
    if (draft === undefined) return;
    if (isNearFreeformStart(draft.points, point)) {
      closeFreeform();
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

  function toggleBoundaryEdit(): void {
    if (selectedMaterial === undefined) {
      setFeedback('Select one material before editing its Boundary.');
      return;
    }
    settleCanvasGesture(true);
    settleBoundaryGesture(true);
    discardFreeformDraft();
    if (boundaryEditMaterialId === selectedMaterial.id) {
      discardBoundaryEdit();
      setFeedback('Boundary editing finished.');
      return;
    }
    setBoundaryEditMaterialId(selectedMaterial.id);
    setSelectedBoundaryVertexIndex(undefined);
    setFeedback('Drag a corner, click a midpoint to insert, or select a corner to remove it.');
  }

  function cancelBoundaryEdit(): void {
    settleBoundaryGesture(false);
    if (boundaryEditMaterialId === undefined) return;
    discardBoundaryEdit();
    setFeedback('Boundary editing finished.');
  }

  function insertBoundaryVertex(materialId: string, afterIndex: number, point: ScenePoint): void {
    const material = materialInScene(scene, materialId);
    if (
      material === undefined ||
      afterIndex < 0 ||
      afterIndex >= material.geometry.boundary.vertices.length
    ) {
      setFeedback('The selected Boundary is no longer available.');
      return;
    }
    const vertices = material.geometry.boundary.vertices;
    const insertAt = afterIndex + 1;
    if (
      commit(
        updateSceneMaterialBoundaryCommand(materialId, {
          vertices: [...vertices.slice(0, insertAt), point, ...vertices.slice(insertAt)],
        }),
      )
    ) {
      setSelectedBoundaryVertexIndex(insertAt);
      setFeedback('Boundary point inserted. Drag it to refine the silhouette.');
    }
  }

  function removeBoundaryVertex(materialId: string, vertexIndex: number | undefined): void {
    const material = materialInScene(scene, materialId);
    if (material === undefined || vertexIndex === undefined) {
      setFeedback('Select a Boundary corner before removing it.');
      return;
    }
    const vertices = material.geometry.boundary.vertices;
    if (vertices.length <= 3) {
      setFeedback('A solid Boundary needs at least three corners.');
      return;
    }
    if (vertexIndex < 0 || vertexIndex >= vertices.length) {
      setFeedback('The selected Boundary corner is no longer available.');
      return;
    }
    if (
      commit(
        updateSceneMaterialBoundaryCommand(materialId, {
          vertices: vertices.filter((_, index) => index !== vertexIndex),
        }),
      )
    ) {
      setSelectedBoundaryVertexIndex(Math.min(vertexIndex, vertices.length - 2));
      setFeedback('Boundary point removed.');
    }
  }

  function promoteBoundaryVertexMove(active: ActiveBoundaryGesture): void {
    if (activeBoundaryGesture.current !== active) return;
    const candidate = active.pendingCandidate;
    if (candidate === undefined) return;
    delete active.pendingCandidate;
    const result = store.promoteInteraction(active.group, candidate);
    if (!result.ok) {
      setFeedback(feedbackFrom(result.diagnostics));
      return;
    }
    active.latestCandidate = candidate;
    active.changed = true;
    setInteractionRevision((revision) => revision + 1);
  }

  function queueBoundaryVertexMove(active: ActiveBoundaryGesture, point: ScenePoint): void {
    const material = materialInScene(active.baseScene, active.materialId);
    if (material === undefined) return;
    const vertices = material.geometry.boundary.vertices.map((vertex, index) =>
      index === active.vertexIndex ? point : { ...vertex },
    );
    const prepared = updateSceneMaterialBoundaryCommand(active.materialId, { vertices }).prepare(
      active.baseScene,
    );
    if (prepared.kind !== 'success') {
      setInvalidBoundaryVertexIndex(active.vertexIndex);
      return;
    }
    active.pendingCandidate = prepared.candidate;
    setInvalidBoundaryVertexIndex(undefined);
    scheduleInteractionMove(() => promoteBoundaryVertexMove(active));
  }

  function applyBoundaryVertexEdit(
    materialId: string,
    vertexIndex: number,
    phase: 'start' | 'move' | 'end' | 'cancel',
    point?: ScenePoint,
  ): void {
    if (phase === 'cancel') {
      settleBoundaryGesture(false);
      return;
    }
    if (phase === 'start') {
      settleCanvasGesture(true);
      settleBoundaryGesture(true);
      const baseScene = store.getCurrentRecipe();
      const material = materialInScene(baseScene, materialId);
      if (
        material === undefined ||
        vertexIndex < 0 ||
        vertexIndex >= material.geometry.boundary.vertices.length
      ) {
        setFeedback('The selected Boundary corner is no longer available.');
        return;
      }
      activeBoundaryGesture.current = {
        group: store.beginInteraction('scene-boundary-vertex'),
        baseScene,
        materialId,
        vertexIndex,
        latestCandidate: baseScene,
        changed: false,
      };
      setSelectedBoundaryVertexIndex(vertexIndex);
      setInvalidBoundaryVertexIndex(undefined);
      setIsInteracting(true);
      setInteractionRevision((revision) => revision + 1);
      return;
    }

    const active = activeBoundaryGesture.current;
    if (
      active === undefined ||
      active.materialId !== materialId ||
      active.vertexIndex !== vertexIndex
    ) {
      return;
    }
    if (phase === 'move' && point !== undefined) {
      queueBoundaryVertexMove(active, point);
    }
    if (phase === 'end') settleBoundaryGesture(true);
  }

  function promoteCanvasMove(active: ActiveCanvasGesture, deltaX: number, deltaY: number): void {
    if (activeCanvasGesture.current !== active) return;
    const baseGroup = active.baseScene.rootGroups.find((entry) => entry.id === active.groupId);
    if (baseGroup === undefined || (deltaX === 0 && deltaY === 0)) return;
    const prepared = updateSceneLayerTransformCommand(active.groupId, {
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
    setInteractionRevision((revision) => revision + 1);
    setFeedback(undefined);
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
      settleBoundaryGesture(true);
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
      setIsInteracting(true);
      setInteractionRevision((revision) => revision + 1);
      return;
    }

    const active = activeCanvasGesture.current;
    if (active === undefined || active.groupId !== groupId) return;
    if (deltaX !== 0 || deltaY !== 0) {
      scheduleInteractionMove(() => promoteCanvasMove(active, deltaX, deltaY));
    }
    if (phase === 'end') settleCanvasGesture(true);
  }

  function applyCanvasTransform(
    groupId: GroupId,
    phase: 'start' | 'move' | 'end' | 'cancel',
    patch?: SceneLayerTransformPatch,
  ): void {
    if (phase === 'cancel') {
      settleCanvasGesture(false);
      return;
    }
    if (phase === 'start') {
      settleCanvasGesture(true);
      settleBoundaryGesture(true);
      const baseScene = store.getCurrentRecipe();
      if (!baseScene.rootGroups.some((entry) => entry.id === groupId)) return;
      activeCanvasGesture.current = {
        group: store.beginInteraction('scene-layer-transform'),
        baseScene,
        groupId,
        latestCandidate: baseScene,
        changed: false,
      };
      setSelectedGroupId(groupId);
      setIsInteracting(true);
      setInteractionRevision((revision) => revision + 1);
      return;
    }

    const active = activeCanvasGesture.current;
    if (active === undefined || active.groupId !== groupId) return;
    if (phase === 'move' && patch !== undefined) {
      scheduleInteractionMove(() => {
        if (activeCanvasGesture.current !== active) return;
        const prepared = updateSceneLayerTransformCommand(groupId, patch).prepare(active.baseScene);
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
        setInteractionRevision((revision) => revision + 1);
        setFeedback(undefined);
      });
    }
    if (phase === 'end') settleCanvasGesture(true);
  }

  function undo(): void {
    settleCanvasGesture(true);
    settleBoundaryGesture(true);
    discardFreeformDraft();
    const result = store.undo();
    if (!result.ok) setFeedback(feedbackFrom(result.diagnostics));
    else setFeedback(undefined);
  }

  function redo(): void {
    settleCanvasGesture(true);
    settleBoundaryGesture(true);
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
    isInteracting,
    interactionRevision,
    selectedGroupId: selectedGroup?.id,
    selectedGroup,
    selectedMaterial,
    boundaryEditor:
      boundaryEditMaterialId !== undefined && boundaryEditMaterialId === selectedMaterial?.id
        ? {
            materialId: boundaryEditMaterialId,
            vertices: selectedMaterial.geometry.boundary.vertices,
            ...(selectedBoundaryVertexIndex === undefined
              ? {}
              : { selectedVertexIndex: selectedBoundaryVertexIndex }),
            ...(invalidBoundaryVertexIndex === undefined
              ? {}
              : { invalidVertexIndex: invalidBoundaryVertexIndex }),
          }
        : undefined,
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
    selectGroupFromCanvas: (groupId: GroupId) => {
      settleCanvasGesture(false);
      settleBoundaryGesture(false);
      setPinnedGroupId(undefined);
      setSelectedGroupId(groupId);
      const material = firstMaterial(scene.rootGroups.find((group) => group.id === groupId));
      if (material?.id !== boundaryEditMaterialId) discardBoundaryEdit();
    },
    selectGroupFromSidebar: (groupId: GroupId) => {
      settleCanvasGesture(false);
      settleBoundaryGesture(false);
      setPinnedGroupId(groupId);
      setSelectedGroupId(groupId);
      const material = firstMaterial(scene.rootGroups.find((group) => group.id === groupId));
      if (material?.id !== boundaryEditMaterialId) discardBoundaryEdit();
    },
    pinnedGroupId: selectedGroup?.id === pinnedGroupId ? pinnedGroupId : undefined,
    scaleLocked,
    setScaleLocked,
    resizeFromCenter,
    setResizeFromCenter,
    clearSelection: () => {
      settleCanvasGesture(false);
      settleBoundaryGesture(false);
      setPinnedGroupId(undefined);
      setSelectedGroupId(undefined);
      discardBoundaryEdit();
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
    reframeVisibleContent,
    updateBackground,
    updatePaletteEntry,
    addPaletteEntry,
    deletePaletteEntry,
    importPalette,
    remixPalette,
    beginFreeform,
    cancelFreeform,
    closeFreeform,
    undoFreeformPoint,
    hoverFreeform,
    placeFreeformPoint,
    toggleBoundaryEdit,
    cancelBoundaryEdit,
    insertBoundaryVertex,
    removeBoundaryVertex,
    applyBoundaryVertexEdit,
    applyCanvasDrag,
    applyCanvasTransform,
    importScene,
    undo,
    redo,
  };
}
