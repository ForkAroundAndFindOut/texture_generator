import type { CanonicalSceneColor } from '../scene/types';

export type SceneRgb = Readonly<{
  readonly r: number;
  readonly g: number;
  readonly b: number;
}>;

export type SceneColorParseResult =
  | { readonly kind: 'valid'; readonly color: CanonicalSceneColor; readonly rgb: SceneRgb }
  | { readonly kind: 'invalid'; readonly message: string };

const HEX_PATTERN = /^#?([0-9a-f]{6})$/iu;
const RGB_COMMA_PATTERN = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/u;
const RGB_SPACE_PATTERN = /^rgb\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*\)$/u;

function channel(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255 ? parsed : undefined;
}

export function rgbToSceneColor(rgb: SceneRgb): CanonicalSceneColor {
  const channels = [rgb.r, rgb.g, rgb.b];
  if (channels.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new RangeError('RGB channels must be integers from 0 through 255.');
  }
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function sceneColorToRgb(color: string): SceneRgb {
  const parsed = parseSceneColor(color);
  if (parsed.kind === 'invalid') throw new RangeError(parsed.message);
  return parsed.rgb;
}

export function parseSceneColor(value: string): SceneColorParseResult {
  const text = value.trim();
  const hex = HEX_PATTERN.exec(text);
  if (hex !== null) {
    const raw = hex[1]!;
    const rgb = {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
    } satisfies SceneRgb;
    return { kind: 'valid', color: rgbToSceneColor(rgb), rgb };
  }

  const rgbMatch = RGB_COMMA_PATTERN.exec(text) ?? RGB_SPACE_PATTERN.exec(text);
  if (rgbMatch !== null) {
    const values = rgbMatch.slice(1).map(channel);
    if (values.every((value): value is number => value !== undefined)) {
      const rgb = { r: values[0]!, g: values[1]!, b: values[2]! } satisfies SceneRgb;
      return { kind: 'valid', color: rgbToSceneColor(rgb), rgb };
    }
  }

  return {
    kind: 'invalid',
    message: 'Use #RRGGBB, RRGGBB, rgb(r,g,b), or rgb(r g b) with channels from 0 through 255.',
  };
}
