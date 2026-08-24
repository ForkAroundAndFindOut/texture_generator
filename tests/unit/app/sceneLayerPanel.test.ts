import { describe, expect, it } from 'vitest';

import type { SceneGroup } from '../../../src/domain/index.js';
import { canonicalIndexForSceneLayerDrop } from '../../../src/app/panels/SceneLayerPanel.js';

const groups = ['back', 'middle', 'front'].map((id) => ({ id }) as SceneGroup);

describe('scene layer displayed-to-canonical reorder mapping', () => {
  it('moves a frontmost layer to the back when dropped after the back row', () => {
    expect(canonicalIndexForSceneLayerDrop(groups, 'front', 'back', 'after')).toBe(0);
  });

  it('moves a back layer to the front when dropped before the front row', () => {
    expect(canonicalIndexForSceneLayerDrop(groups, 'back', 'front', 'before')).toBe(2);
  });

  it('preserves no-op and unknown drops', () => {
    expect(canonicalIndexForSceneLayerDrop(groups, 'middle', 'middle', 'before')).toBeUndefined();
    expect(canonicalIndexForSceneLayerDrop(groups, 'missing', 'front', 'before')).toBeUndefined();
  });
});
