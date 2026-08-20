import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { GroupId, ScenePoint, SceneV03 } from '../../domain';
import { compileSceneRenderIR, DomSceneSvgRenderer } from '../../renderers';

export type SceneFreeformDraftProps = Readonly<{
  readonly points: readonly ScenePoint[];
  readonly hoverPoint?: ScenePoint;
  readonly canClose: boolean;
}>;

export type SceneArtboardProps = {
  readonly scene: SceneV03;
  readonly selectedGroupId?: GroupId;
  readonly onSelectGroup: (groupId: GroupId) => void;
  readonly onClearSelection: () => void;
  readonly onDrag: (
    groupId: GroupId,
    phase: 'start' | 'move' | 'end' | 'cancel',
    deltaX?: number,
    deltaY?: number,
  ) => void;
  readonly freeformDraft?: SceneFreeformDraftProps;
  readonly onFreeformPoint: (point: ScenePoint) => void;
  readonly onFreeformHover: (point: ScenePoint | undefined) => void;
  readonly onCancelFreeform: () => void;
};

type DragState = {
  readonly pointerId: number;
  readonly groupId: GroupId;
  readonly startX: number;
  readonly startY: number;
};

const aspectRatio = (ratio: SceneV03['artboard']['ratio']): string => ratio.replace(':', ' / ');

const ratioScalar = (ratio: SceneV03['artboard']['ratio']): number => {
  const [width, height] = ratio.split(':').map(Number);
  if (width === undefined || height === undefined || height === 0) return 1;
  return width / height;
};

/** Exact shared SVG renderer with lightweight editor-only selection affordances. */
export function SceneArtboard({
  scene,
  selectedGroupId,
  onSelectGroup,
  onClearSelection,
  onDrag,
  freeformDraft,
  onFreeformPoint,
  onFreeformHover,
  onCancelFreeform,
}: SceneArtboardProps) {
  const ir = useMemo(() => compileSceneRenderIR(scene), [scene]);
  const markupRoot = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | undefined>(undefined);
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

  function groupIdFromTarget(target: EventTarget | null): GroupId | undefined {
    if (!(target instanceof Element)) return undefined;
    return (
      target.closest('[data-scene-group-id]')?.getAttribute('data-scene-group-id') ?? undefined
    );
  }

  function dragDelta(event: ReactPointerEvent<HTMLDivElement>, state: DragState) {
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

  function artboardPoint(event: ReactPointerEvent<HTMLDivElement>): ScenePoint | undefined {
    const svg = markupRoot.current?.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    if (box === undefined || box === null || box.width <= 0 || box.height <= 0) return undefined;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  }

  function pointInViewBox(point: ScenePoint): ScenePoint {
    return {
      x: ir.artboard.viewBox.minX + point.x * ir.artboard.viewBox.width,
      y: ir.artboard.viewBox.minY + point.y * ir.artboard.viewBox.height,
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

  return (
    <section className="scene-artboard" aria-label="Composition canvas" data-scene-artboard>
      <div className="scene-artboard__viewport">
        <div
          className={`scene-artboard__frame${freeformDraft === undefined ? '' : ' is-drawing'}`}
          style={artboardStyle}
        >
          <div
            ref={markupRoot}
            className="scene-artboard__svg"
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
              const target = event.target;
              if (!(target instanceof Element)) return;
              const group = target.closest('[data-scene-group-id]');
              const groupId = group?.getAttribute('data-scene-group-id');
              if (groupId === null || groupId === undefined) onClearSelection();
              else onSelectGroup(groupId);
            }}
            onPointerDown={(event) => {
              if (freeformDraft !== undefined) {
                const point = artboardPoint(event);
                if (point !== undefined) onFreeformPoint(point);
                event.preventDefault();
                return;
              }
              const groupId = groupIdFromTarget(event.target);
              if (groupId === undefined) {
                onClearSelection();
                return;
              }
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
              const state = drag.current;
              if (state === undefined || state.pointerId !== event.pointerId) return;
              const delta = dragDelta(event, state);
              onDrag(state.groupId, 'move', delta.x, delta.y);
            }}
            onPointerUp={(event) => {
              if (freeformDraft !== undefined) return;
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
              const state = drag.current;
              if (state === undefined || state.pointerId !== event.pointerId) return;
              onDrag(state.groupId, 'cancel');
              drag.current = undefined;
            }}
            onPointerLeave={() => {
              if (freeformDraft !== undefined) onFreeformHover(undefined);
            }}
            onKeyDown={(event) => {
              if (freeformDraft !== undefined && event.key === 'Escape') {
                event.preventDefault();
                onCancelFreeform();
              }
            }}
          >
            <DomSceneSvgRenderer
              ir={ir}
              title="Texture Lab composition"
              description="A responsive vector texture composition."
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
          {scene.rootGroups.length === 0 ? (
            <p className="scene-artboard__empty">
              Pick a starter or add a visual gesture. New layers always appear on top.
            </p>
          ) : null}
        </div>
      </div>
      <p className="scene-artboard__caption">
        {scene.artboard.ratio} artboard · {scene.artboard.fitMode === 'fit' ? 'Fit' : 'Cover'}{' '}
        framing · vector preview
        {freeformDraft === undefined
          ? ''
          : ` · Drawing Boundary (${freeformDraft.points.length}/64 points)`}
      </p>
    </section>
  );
}

export default SceneArtboard;
