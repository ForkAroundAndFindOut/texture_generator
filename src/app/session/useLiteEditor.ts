import { useEffect, useMemo, useRef, useState } from 'react';

import {
  canonicalRecipeBytes,
  createDefaultRecipe,
  hashRecipeSync,
  normalizeRecipe,
  resolveComponentColor,
  validateRecipeDomain,
  validateRecipeShape,
  type AnchorId,
  type Component,
  type ComponentAppearance,
  type ComponentId,
  type TextureRecipe,
} from '../../domain';
import {
  addComponentCommand,
  createEditorStore,
  duplicateComponentCommand,
  insertFieldAnchorCommand,
  removeComponentCommand,
  removeFieldAnchorCommand,
  renameComponentCommand,
  reorderComponentCommand,
  updateBandShapeCommand,
  updateBaseColorCommand,
  updateComponentAppearanceCommand,
  updateComponentColorCommand,
  updateComponentTransformCommand,
  updateFieldAnchorCommand,
  type ComponentCommandContext,
  type ColorPatch,
  type EditorStore,
} from '../../editor';
import type { DesignCommand } from '../../editor/state/commands';
import type { PreviewGesture } from '../components/PreviewSurface';
import type { InspectorControl } from '../panels/ComponentInspector';
import {
  createComponentCommandContext,
  createComponentTemplate,
  rememberCreatedId,
  SHAPE_PRESETS,
  type ShapePresetId,
} from './componentTemplates';

type LiteStore = EditorStore<TextureRecipe, string, unknown>;
type BrowserTimer = ReturnType<typeof globalThis.setTimeout>;
type ActiveGesture = {
  readonly group: ReturnType<LiteStore['beginInteraction']>;
  readonly baseRecipe: TextureRecipe;
  readonly componentId: ComponentId;
  readonly control: string;
  latestCandidate: TextureRecipe;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const normalizedDegrees = (value: number): number => ((((value + 180) % 360) + 360) % 360) - 180;

const messageFromDiagnostics = (diagnostics: readonly unknown[]): string => {
  const first = diagnostics[0];
  if (typeof first === 'object' && first !== null && 'message' in first) {
    const message = (first as { readonly message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'That change could not be applied. Keep the last valid design and try another value.';
};

function createLiteStore(initialRecipe: TextureRecipe): LiteStore {
  return createEditorStore<TextureRecipe, string, unknown>(normalizeRecipe(initialRecipe), {
    canonicalize: canonicalRecipeBytes,
    normalize: normalizeRecipe,
    validate: (candidate) => {
      const shape = validateRecipeShape(candidate);
      return shape.ok ? validateRecipeDomain(candidate) : shape;
    },
    hashRecipe: hashRecipeSync,
  });
}

/** Owns editor/history state while exposing designer-facing actions to React. */
export function useLiteEditor(initialRecipe?: TextureRecipe) {
  const store = useMemo(
    () => createLiteStore(initialRecipe ?? createDefaultRecipe()),
    [initialRecipe],
  );
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());
  const [selectedIds, setSelectedIds] = useState<readonly ComponentId[]>(() => {
    const first = store.getCurrentRecipe().components[0]?.id;
    return first === undefined ? [] : [first];
  });
  const [anchorEditMode, setAnchorEditMode] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<AnchorId | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);
  const sequence = useRef({ value: 10_000 });
  const allocatedId = useRef<ComponentId | undefined>(undefined);
  const allocatedAnchorId = useRef<AnchorId | undefined>(undefined);
  const hiddenOpacityById = useRef(new Map<ComponentId, number>());
  const disposeTimer = useRef<BrowserTimer | undefined>(undefined);
  const activeGesture = useRef<ActiveGesture | undefined>(undefined);

  useEffect(() => {
    if (disposeTimer.current !== undefined) globalThis.clearTimeout(disposeTimer.current);
    return store.subscribe(() => setSnapshot(store.getSnapshot()));
  }, [store]);

  useEffect(
    () => () => {
      disposeTimer.current = globalThis.setTimeout(() => store.dispose(), 0);
    },
    [store],
  );

  const recipe = snapshot.currentRecipe;
  const selectedComponent = recipe.components.find((component) => component.id === selectedIds[0]);
  const selectedComponentId = selectedComponent?.id;
  const effectiveSelectedIds = selectedComponentId === undefined ? [] : [selectedComponentId];
  const effectiveAnchorEditMode = anchorEditMode && selectedComponent?.type === 'field';
  const effectiveSelectedAnchorId =
    effectiveAnchorEditMode && selectedComponent?.type === 'field'
      ? selectedComponent.contour.anchors.some((anchor) => anchor.id === selectedAnchorId)
        ? selectedAnchorId
        : selectedComponent.contour.anchors[0]?.id
      : undefined;
  const selectedComponentColor =
    selectedComponent === undefined ? undefined : resolveComponentColor(recipe, selectedComponent);

  function commandContext(recordCreatedId = false): ComponentCommandContext {
    const context = createComponentCommandContext(sequence.current);
    if (!recordCreatedId) return context;
    allocatedId.current = undefined;
    return rememberCreatedId(context, (id) => {
      allocatedId.current = id;
    });
  }

  function commandContextForAnchor(): ComponentCommandContext {
    const context = commandContext();
    allocatedAnchorId.current = undefined;
    return {
      ...context,
      createAnchorId: (sourceId, anchorIndex) => {
        const id = context.createAnchorId(sourceId, anchorIndex);
        allocatedAnchorId.current = id;
        return id;
      },
    };
  }

  function reportRejected(diagnostics: readonly unknown[]): void {
    setFeedback(messageFromDiagnostics(diagnostics));
  }

  function finishGesture(): void {
    const active = activeGesture.current;
    if (active === undefined) return;
    const result = store.finishInteraction(active.group, active.latestCandidate);
    if (!result.ok) reportRejected(result.diagnostics);
    activeGesture.current = undefined;
  }

  function cancelGesture(): void {
    const active = activeGesture.current;
    if (active === undefined) return;
    const result = store.cancelInteraction(active.group);
    if (!result.ok) reportRejected(result.diagnostics);
    activeGesture.current = undefined;
  }

  function commit(command: DesignCommand<TextureRecipe, unknown>): boolean {
    finishGesture();
    const result = store.commitDesignCommand(command);
    if (!result.ok) {
      reportRejected(result.diagnostics);
      return false;
    }
    setFeedback(undefined);
    return true;
  }

  function beginGesture(componentId: ComponentId, control: string): ActiveGesture {
    const current = activeGesture.current;
    if (current?.componentId === componentId && current.control === control) return current;
    finishGesture();
    const baseRecipe = store.getCurrentRecipe();
    const next: ActiveGesture = {
      group: store.beginInteraction(`component-${control}`),
      baseRecipe,
      componentId,
      control,
      latestCandidate: baseRecipe,
    };
    activeGesture.current = next;
    return next;
  }

  function promote(command: DesignCommand<TextureRecipe, unknown>, active: ActiveGesture): boolean {
    const prepared = command.prepare(active.baseRecipe);
    if (prepared.kind !== 'success') {
      reportRejected(prepared.diagnostics);
      return false;
    }
    const result = store.promoteInteraction(active.group, prepared.candidate);
    if (!result.ok) {
      reportRejected(result.diagnostics);
      return false;
    }
    active.latestCandidate = prepared.candidate;
    setFeedback(undefined);
    return true;
  }

  function inspectorCommand(
    id: ComponentId,
    control: InspectorControl,
    value: number,
    context: ComponentCommandContext,
  ): DesignCommand<TextureRecipe, unknown> {
    switch (control) {
      case 'positionX':
        return updateComponentTransformCommand(id, { translation: { x: value } }, context);
      case 'positionY':
        return updateComponentTransformCommand(id, { translation: { y: value } }, context);
      case 'width':
        return updateComponentTransformCommand(id, { baseSize: { width: value } }, context);
      case 'height':
        return updateComponentTransformCommand(id, { baseSize: { height: value } }, context);
      case 'rotation':
        return updateComponentTransformCommand(id, { rotationDeg: value }, context);
      case 'scale':
        return updateComponentTransformCommand(id, { uniformScale: value }, context);
      case 'softness':
      case 'highlight':
      case 'grain':
      case 'asymmetry':
        return updateComponentAppearanceCommand(
          id,
          { [control]: value } as Partial<ComponentAppearance>,
          context,
        );
    }
  }

  function updateInspector(id: ComponentId, control: InspectorControl, value: number): void {
    const active = beginGesture(id, control);
    promote(inspectorCommand(id, control, value, commandContext()), active);
  }

  function applyPreviewGesture(gesture: PreviewGesture): void {
    if (gesture.phase === 'cancel') {
      cancelGesture();
      return;
    }
    const active = beginGesture(gesture.componentId, `canvas-${gesture.kind}`);
    if (gesture.phase !== 'start') {
      const component = active.baseRecipe.components.find(
        (entry) => entry.id === gesture.componentId,
      );
      if (component !== undefined) {
        if (gesture.kind === 'translate') {
          promote(
            updateComponentTransformCommand(
              gesture.componentId,
              {
                translation: {
                  x: component.transform.translation.x + gesture.deltaX,
                  y: component.transform.translation.y + gesture.deltaY,
                },
              },
              commandContext(),
            ),
            active,
          );
        } else if (gesture.kind === 'scale') {
          const scale = clamp(
            component.transform.uniformScale * (1 + (gesture.deltaX + gesture.deltaY) * 1.2),
            0.05,
            4,
          );
          promote(
            updateComponentTransformCommand(
              gesture.componentId,
              { uniformScale: scale },
              commandContext(),
            ),
            active,
          );
        } else if (gesture.kind === 'rotate') {
          const startX = gesture.pointX - gesture.deltaX;
          const startY = gesture.pointY - gesture.deltaY;
          const center = component.transform.translation;
          const startAngle = Math.atan2(startY - center.y, startX - center.x);
          const currentAngle = Math.atan2(gesture.pointY - center.y, gesture.pointX - center.x);
          let deltaDegrees = ((currentAngle - startAngle) * 180) / Math.PI;
          if (deltaDegrees > 180) deltaDegrees -= 360;
          if (deltaDegrees < -180) deltaDegrees += 360;
          promote(
            updateComponentTransformCommand(
              gesture.componentId,
              { rotationDeg: normalizedDegrees(component.transform.rotationDeg + deltaDegrees) },
              commandContext(),
            ),
            active,
          );
        } else if (
          gesture.kind === 'anchor' &&
          gesture.anchorId !== undefined &&
          gesture.localPoint !== undefined
        ) {
          const localPoint = {
            x: clamp(gesture.localPoint.x, 0, 1),
            y: clamp(gesture.localPoint.y, 0, 1),
          };
          promote(
            updateFieldAnchorCommand(
              gesture.componentId,
              gesture.anchorId,
              localPoint,
              commandContext(),
            ),
            active,
          );
        }
      }
    }
    if (gesture.phase === 'end') finishGesture();
  }

  function select(ids: readonly ComponentId[]): void {
    cancelGesture();
    const next = recipe.components.find((component) => component.id === ids[0]);
    setSelectedIds(next === undefined ? [] : [next.id]);
    if (next?.type === 'field' && anchorEditMode) {
      setSelectedAnchorId(next.contour.anchors[0]?.id);
    } else {
      setAnchorEditMode(false);
      setSelectedAnchorId(undefined);
    }
  }

  function add(type: Component['type'], presetId?: ShapePresetId): ComponentId | undefined {
    const context = commandContext(true);
    const template = createComponentTemplate(recipe, type, sequence.current, presetId);
    if (!commit(addComponentCommand(template, context))) return undefined;
    const id = allocatedId.current;
    if (id !== undefined) {
      setSelectedIds([id]);
      setAnchorEditMode(false);
      setSelectedAnchorId(undefined);
    }
    return id;
  }

  function addPreset(presetId: ShapePresetId): ComponentId | undefined {
    const preset = SHAPE_PRESETS.find((candidate) => candidate.id === presetId);
    return preset === undefined ? undefined : add(preset.type, presetId);
  }

  function duplicate(id: ComponentId): ComponentId | undefined {
    const context = commandContext(true);
    if (!commit(duplicateComponentCommand(id, context))) return undefined;
    const createdId = allocatedId.current;
    if (createdId !== undefined) {
      setSelectedIds([createdId]);
      setAnchorEditMode(false);
      setSelectedAnchorId(undefined);
    }
    return createdId;
  }

  function remove(id: ComponentId): void {
    const index = recipe.components.findIndex((component) => component.id === id);
    const nextId = recipe.components[index + 1]?.id ?? recipe.components[index - 1]?.id;
    if (!commit(removeComponentCommand(id, commandContext()))) return;
    setSelectedIds(nextId === undefined ? [] : [nextId]);
    setAnchorEditMode(false);
    setSelectedAnchorId(undefined);
  }

  function reorder(id: ComponentId, direction: 'up' | 'down'): void {
    const index = recipe.components.findIndex((component) => component.id === id);
    // The layer rail displays front-to-back while recipes are back-to-front.
    const target = direction === 'up' ? index + 1 : index - 1;
    if (index < 0 || target < 0 || target >= recipe.components.length) return;
    commit(reorderComponentCommand(id, target, commandContext()));
  }

  function reorderTo(id: ComponentId, targetIndex: number): void {
    const index = recipe.components.findIndex((component) => component.id === id);
    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >= recipe.components.length ||
      index === targetIndex
    )
      return;
    commit(reorderComponentCommand(id, targetIndex, commandContext()));
  }

  function rename(id: ComponentId, name: string): boolean {
    return commit(renameComponentCommand(id, name, commandContext()));
  }

  function updateBlend(id: ComponentId, blendMode: Component['appearance']['blendMode']): void {
    commit(updateComponentAppearanceCommand(id, { blendMode }, commandContext()));
  }

  function updateBandShape(
    id: ComponentId,
    patch: Parameters<typeof updateBandShapeCommand>[1],
  ): void {
    commit(updateBandShapeCommand(id, patch, commandContext()));
  }

  function updateComponentColor(id: ComponentId, patch: ColorPatch): void {
    commit(updateComponentColorCommand(id, patch, { canonicalize: canonicalRecipeBytes }));
  }

  function updateBaseColor(patch: ColorPatch): void {
    commit(updateBaseColorCommand(patch, { canonicalize: canonicalRecipeBytes }));
  }

  function toggleVisibility(id: ComponentId): void {
    const component = recipe.components.find((entry) => entry.id === id);
    if (component === undefined) return;
    const resolved = resolveComponentColor(recipe, component).value;
    const isHidden = hiddenOpacityById.current.has(id) && resolved.opacity <= 0;
    if (isHidden) {
      const opacity = hiddenOpacityById.current.get(id) ?? 1;
      if (
        commit(updateComponentColorCommand(id, { opacity }, { canonicalize: canonicalRecipeBytes }))
      ) {
        setFeedback(undefined);
      }
      return;
    }
    hiddenOpacityById.current.set(id, resolved.opacity);
    if (
      !commit(
        updateComponentColorCommand(id, { opacity: 0 }, { canonicalize: canonicalRecipeBytes }),
      )
    ) {
      hiddenOpacityById.current.delete(id);
    }
  }

  function isLayerVisible(id: ComponentId): boolean {
    const component = recipe.components.find((entry) => entry.id === id);
    if (component === undefined) return false;
    const opacity = resolveComponentColor(recipe, component).value.opacity;
    return !hiddenOpacityById.current.has(id) || opacity > 0;
  }

  function setAnchorEditing(enabled: boolean): void {
    if (!enabled) {
      setAnchorEditMode(false);
      setSelectedAnchorId(undefined);
      return;
    }
    if (selectedComponent?.type !== 'field') {
      setFeedback('Select a Field layer before editing anchors.');
      return;
    }
    setAnchorEditMode(true);
    setSelectedAnchorId(selectedComponent.contour.anchors[0]?.id);
  }

  function insertAnchor(
    componentId: ComponentId,
    afterAnchorId: AnchorId,
    localPoint?: Readonly<{ x: number; y: number }>,
  ): void {
    const field = recipe.components.find(
      (component) => component.id === componentId && component.type === 'field',
    );
    if (field === undefined || field.type !== 'field') {
      setFeedback('Select a Field layer before adding an anchor.');
      return;
    }
    if (
      commit(
        insertFieldAnchorCommand(
          field.id,
          afterAnchorId,
          commandContextForAnchor(),
          localPoint === undefined ? undefined : { x: localPoint.x, y: localPoint.y },
        ),
      )
    ) {
      setSelectedIds([field.id]);
      setAnchorEditMode(true);
      setSelectedAnchorId(allocatedAnchorId.current);
    }
  }

  function addAnchor(): void {
    if (selectedComponent?.type !== 'field') {
      setFeedback('Select a Field layer before adding an anchor.');
      return;
    }
    const afterAnchorId = selectedAnchorId ?? selectedComponent.contour.anchors[0]?.id;
    if (afterAnchorId === undefined) return;
    insertAnchor(selectedComponent.id, afterAnchorId);
  }

  function removeAnchor(): void {
    if (selectedComponent?.type !== 'field' || selectedAnchorId === undefined) {
      setFeedback('Select a Field anchor before removing it.');
      return;
    }
    const anchorIndex = selectedComponent.contour.anchors.findIndex(
      (anchor) => anchor.id === selectedAnchorId,
    );
    const nextAnchorId =
      selectedComponent.contour.anchors[anchorIndex + 1]?.id ??
      selectedComponent.contour.anchors[anchorIndex - 1]?.id;
    if (
      commit(removeFieldAnchorCommand(selectedComponent.id, selectedAnchorId, commandContext()))
    ) {
      setSelectedAnchorId(nextAnchorId);
    }
  }

  function resetTransform(): void {
    if (selectedComponent === undefined) return;
    const baseSize =
      selectedComponent.type === 'field'
        ? { width: 0.82, height: 0.64 }
        : { width: 1.2, height: 0.18 };
    commit(
      updateComponentTransformCommand(
        selectedComponent.id,
        { translation: { x: 0.5, y: 0.5 }, baseSize, rotationDeg: 0, uniformScale: 1 },
        commandContext(),
      ),
    );
  }

  function clearSelection(): void {
    cancelGesture();
    setSelectedIds([]);
    setAnchorEditMode(false);
    setSelectedAnchorId(undefined);
  }

  function undo(): boolean {
    finishGesture();
    const result = store.undo();
    if (!result.ok) {
      reportRejected(result.diagnostics);
      return false;
    }
    setFeedback(undefined);
    return true;
  }

  function redo(): boolean {
    finishGesture();
    const result = store.redo();
    if (!result.ok) {
      reportRejected(result.diagnostics);
      return false;
    }
    setFeedback(undefined);
    return true;
  }

  return {
    recipe,
    previewRecipe: snapshot.previewRecipe,
    canonicalRecipeHash: snapshot.persistence.currentRecipeHash,
    selectedIds: effectiveSelectedIds,
    selectedComponentId,
    selectedComponent,
    selectedComponentColor,
    selectedAnchorId: effectiveSelectedAnchorId,
    anchorEditMode: effectiveAnchorEditMode,
    feedback,
    history: snapshot.history,
    select,
    selectAnchor: setSelectedAnchorId,
    add,
    addPreset,
    duplicate,
    remove,
    reorder,
    reorderTo,
    rename,
    toggleVisibility,
    isLayerVisible,
    updateBlend,
    updateBandShape,
    updateComponentColor,
    updateBaseColor,
    updateInspector,
    finishGesture,
    cancelGesture,
    applyPreviewGesture,
    setAnchorEditing,
    addAnchor,
    insertAnchor,
    removeAnchor,
    resetTransform,
    clearSelection,
    undo,
    redo,
    commit,
    commandContext,
  };
}
