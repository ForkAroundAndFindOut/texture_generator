/**
 * Public renderer boundary.
 *
 * Renderer contracts and adapters consume canonical domain data and shared
 * render IR. Keep renderer barrels free of editor state, persistence, export
 * orchestration, and test-support dependencies; use explicit exports only.
 */
export { DomSvgRenderer, renderDomSvg } from './dom-svg/DomSvgRenderer';
export type { DomSvgModel, DomSvgRendererProps } from './dom-svg/DomSvgRenderer';

export { compileRenderIR } from './shared/compileRenderIR';
export {
  artboardViewBoxForRatio,
  isSceneRenderProfile,
  preserveAspectRatioForFitMode,
  sceneRenderProfileForArtboard,
  SCENE_WORLD_SIZE,
} from './shared/sceneProfile';
export type { SceneRenderProfile, SceneViewBoxIR } from './shared/sceneProfile';
export { INTERACTION_BLEND_MODE, SCENE_RENDER_IR_VERSION } from './shared/sceneIr';
export type {
  SceneArtboardIR,
  SceneGrainIR,
  SceneMaterialRenderIR,
  SceneRenderGroupIR,
  SceneRenderIR,
  SceneRenderNodeIR,
  SceneSvgBlendMode,
} from './shared/sceneIr';
export type {
  BandLayerIR,
  BaseLayerIR,
  ClipIR,
  ColorIR,
  ComponentLayerIR,
  DefinitionId,
  EffectsLayerIR,
  FadeIR,
  FadeStopIR,
  FieldLayerIR,
  FitIR,
  LayerIR,
  MatrixIR,
  PathCommand,
  PathIR,
  RenderIR,
  RenderLayerIR,
  RenderLayersIR,
  TileCopyIR,
} from './shared/ir';
export { isCanonicalHex, toCanonicalHex } from './shared/ir';

export {
  createRenderProfileDimensions,
  isNormalizedSignedUnit,
  isNormalizedUnit,
  isPositiveDimension,
  isQuantizedNumber,
  isRenderProfile,
  quantizeNumber,
  toNormalizedSignedUnit,
  toNormalizedUnit,
  toPositiveDimension,
} from './shared/profile';

export { serializeSvg } from './svg/serializeSvg';
export type { SvgSerializationOptions } from './svg/serializeSvg';
export { serializeCss } from './web/serializeCss';
export type { CssSerializationOptions } from './web/serializeCss';
export { QUANTIZATION_SCALE, RENDER_PROFILE_VERSION } from './shared/profile';
export type {
  FitMode,
  NormalizedSignedUnit,
  NormalizedUnit,
  PositiveDimension,
  QuantizedNumber,
  RenderDimensions,
  RenderProfile,
  RenderProfileDimensions,
  RenderProfileVersion,
  RenderTargetShape,
  RenderUsage,
} from './shared/profile';
