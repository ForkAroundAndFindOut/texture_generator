import { canonicalSceneV03FileBytes, type SceneV03 } from '../domain';
import { compileSceneRenderIR, serializeSceneCss, serializeSceneSvg } from '../renderers';

export type SceneV03ExportBundle = Readonly<{
  readonly sceneJson: string;
  readonly svg: string;
  readonly css: string;
}>;

export const SCENE_V03_EXPORT_FILENAMES = {
  sceneJson: 'texture-lab-v0.3.scene.json',
  svg: 'texture-lab-v0.3.svg',
  css: 'texture-lab-v0.3.css',
} as const;

export const SCENE_V03_EXPORT_MIME_TYPES = {
  sceneJson: 'application/json;charset=utf-8',
  svg: 'image/svg+xml;charset=utf-8',
  css: 'text/css;charset=utf-8',
} as const;

/**
 * Produces the three portable v0.3 representations from one validated scene.
 * SVG paths, transform matrices, colors, and material effects are shared with
 * the live preview, while the CSS embed scales to its host element.
 */
export function createSceneV03ExportBundle(scene: SceneV03): SceneV03ExportBundle {
  const ir = compileSceneRenderIR(scene);
  const svg = serializeSceneSvg(ir, {
    title: 'Texture Lab v0.3 composition',
    description: 'Responsive vector texture with editable colors, paths, and material effects.',
  });
  return {
    sceneJson: new TextDecoder().decode(canonicalSceneV03FileBytes(scene)),
    svg,
    css: serializeSceneCss(ir, svg, { selector: '.texture-lab-scene' }),
  };
}
