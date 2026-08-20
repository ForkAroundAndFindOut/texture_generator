import { createElement } from 'react';

import type { SceneRenderIR } from '../shared/sceneIr';
import { serializeSceneSvg, type SceneSvgSerializationOptions } from '../svg/serializeSceneSvg';

export type DomSceneSvgRendererProps = SceneSvgSerializationOptions & {
  readonly ir: SceneRenderIR;
  readonly className?: string;
};

export type DomSceneSvgModel = {
  readonly kind: 'dom-scene-svg';
  readonly markup: string;
};

/**
 * The preview deliberately mounts the exact SVG serializer output. This keeps
 * DOM preview, SVG download, and CSS embed material semantics pixel-aligned.
 */
export function renderDomSceneSvg(
  ir: SceneRenderIR,
  options: SceneSvgSerializationOptions = {},
): DomSceneSvgModel {
  return { kind: 'dom-scene-svg', markup: serializeSceneSvg(ir, options) };
}

export function DomSceneSvgRenderer({
  ir,
  title,
  description,
  className,
}: DomSceneSvgRendererProps) {
  const model = renderDomSceneSvg(ir, {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
  });
  return createElement('div', {
    className,
    'data-scene-render-ir-version': ir.version,
    dangerouslySetInnerHTML: { __html: model.markup },
  });
}

export default DomSceneSvgRenderer;
