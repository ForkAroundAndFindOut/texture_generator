import type { GrainKind, InteractionMode } from '../../domain/scene';
import type { CanonicalHex, MatrixIR, PathIR } from './ir';
import type { NormalizedUnit } from './profile';
import type { SceneRenderProfile, SceneViewBoxIR } from './sceneProfile';

export type SceneSvgBlendMode =
  'normal' | 'screen' | 'multiply' | 'soft-light' | 'luminosity' | 'color';

export const INTERACTION_BLEND_MODE: Readonly<Record<InteractionMode, SceneSvgBlendMode>> = {
  paint: 'normal',
  glow: 'screen',
  shade: 'multiply',
  texture: 'soft-light',
  'keep-base-hue': 'luminosity',
  colorize: 'color',
};

export interface SceneArtboardIR {
  readonly profile: SceneRenderProfile;
  readonly viewBox: SceneViewBoxIR;
  readonly preserveAspectRatio: 'xMidYMid meet' | 'xMidYMid slice';
}

export interface SceneGrainIR {
  readonly kind: GrainKind;
  readonly amount: NormalizedUnit;
  readonly scale: NormalizedUnit;
  readonly seed: number;
}

export interface SceneMaterialRenderIR {
  readonly kind: 'material';
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly groupIds: readonly string[];
  readonly path: PathIR;
  readonly color: CanonicalHex;
  readonly fillKind: 'palette' | 'local';
  readonly paletteId?: string;
  readonly opacity: NormalizedUnit;
  readonly edgeFeather: NormalizedUnit;
  readonly bloom: NormalizedUnit;
  readonly interaction: InteractionMode;
  readonly blendMode: SceneSvgBlendMode;
  readonly grain?: SceneGrainIR;
  readonly definitionId: string;
}

export interface SceneRenderGroupIR {
  readonly kind: 'group';
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly matrix: MatrixIR;
  readonly children: readonly SceneRenderNodeIR[];
}

export type SceneRenderNodeIR = SceneRenderGroupIR | SceneMaterialRenderIR;

/**
 * One immutable scene output shared by preview and exports. rootGroups and
 * children retain author order; materials is the matching flattened back-to-
 * front draw list for adapters that do not need hierarchy.
 */
export interface SceneRenderIR {
  readonly kind: 'scene-render-ir';
  readonly version: 'scene-render-ir-v0.3';
  readonly sceneId: string;
  readonly artboard: SceneArtboardIR;
  readonly background: CanonicalHex;
  readonly rootGroups: readonly SceneRenderGroupIR[];
  readonly materials: readonly SceneMaterialRenderIR[];
}

export const SCENE_RENDER_IR_VERSION = 'scene-render-ir-v0.3' as const;
