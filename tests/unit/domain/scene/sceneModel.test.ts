import { describe, expect, it } from 'vitest';

import {
  createBlankSceneV03,
  isSceneV03Id,
  normalizeSceneV03,
  normalizeSceneV03Rotation,
  SCENE_V03_QUANTUM,
  sceneV03IdFromBytes,
} from '../../../../src/domain/scene/index.js';

describe('v0.3 scene model foundations', () => {
  it('creates a detached blank scene with a supported artboard and four palette colors', () => {
    const first = createBlankSceneV03();
    const second = createBlankSceneV03();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.schemaVersion).toBe('0.3.0');
    expect(first.artboard).toEqual({ ratio: '16:9', fitMode: 'cover' });
    expect(first.palette).toHaveLength(4);
    expect(first.palette.map((entry) => entry.color)).toEqual([
      '#5B8CFF',
      '#9D6CFF',
      '#F3B35C',
      '#22AA88',
    ]);
  });

  it('uses stable prefixed IDs for every v0.3 durable entity kind', () => {
    const bytes = new Uint8Array(16);
    bytes[15] = 7;

    for (const [kind, prefix] of [
      ['scene', 'scn'],
      ['palette', 'pal'],
      ['group', 'grp'],
      ['material', 'mat'],
    ] as const) {
      const id = sceneV03IdFromBytes(kind, bytes);
      expect(id).toMatch(new RegExp('^' + prefix + '_[0-9a-hjkmnp-tv-z]{26}$', 'u'));
      expect(isSceneV03Id(id, kind)).toBe(true);
    }

    expect(isSceneV03Id('cmp_00000000000000000000000000')).toBe(false);
  });

  it('normalizes finite scene numbers, rotations, colors, and nested geometry without mutation', () => {
    const source = createBlankSceneV03();
    source.background = '#aabbcc';
    source.palette[0]!.color = '#0011aa';
    const normalized = normalizeSceneV03(source);

    expect(normalized).not.toBe(source);
    expect(normalized.background).toBe('#AABBCC');
    expect(normalized.palette[0]!.color).toBe('#0011AA');
    expect(normalizeSceneV03Rotation(540 + SCENE_V03_QUANTUM / 3)).toBe(-180);
    expect(source.background).toBe('#aabbcc');
  });
});
