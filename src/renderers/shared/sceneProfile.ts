import {
  ARTBOARD_FIT_MODES,
  ARTBOARD_RATIOS,
  type Artboard,
  type ArtboardFitMode,
  type ArtboardRatio,
} from '../../domain/scene';
import { quantizeNumber, type QuantizedNumber } from './profile';

export const SCENE_WORLD_SIZE = 900;

export interface SceneViewBoxIR {
  readonly minX: QuantizedNumber;
  readonly minY: QuantizedNumber;
  readonly width: QuantizedNumber;
  readonly height: QuantizedNumber;
}

export interface SceneRenderProfile {
  readonly kind: 'scene-render-profile';
  readonly ratio: ArtboardRatio;
  readonly fitMode: ArtboardFitMode;
}

const VIEWBOX_DIMENSIONS: Record<ArtboardRatio, Readonly<{ width: number; height: number }>> = {
  '1:1': { width: 900, height: 900 },
  '2:1': { width: 1800, height: 900 },
  '1:2': { width: 900, height: 1800 },
  '4:3': { width: 1200, height: 900 },
  '16:9': { width: 1600, height: 900 },
  '21:9': { width: 2100, height: 900 },
};

export function artboardViewBoxForRatio(ratio: ArtboardRatio): SceneViewBoxIR {
  const dimensions = VIEWBOX_DIMENSIONS[ratio];
  return {
    minX: quantizeNumber((SCENE_WORLD_SIZE - dimensions.width) / 2),
    minY: quantizeNumber((SCENE_WORLD_SIZE - dimensions.height) / 2),
    width: quantizeNumber(dimensions.width),
    height: quantizeNumber(dimensions.height),
  };
}

export function preserveAspectRatioForFitMode(
  fitMode: ArtboardFitMode,
): 'xMidYMid meet' | 'xMidYMid slice' {
  return fitMode === 'fit' ? 'xMidYMid meet' : 'xMidYMid slice';
}

export function sceneRenderProfileForArtboard(artboard: Artboard): SceneRenderProfile {
  return { kind: 'scene-render-profile', ratio: artboard.ratio, fitMode: artboard.fitMode };
}

export function isSceneRenderProfile(value: unknown): value is SceneRenderProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (
    profile['kind'] === 'scene-render-profile' &&
    typeof profile['ratio'] === 'string' &&
    ARTBOARD_RATIOS.includes(profile['ratio'] as '1:1') &&
    typeof profile['fitMode'] === 'string' &&
    ARTBOARD_FIT_MODES.includes(profile['fitMode'] as 'fit')
  );
}
