import { describe, expect, it } from 'vitest';

import { QUICK_COLOR_SWATCHES } from '../../../src/app/panels/colorSwatches';

describe('quick color swatches', () => {
  it('offers six distinct, canonical starter-derived colors', () => {
    expect(QUICK_COLOR_SWATCHES).toHaveLength(6);
    expect(new Set(QUICK_COLOR_SWATCHES.map((swatch) => swatch.hex)).size).toBe(6);
    expect(QUICK_COLOR_SWATCHES.map((swatch) => swatch.hex)).toEqual([
      '#101820',
      '#5B8CFF',
      '#FDA4AF',
      '#7DD3FC',
      '#FDE68A',
      '#22AA88',
    ]);
  });
});
