import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { GroupId, SceneV03 } from '../../domain';
import { compileSceneRenderIR, DomSceneSvgRenderer } from '../../renderers';

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

  return (
    <section className="scene-artboard" aria-label="Composition canvas" data-scene-artboard>
      <div className="scene-artboard__viewport">
        <div className="scene-artboard__frame" style={artboardStyle}>
          <div
            ref={markupRoot}
            className="scene-artboard__svg"
            data-scene-selected-group-id={selectedGroupId ?? ''}
            onClick={(event) => {
              const target = event.target;
              if (!(target instanceof Element)) return;
              const group = target.closest('[data-scene-group-id]');
              const groupId = group?.getAttribute('data-scene-group-id');
              if (groupId === null || groupId === undefined) onClearSelection();
              else onSelectGroup(groupId);
            }}
            onPointerDown={(event) => {
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
            onPointerCancel={(event) => {
              const state = drag.current;
              if (state === undefined || state.pointerId !== event.pointerId) return;
              onDrag(state.groupId, 'cancel');
              drag.current = undefined;
            }}
          >
            <DomSceneSvgRenderer
              ir={ir}
              title="Texture Lab composition"
              description="A responsive vector texture composition."
            />
          </div>
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
      </p>
    </section>
  );
}

export default SceneArtboard;
