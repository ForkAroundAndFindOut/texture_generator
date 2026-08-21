import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { GroupId, ScenePoint, SceneV03 } from '../../domain';
import type { SceneLayerTransformPatch } from '../../editor';
import {
  compileSceneRenderIR,
  DomSceneSvgRenderer,
  transformSceneRenderPoint,
} from '../../renderers';

export type SceneFreeformDraftProps = Readonly<{
  readonly points: readonly ScenePoint[];
  readonly hoverPoint?: ScenePoint;
  readonly canClose: boolean;
}>;

export type SceneBoundaryEditorProps = Readonly<{
  readonly materialId: string;
  readonly vertices: readonly ScenePoint[];
  readonly selectedVertexIndex?: number;
}>;

export type SceneArtboardProps = {
  readonly scene: SceneV03;
  readonly selectedGroupId?: GroupId;
  /** A sidebar-selected layer gets an editor-only interaction cage above the artwork. */
  readonly pinnedGroupId?: GroupId;
  readonly isInteracting?: boolean;
  readonly interactionRevision?: number;
  readonly scaleLocked: boolean;
  readonly resizeFromCenter: boolean;
  readonly onSelectGroup: (groupId: GroupId) => void;
  readonly onClearSelection: () => void;
  readonly onDrag: (
    groupId: GroupId,
    phase: 'start' | 'move' | 'end' | 'cancel',
    deltaX?: number,
    deltaY?: number,
  ) => void;
  readonly onTransform: (
    groupId: GroupId,
    phase: 'start' | 'move' | 'end' | 'cancel',
    patch?: SceneLayerTransformPatch,
  ) => void;
  readonly freeformDraft?: SceneFreeformDraftProps;
  readonly onFreeformPoint: (point: ScenePoint) => void;
  readonly onFreeformHover: (point: ScenePoint | undefined) => void;
  readonly onCloseFreeform: () => void;
  readonly onCancelFreeform: () => void;
  readonly boundaryEditor?: SceneBoundaryEditorProps;
  readonly onBoundaryVertexEdit: (
    materialId: string,
    vertexIndex: number,
    phase: 'start' | 'move' | 'end' | 'cancel',
    point?: ScenePoint,
  ) => void;
  readonly onInsertBoundaryVertex: (
    materialId: string,
    afterIndex: number,
    point: ScenePoint,
  ) => void;
  readonly onCancelBoundaryEdit: () => void;
};

type DragState = {
  readonly pointerId: number;
  readonly groupId: GroupId;
  readonly startX: number;
  readonly startY: number;
};

type FreeformClickState = {
  readonly x: number;
  readonly y: number;
  readonly timestamp: number;
};

type TransformHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type TransformDragState = Readonly<{
  pointerId: number;
  groupId: GroupId;
  handle: TransformHandle;
  startX: number;
  startY: number;
  bounds: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
  transform: SceneV03['rootGroups'][number]['transform'];
  scaleLocked: boolean;
}>;

const DOUBLE_CLICK_DELAY_MS = 600;
const DOUBLE_CLICK_DISTANCE_PX = 8;
const MINIMUM_SCALE = 0.05;
const MAXIMUM_SCALE = 4;

const aspectRatio = (ratio: SceneV03['artboard']['ratio']): string => ratio.replace(':', ' / ');

const ratioScalar = (ratio: SceneV03['artboard']['ratio']): number => {
  const [width, height] = ratio.split(':').map(Number);
  if (width === undefined || height === undefined || height === 0) return 1;
  return width / height;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const handleAxes = (handle: TransformHandle): Readonly<{ x: -1 | 0 | 1; y: -1 | 0 | 1 }> => {
  switch (handle) {
    case 'nw':
      return { x: -1, y: -1 };
    case 'n':
      return { x: 0, y: -1 };
    case 'ne':
      return { x: 1, y: -1 };
    case 'e':
      return { x: 1, y: 0 };
    case 'se':
      return { x: 1, y: 1 };
    case 's':
      return { x: 0, y: 1 };
    case 'sw':
      return { x: -1, y: 1 };
    case 'w':
      return { x: -1, y: 0 };
  }
};

/** Exact shared SVG renderer with lightweight editor-only selection affordances. */
export function SceneArtboard({
  scene,
  selectedGroupId,
  pinnedGroupId,
  isInteracting = false,
  interactionRevision = 0,
  scaleLocked,
  resizeFromCenter,
  onSelectGroup,
  onClearSelection,
  onDrag,
  onTransform,
  freeformDraft,
  onFreeformPoint,
  onFreeformHover,
  onCloseFreeform,
  onCancelFreeform,
  boundaryEditor,
  onBoundaryVertexEdit,
  onInsertBoundaryVertex,
  onCancelBoundaryEdit,
}: SceneArtboardProps) {
  const ir = useMemo(() => compileSceneRenderIR(scene), [scene]);
  const markupRoot = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | undefined>(undefined);
  const transformDrag = useRef<TransformDragState | undefined>(undefined);
  const freeformClick = useRef<FreeformClickState | undefined>(undefined);
  const [settledInteractionRevision, setSettledInteractionRevision] = useState(-1);
  const draftQuality = isInteracting && settledInteractionRevision !== interactionRevision;
  const [hoveredBoundarySegmentIndex, setHoveredBoundarySegmentIndex] = useState<
    number | undefined
  >(undefined);
  const artboardStyle: CSSProperties & Record<'--scene-artboard-ratio', string> = {
    aspectRatio: aspectRatio(scene.artboard.ratio),
    '--scene-artboard-ratio': String(ratioScalar(scene.artboard.ratio)),
  };

  useEffect(() => {
    const root = markupRoot.current;
    if (root === null) return;
    for (const group of root.querySelectorAll<SVGGElement>('[data-scene-group-id]')) {
      if (group.getAttribute('data-scene-group-id') === selectedGroupId) {
        group.setAttribute('data-scene-selected', 'true');
      } else {
        group.removeAttribute('data-scene-selected');
      }
    }
  }, [ir, selectedGroupId]);

  useEffect(() => {
    if (freeformDraft === undefined) freeformClick.current = undefined;
  }, [freeformDraft]);

  useEffect(() => {
    if (!isInteracting) return undefined;
    const timer = globalThis.setTimeout(
      () => setSettledInteractionRevision(interactionRevision),
      180,
    );
    return () => globalThis.clearTimeout(timer);
  }, [isInteracting, interactionRevision]);

  function groupIdFromTarget(target: EventTarget | null): GroupId | undefined {
    if (!(target instanceof Element)) return undefined;
    const rootIds = new Set(scene.rootGroups.map((group) => group.id));
    let current: Element | null = target;
    while (current !== null) {
      const candidate = current.getAttribute('data-scene-group-id');
      if (candidate !== null && rootIds.has(candidate)) return candidate;
      current = current.parentElement;
    }
    return undefined;
  }

  function selectGroupUnderPointer(target: EventTarget | null): void {
    const hitGroupId = groupIdFromTarget(target);
    const frontToBackIds = scene.rootGroups
      .filter((group) => group.visible)
      .map((group) => group.id)
      .reverse();
    if (hitGroupId === undefined || frontToBackIds.length === 0) {
      onClearSelection();
      return;
    }
    // Repeated Alt/Option-clicks continue from the current obscured selection.
    // The first click begins at the visual group that received the pointer.
    const current =
      selectedGroupId !== undefined && frontToBackIds.includes(selectedGroupId)
        ? selectedGroupId
        : hitGroupId;
    const index = frontToBackIds.indexOf(current);
    const next = frontToBackIds[(index + 1) % frontToBackIds.length];
    if (next !== undefined) onSelectGroup(next);
  }

  function dragDelta(event: ReactPointerEvent<Element>, state: DragState) {
    const svg = markupRoot.current?.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    if (box === undefined || box === null || box.width <= 0 || box.height <= 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((event.clientX - state.startX) / box.width) * (ir.artboard.viewBox.width / 900),
      y: ((event.clientY - state.startY) / box.height) * (ir.artboard.viewBox.height / 900),
    };
  }

  function artboardPoint(
    event: Pick<ReactPointerEvent<Element>, 'clientX' | 'clientY'>,
  ): ScenePoint | undefined {
    const svg = markupRoot.current?.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    if (box === undefined || box === null || box.width <= 0 || box.height <= 0) return undefined;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }

  function unclampedArtboardPoint(
    event: Pick<ReactPointerEvent<Element>, 'clientX' | 'clientY'>,
  ): ScenePoint | undefined {
    const svg = markupRoot.current?.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    if (box === undefined || box === null || box.width <= 0 || box.height <= 0) return undefined;
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  function transformPatchFromPointer(
    event: ReactPointerEvent<Element>,
    state: TransformDragState,
  ): SceneLayerTransformPatch {
    const delta = dragDelta(event, state);
    const radians = (state.transform.rotationDeg * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const localDelta = {
      x: (cosine * delta.x + sine * delta.y) / state.transform.scale.x,
      y: (-sine * delta.x + cosine * delta.y) / state.transform.scale.y,
    };
    const axes = handleAxes(state.handle);
    const resizeFromLogicalCenter = resizeFromCenter || event.ctrlKey || event.altKey;
    const locked = state.scaleLocked !== event.shiftKey;
    const localCenter = {
      x: (state.bounds.minX + state.bounds.maxX) / 2,
      y: (state.bounds.minY + state.bounds.maxY) / 2,
    };
    const pivot = {
      x:
        resizeFromLogicalCenter || axes.x === 0
          ? localCenter.x
          : axes.x > 0
            ? state.bounds.minX
            : state.bounds.maxX,
      y:
        resizeFromLogicalCenter || axes.y === 0
          ? localCenter.y
          : axes.y > 0
            ? state.bounds.minY
            : state.bounds.maxY,
    };
    const scaleFactor = (axis: 'x' | 'y', direction: -1 | 0 | 1): number => {
      if (direction === 0) return 1;
      const edge =
        axis === 'x'
          ? direction > 0
            ? state.bounds.maxX
            : state.bounds.minX
          : direction > 0
            ? state.bounds.maxY
            : state.bounds.minY;
      const deltaForAxis = axis === 'x' ? localDelta.x : localDelta.y;
      const pivotForAxis = axis === 'x' ? pivot.x : pivot.y;
      const baseDistance = edge - pivotForAxis;
      if (Math.abs(baseDistance) < 1e-9) return 1;
      return Math.max(0.001, (edge + deltaForAxis - pivotForAxis) / baseDistance);
    };

    let factorX = scaleFactor('x', axes.x);
    let factorY = scaleFactor('y', axes.y);
    if (locked) {
      const factor = Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
      const minimumFactor = Math.max(
        MINIMUM_SCALE / state.transform.scale.x,
        MINIMUM_SCALE / state.transform.scale.y,
      );
      const maximumFactor = Math.min(
        MAXIMUM_SCALE / state.transform.scale.x,
        MAXIMUM_SCALE / state.transform.scale.y,
      );
      factorX = clamp(factor, minimumFactor, maximumFactor);
      factorY = factorX;
    }
    const nextScale = {
      x: clamp(state.transform.scale.x * factorX, MINIMUM_SCALE, MAXIMUM_SCALE),
      y: clamp(state.transform.scale.y * factorY, MINIMUM_SCALE, MAXIMUM_SCALE),
    };
    const pivotOffset = {
      x: (state.transform.scale.x - nextScale.x) * (pivot.x - 0.5),
      y: (state.transform.scale.y - nextScale.y) * (pivot.y - 0.5),
    };
    const translation = {
      x: clamp(
        state.transform.translation.x + cosine * pivotOffset.x - sine * pivotOffset.y,
        -2,
        3,
      ),
      y: clamp(
        state.transform.translation.y + sine * pivotOffset.x + cosine * pivotOffset.y,
        -2,
        3,
      ),
    };
    return { scale: nextScale, translation };
  }

  function pointInViewBox(point: ScenePoint): ScenePoint {
    return {
      x: ir.artboard.viewBox.minX + point.x * ir.artboard.viewBox.width,
      y: ir.artboard.viewBox.minY + point.y * ir.artboard.viewBox.height,
    };
  }

  const boundaryMaterial =
    boundaryEditor === undefined
      ? undefined
      : ir.materials.find((material) => material.id === boundaryEditor.materialId);

  function worldPointInArtboard(point: ScenePoint): {
    readonly left: string;
    readonly top: string;
  } {
    return {
      left: `${((point.x - ir.artboard.viewBox.minX) / ir.artboard.viewBox.width) * 100}%`,
      top: `${((point.y - ir.artboard.viewBox.minY) / ir.artboard.viewBox.height) * 100}%`,
    };
  }

  function boundaryPointFromEvent(
    event: Pick<ReactPointerEvent<Element>, 'clientX' | 'clientY'>,
  ): ScenePoint | undefined {
    if (boundaryMaterial === undefined) return undefined;
    const relative = unclampedArtboardPoint(event);
    if (relative === undefined) return undefined;
    const world = {
      x: ir.artboard.viewBox.minX + relative.x * ir.artboard.viewBox.width,
      y: ir.artboard.viewBox.minY + relative.y * ir.artboard.viewBox.height,
    };
    const matrix = boundaryMaterial.path.matrix;
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return undefined;
    const translatedX = world.x - matrix.e;
    const translatedY = world.y - matrix.f;
    return {
      x: (matrix.d * translatedX - matrix.c * translatedY) / determinant,
      y: (-matrix.b * translatedX + matrix.a * translatedY) / determinant,
    };
  }

  const previewPoints =
    freeformDraft === undefined
      ? []
      : [
          ...freeformDraft.points,
          ...(freeformDraft.hoverPoint === undefined ? [] : [freeformDraft.hoverPoint]),
        ].map(pointInViewBox);
  const firstDraftPoint = freeformDraft?.points[0];
  const firstDraftPointInViewBox =
    firstDraftPoint === undefined ? undefined : pointInViewBox(firstDraftPoint);
  const boundaryEditorPoints =
    boundaryEditor === undefined || boundaryMaterial === undefined || freeformDraft !== undefined
      ? []
      : boundaryEditor.vertices.map((point) => ({
          local: point,
          world: transformSceneRenderPoint(boundaryMaterial.path.matrix, point),
        }));
  const pinnedSelection =
    pinnedGroupId === undefined ||
    freeformDraft !== undefined ||
    boundaryEditor !== undefined ||
    !scene.rootGroups.some((group) => group.id === pinnedGroupId && group.visible)
      ? undefined
      : (() => {
          const rootGroup = ir.rootGroups.find((group) => group.id === pinnedGroupId);
          if (rootGroup === undefined) return undefined;
          const worldPoints = ir.materials
            .filter((material) => material.visible && material.groupIds.includes(pinnedGroupId))
            .flatMap((material) =>
              material.path.commands.flatMap((command) =>
                command.kind === 'close'
                  ? []
                  : [transformSceneRenderPoint(material.path.matrix, command)],
              ),
            );
          if (worldPoints.length === 0) return undefined;
          const determinant =
            rootGroup.matrix.a * rootGroup.matrix.d - rootGroup.matrix.b * rootGroup.matrix.c;
          if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return undefined;
          const localPoints = worldPoints.map((point) => {
            const translatedX = point.x - rootGroup.matrix.e;
            const translatedY = point.y - rootGroup.matrix.f;
            return {
              x:
                (rootGroup.matrix.d * translatedX - rootGroup.matrix.c * translatedY) / determinant,
              y:
                (-rootGroup.matrix.b * translatedX + rootGroup.matrix.a * translatedY) /
                determinant,
            };
          });
          const bounds = {
            minX: Math.min(...localPoints.map((point) => point.x)),
            maxX: Math.max(...localPoints.map((point) => point.x)),
            minY: Math.min(...localPoints.map((point) => point.y)),
            maxY: Math.max(...localPoints.map((point) => point.y)),
          };
          const corners = [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
            { x: bounds.minX, y: bounds.maxY },
          ].map((point) => transformSceneRenderPoint(rootGroup.matrix, point));
          return { bounds, corners };
        })();
  const pinnedSelectionGroupId =
    pinnedSelection === undefined || pinnedGroupId === undefined ? undefined : pinnedGroupId;
  const transformHandles =
    pinnedSelection === undefined
      ? []
      : (
          [
            ['nw', pinnedSelection.corners[0]!],
            [
              'n',
              {
                x: (pinnedSelection.corners[0]!.x + pinnedSelection.corners[1]!.x) / 2,
                y: (pinnedSelection.corners[0]!.y + pinnedSelection.corners[1]!.y) / 2,
              },
            ],
            ['ne', pinnedSelection.corners[1]!],
            [
              'e',
              {
                x: (pinnedSelection.corners[1]!.x + pinnedSelection.corners[2]!.x) / 2,
                y: (pinnedSelection.corners[1]!.y + pinnedSelection.corners[2]!.y) / 2,
              },
            ],
            ['se', pinnedSelection.corners[2]!],
            [
              's',
              {
                x: (pinnedSelection.corners[2]!.x + pinnedSelection.corners[3]!.x) / 2,
                y: (pinnedSelection.corners[2]!.y + pinnedSelection.corners[3]!.y) / 2,
              },
            ],
            ['sw', pinnedSelection.corners[3]!],
            [
              'w',
              {
                x: (pinnedSelection.corners[3]!.x + pinnedSelection.corners[0]!.x) / 2,
                y: (pinnedSelection.corners[3]!.y + pinnedSelection.corners[0]!.y) / 2,
              },
            ],
          ] as const
        ).filter(([handle]) => !scaleLocked || handle.length === 2);

  return (
    <section className="scene-artboard" aria-label="Composition canvas" data-scene-artboard>
      <div className="scene-artboard__viewport">
        <div
          className={`scene-artboard__frame${freeformDraft === undefined ? '' : ' is-drawing'}${boundaryEditor === undefined ? '' : ' is-editing-boundary'}`}
          style={artboardStyle}
        >
          <div
            ref={markupRoot}
            className="scene-artboard__svg"
            data-scene-render-quality={draftQuality ? 'draft' : 'full'}
            data-scene-selected-group-id={selectedGroupId ?? ''}
            {...(freeformDraft === undefined ? {} : { tabIndex: 0 })}
            {...(freeformDraft === undefined
              ? {}
              : { 'aria-label': `Drawing Boundary, ${freeformDraft.points.length} points placed` })}
            onClick={(event) => {
              if (freeformDraft !== undefined) {
                event.preventDefault();
                return;
              }
              if (boundaryEditor !== undefined) return;
              if (event.altKey) {
                event.preventDefault();
                selectGroupUnderPointer(event.target);
                return;
              }
              const groupId = groupIdFromTarget(event.target);
              if (groupId === undefined) onClearSelection();
              else onSelectGroup(groupId);
            }}
            onPointerDown={(event) => {
              if (freeformDraft !== undefined) {
                const point = artboardPoint(event);
                const previousClick = freeformClick.current;
                const distance =
                  previousClick === undefined
                    ? Number.POSITIVE_INFINITY
                    : Math.hypot(event.clientX - previousClick.x, event.clientY - previousClick.y);
                const isDoubleClick =
                  event.pointerType === 'mouse' &&
                  previousClick !== undefined &&
                  event.timeStamp - previousClick.timestamp <= DOUBLE_CLICK_DELAY_MS &&
                  distance <= DOUBLE_CLICK_DISTANCE_PX;
                if (isDoubleClick) {
                  freeformClick.current = undefined;
                  onCloseFreeform();
                } else if (point !== undefined) {
                  freeformClick.current = {
                    x: event.clientX,
                    y: event.clientY,
                    timestamp: event.timeStamp,
                  };
                  onFreeformPoint(point);
                }
                event.preventDefault();
                return;
              }
              if (boundaryEditor !== undefined) return;
              if (event.altKey) return;
              const groupId = groupIdFromTarget(event.target);
              if (groupId === undefined) {
                onClearSelection();
                return;
              }
              onSelectGroup(groupId);
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointerId: event.pointerId,
                groupId,
                startX: event.clientX,
                startY: event.clientY,
              };
              onDrag(groupId, 'start');
            }}
            onPointerMove={(event) => {
              if (freeformDraft !== undefined) {
                onFreeformHover(artboardPoint(event));
                return;
              }
              if (boundaryEditor !== undefined) return;
              const state = drag.current;
              if (state === undefined || state.pointerId !== event.pointerId) return;
              const delta = dragDelta(event, state);
              onDrag(state.groupId, 'move', delta.x, delta.y);
            }}
            onPointerUp={(event) => {
              if (freeformDraft !== undefined) return;
              if (boundaryEditor !== undefined) return;
              const state = drag.current;
              if (state === undefined || state.pointerId !== event.pointerId) return;
              const delta = dragDelta(event, state);
              onDrag(state.groupId, 'end', delta.x, delta.y);
              drag.current = undefined;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (freeformDraft !== undefined) {
                onFreeformHover(undefined);
                return;
              }
              if (boundaryEditor !== undefined) return;
              const state = drag.current;
              if (state === undefined || state.pointerId !== event.pointerId) return;
              onDrag(state.groupId, 'cancel');
              drag.current = undefined;
            }}
            onPointerLeave={() => {
              if (freeformDraft !== undefined) onFreeformHover(undefined);
            }}
            onDoubleClick={(event) => {
              if (freeformDraft === undefined) return;
              event.preventDefault();
              freeformClick.current = undefined;
              onCloseFreeform();
            }}
            onKeyDown={(event) => {
              if (freeformDraft !== undefined && event.key === 'Enter') {
                event.preventDefault();
                onCloseFreeform();
              }
              if (freeformDraft !== undefined && event.key === 'Escape') {
                event.preventDefault();
                onCancelFreeform();
              }
              if (boundaryEditor !== undefined && event.key === 'Escape') {
                event.preventDefault();
                onCancelBoundaryEdit();
              }
            }}
          >
            <DomSceneSvgRenderer
              ir={ir}
              title="Texture Lab composition"
              description="A responsive vector texture composition."
              quality={draftQuality ? 'draft' : 'full'}
            />
          </div>
          {freeformDraft === undefined ? null : (
            <svg
              className="scene-artboard__draft"
              aria-hidden="true"
              viewBox={`${ir.artboard.viewBox.minX} ${ir.artboard.viewBox.minY} ${ir.artboard.viewBox.width} ${ir.artboard.viewBox.height}`}
            >
              {previewPoints.length > 1 ? (
                <polyline
                  className="scene-artboard__draft-line"
                  points={previewPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                />
              ) : null}
              {freeformDraft.points.map((point, index) => {
                const position = pointInViewBox(point);
                return (
                  <circle
                    key={`${index}-${point.x}-${point.y}`}
                    className={`scene-artboard__draft-point${index === 0 ? ' is-start' : ''}${index === 0 && freeformDraft.canClose ? ' is-close-target' : ''}`}
                    cx={position.x}
                    cy={position.y}
                    r={index === 0 ? 12 : 7}
                  />
                );
              })}
              {firstDraftPointInViewBox !== undefined && freeformDraft.canClose ? (
                <circle
                  className="scene-artboard__draft-snap-ring"
                  cx={firstDraftPointInViewBox.x}
                  cy={firstDraftPointInViewBox.y}
                  r="24"
                />
              ) : null}
            </svg>
          )}
          {pinnedSelection === undefined || pinnedSelectionGroupId === undefined ? null : (
            <svg
              className="scene-artboard__selection-overlay"
              aria-label="Selected layer move control"
              viewBox={`${ir.artboard.viewBox.minX} ${ir.artboard.viewBox.minY} ${ir.artboard.viewBox.width} ${ir.artboard.viewBox.height}`}
            >
              <polygon
                className="scene-artboard__selection-cage"
                points={pinnedSelection.corners.map((point) => `${point.x},${point.y}`).join(' ')}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = {
                    pointerId: event.pointerId,
                    groupId: pinnedSelectionGroupId,
                    startX: event.clientX,
                    startY: event.clientY,
                  };
                  onDrag(pinnedSelectionGroupId, 'start');
                }}
                onPointerMove={(event) => {
                  const state = drag.current;
                  if (state === undefined || state.pointerId !== event.pointerId) return;
                  const delta = dragDelta(event, state);
                  onDrag(state.groupId, 'move', delta.x, delta.y);
                }}
                onPointerUp={(event) => {
                  const state = drag.current;
                  if (state === undefined || state.pointerId !== event.pointerId) return;
                  const delta = dragDelta(event, state);
                  onDrag(state.groupId, 'end', delta.x, delta.y);
                  drag.current = undefined;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
                onPointerCancel={() => {
                  const state = drag.current;
                  if (state === undefined) return;
                  onDrag(state.groupId, 'cancel');
                  drag.current = undefined;
                }}
              />
              {transformHandles.map(([handle, point]) => (
                <circle
                  key={handle}
                  className="scene-artboard__transform-handle"
                  aria-label={`Resize selected layer from ${handle}`}
                  cx={point.x}
                  cy={point.y}
                  r="10"
                  tabIndex={0}
                  role="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const group = scene.rootGroups.find(
                      (entry) => entry.id === pinnedSelectionGroupId,
                    );
                    if (group === undefined) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    transformDrag.current = {
                      pointerId: event.pointerId,
                      groupId: pinnedSelectionGroupId,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      bounds: pinnedSelection.bounds,
                      transform: group.transform,
                      scaleLocked,
                    };
                    onTransform(pinnedSelectionGroupId, 'start');
                  }}
                  onPointerMove={(event) => {
                    const state = transformDrag.current;
                    if (state === undefined || state.pointerId !== event.pointerId) return;
                    onTransform(state.groupId, 'move', transformPatchFromPointer(event, state));
                  }}
                  onPointerUp={(event) => {
                    const state = transformDrag.current;
                    if (state === undefined || state.pointerId !== event.pointerId) return;
                    onTransform(state.groupId, 'end');
                    transformDrag.current = undefined;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                  onPointerCancel={() => {
                    const state = transformDrag.current;
                    if (state === undefined) return;
                    onTransform(state.groupId, 'cancel');
                    transformDrag.current = undefined;
                  }}
                />
              ))}
            </svg>
          )}
          {boundaryEditor === undefined ||
          boundaryMaterial === undefined ||
          freeformDraft !== undefined ? null : (
            <div
              className="scene-artboard__boundary-editor"
              aria-label="Boundary editing controls"
              role="group"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                onCancelBoundaryEdit();
              }}
              onPointerLeave={() => setHoveredBoundarySegmentIndex(undefined)}
            >
              <svg
                className="scene-artboard__boundary-path"
                aria-hidden="true"
                viewBox={`${ir.artboard.viewBox.minX} ${ir.artboard.viewBox.minY} ${ir.artboard.viewBox.width} ${ir.artboard.viewBox.height}`}
              >
                {boundaryEditorPoints.map(({ world }, index) => {
                  const next = boundaryEditorPoints[(index + 1) % boundaryEditorPoints.length];
                  if (next === undefined) return null;
                  return (
                    <line
                      key={`segment-${index}`}
                      className={`scene-artboard__boundary-segment${hoveredBoundarySegmentIndex === index ? ' is-hovered' : ''}`}
                      x1={world.x}
                      y1={world.y}
                      x2={next.world.x}
                      y2={next.world.y}
                      onPointerEnter={() => setHoveredBoundarySegmentIndex(index)}
                    />
                  );
                })}
              </svg>
              {boundaryEditorPoints.map(({ local, world }, index) => (
                <button
                  key={`vertex-${index}-${local.x}-${local.y}`}
                  type="button"
                  className={`scene-artboard__boundary-handle${boundaryEditor.selectedVertexIndex === index ? ' is-selected' : ''}`}
                  aria-label={`Boundary corner ${index + 1}`}
                  style={worldPointInArtboard(world)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    onBoundaryVertexEdit(boundaryEditor.materialId, index, 'start');
                  }}
                  onPointerMove={(event) => {
                    const point = boundaryPointFromEvent(event);
                    if (point !== undefined) {
                      onBoundaryVertexEdit(boundaryEditor.materialId, index, 'move', point);
                    }
                  }}
                  onPointerUp={(event) => {
                    event.preventDefault();
                    onBoundaryVertexEdit(boundaryEditor.materialId, index, 'end');
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                  onPointerCancel={() =>
                    onBoundaryVertexEdit(boundaryEditor.materialId, index, 'cancel')
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onBoundaryVertexEdit(boundaryEditor.materialId, index, 'start');
                      onBoundaryVertexEdit(boundaryEditor.materialId, index, 'end');
                    }
                  }}
                >
                  <span className="visually-hidden">Corner {index + 1}</span>
                </button>
              ))}
              {boundaryEditorPoints.map(({ local, world }, index) => {
                if (hoveredBoundarySegmentIndex !== index) return null;
                const next = boundaryEditorPoints[(index + 1) % boundaryEditorPoints.length];
                if (next === undefined) return null;
                const midpoint = {
                  x: (local.x + next.local.x) / 2,
                  y: (local.y + next.local.y) / 2,
                };
                const worldMidpoint = {
                  x: (world.x + next.world.x) / 2,
                  y: (world.y + next.world.y) / 2,
                };
                return (
                  <button
                    key={`midpoint-${index}`}
                    type="button"
                    className="scene-artboard__boundary-midpoint"
                    aria-label={`Insert Boundary corner after corner ${index + 1}`}
                    style={worldPointInArtboard(worldMidpoint)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onInsertBoundaryVertex(boundaryEditor.materialId, index, midpoint);
                    }}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                );
              })}
            </div>
          )}
          {scene.rootGroups.length === 0 ? (
            <p className="scene-artboard__empty">
              Pick a starter or add a visual gesture. New layers always appear on top.
            </p>
          ) : null}
        </div>
      </div>
      <p className="scene-artboard__caption">
        {scene.artboard.ratio} artboard · {scene.artboard.fitMode === 'fit' ? 'Fit' : 'Cover'}{' '}
        framing · vector preview · Alt/Option-click cycles visible layers under the pointer
        {freeformDraft === undefined
          ? ''
          : ` · Drawing Boundary (${freeformDraft.points.length}/64 points)`}
      </p>
    </section>
  );
}

export default SceneArtboard;
