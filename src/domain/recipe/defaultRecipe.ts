import { stableIdFromBytes } from './ids';
import { normalizeRecipe } from './normalize';
import type {
  AnchorId,
  Band,
  ComponentAppearance,
  ComponentTransform,
  Field,
  ShapeAnchor,
  TextureRecipe,
} from './types';

function identityBytes(slot: number): Uint8Array {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, slot, false);
  return bytes;
}

function anchorId(slot: number): AnchorId {
  return stableIdFromBytes('anchor', identityBytes(slot));
}

function circularAnchors(count: number): ShapeAnchor[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    return {
      id: anchorId(index + 1),
      x: 0.5 + Math.cos(angle) * 0.38,
      y: 0.5 + Math.sin(angle) * 0.38,
      segmentToNext: { kind: 'line' },
    };
  });
}

const DEFAULT_TRANSFORM: ComponentTransform = {
  translation: { x: 0.5, y: 0.5 },
  baseSize: { width: 0.82, height: 0.64 },
  rotationDeg: -12,
  uniformScale: 1,
};

const DEFAULT_APPEARANCE: ComponentAppearance = {
  softness: 0.64,
  highlight: 0.28,
  grain: 0.08,
  asymmetry: 0.12,
  blendMode: 'screen',
};

function createDefaultField(): Field {
  return {
    id: stableIdFromBytes('component', identityBytes(1)),
    name: 'Primary field',
    type: 'field',
    transform: {
      ...DEFAULT_TRANSFORM,
      translation: { ...DEFAULT_TRANSFORM.translation },
      baseSize: { ...DEFAULT_TRANSFORM.baseSize },
    },
    appearance: { ...DEFAULT_APPEARANCE },
    colorSource: { kind: 'palette', paletteId: stableIdFromBytes('palette', identityBytes(1)) },
    locks: {
      identity: false,
      colorSource: false,
      geometry: false,
      translation: false,
      rotation: false,
      uniformScale: false,
      aspect: false,
      anchorCount: false,
    },
    contour: { anchors: circularAnchors(16) },
  };
}

function createDefaultBand(): Band {
  return {
    id: stableIdFromBytes('component', identityBytes(2)),
    name: 'Accent band',
    type: 'band',
    transform: {
      translation: { x: 0.55, y: 0.55 },
      baseSize: { width: 1.2, height: 0.18 },
      rotationDeg: 32,
      uniformScale: 1,
    },
    appearance: {
      softness: 0.48,
      highlight: 0.42,
      grain: 0.06,
      asymmetry: -0.15,
      blendMode: 'screen',
    },
    colorSource: {
      kind: 'local',
      value: { hex: '#FDA4AF', opacity: 0.74 },
    },
    locks: {
      identity: false,
      colorSource: false,
      geometry: false,
      translation: false,
      rotation: false,
      uniformScale: false,
      aspect: false,
    },
    band: { endCap: 'round', taper: 0.24 },
  };
}

/** Creates a detached, representative schema-valid startup recipe. */
export function createDefaultRecipe(): TextureRecipe {
  return normalizeRecipe({
    schemaVersion: '0.1.0',
    canvas: { width: 1200, height: 800, tileMode: false },
    base: {
      value: { hex: '#151A2D', opacity: 1 },
      locks: { color: false, opacity: false },
    },
    palette: [
      {
        id: stableIdFromBytes('palette', identityBytes(1)),
        label: 'Aurora blue',
        value: { hex: '#5B8CFF', opacity: 0.78 },
        locks: { identity: false, color: false, opacity: false },
      },
      {
        id: stableIdFromBytes('palette', identityBytes(2)),
        label: 'Violet haze',
        value: { hex: '#9D6CFF', opacity: 0.62 },
        locks: { identity: false, color: false, opacity: false },
      },
      {
        id: stableIdFromBytes('palette', identityBytes(3)),
        label: 'Warm flare',
        value: { hex: '#F3B35C', opacity: 0.52 },
        locks: { identity: false, color: false, opacity: false },
      },
    ],
    components: [createDefaultField(), createDefaultBand()],
    effects: { grain: 0.08, contrast: 0.14, softnessBias: 0.06 },
    shuffleLocks: { paletteCount: false, componentCount: false, effects: false },
  });
}

export const DEFAULT_RECIPE: Readonly<TextureRecipe> = createDefaultRecipe();
