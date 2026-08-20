import { describe, expect, it } from 'vitest';

import {
  artboardViewBoxForRatio,
  INTERACTION_BLEND_MODE,
  preserveAspectRatioForFitMode,
  sceneRenderProfileForArtboard,
} from '../../../src/renderers/index.js';

describe('v0.3 scene renderer profile', () => {
  it('uses ratio-correct viewBoxes centered on the persistent normalized scene world', () => {
    expect(artboardViewBoxForRatio('1:1')).toEqual({
      minX: 0,
      minY: 0,
      width: 900,
      height: 900,
    });
    expect(artboardViewBoxForRatio('16:9')).toEqual({
      minX: -350,
      minY: 0,
      width: 1600,
      height: 900,
    });
    expect(artboardViewBoxForRatio('1:2')).toEqual({
      minX: 0,
      minY: -450,
      width: 900,
      height: 1800,
    });
  });

  it('maps only approved Fit and Cover semantics to SVG behavior', () => {
    expect(preserveAspectRatioForFitMode('fit')).toBe('xMidYMid meet');
    expect(preserveAspectRatioForFitMode('cover')).toBe('xMidYMid slice');
    expect(sceneRenderProfileForArtboard({ ratio: '21:9', fitMode: 'cover' })).toEqual({
      kind: 'scene-render-profile',
      ratio: '21:9',
      fitMode: 'cover',
    });
  });

  it('uses the artist-facing Interaction modes as the one standards mapping', () => {
    expect(INTERACTION_BLEND_MODE).toEqual({
      paint: 'normal',
      glow: 'screen',
      shade: 'multiply',
      texture: 'soft-light',
      'keep-base-hue': 'luminosity',
      colorize: 'color',
    });
  });
});
