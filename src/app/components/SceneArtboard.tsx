import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

import type { GroupId, SceneV03 } from '../../domain';
import { compileSceneRenderIR, DomSceneSvgRenderer } from '../../renderers';

export type SceneArtboardProps = {
  readonly scene: SceneV03;
  readonly selectedGroupId?: GroupId;
  readonly onSelectGroup: (groupId: GroupId) => void;
  readonly onClearSelection: () => void;
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
}: SceneArtboardProps) {
  const ir = useMemo(() => compileSceneRenderIR(scene), [scene]);
  const markupRoot = useRef<HTMLDivElement>(null);
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
