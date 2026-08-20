import {
  canonicalRecipeBytes,
  createDefaultRecipe,
  stableIdFromBytes,
  type AnchorId,
  type Component,
  type ComponentId,
  type TextureRecipe,
} from '../../domain';
import type { ComponentCommandContext } from '../../editor';

export type IdSequence = { value: number };

export type ShapePresetId = 'field-soft' | 'field-burst' | 'band-diagonal' | 'band-horizon';

export type ShapePreset = Readonly<{
  readonly id: ShapePresetId;
  readonly type: Component['type'];
  readonly label: string;
  readonly description: string;
}>;

export const SHAPE_PRESETS: readonly ShapePreset[] = [
  {
    id: 'field-soft',
    type: 'field',
    label: 'Soft Field',
    description: 'A broad, soft radial color field.',
  },
  {
    id: 'field-burst',
    type: 'field',
    label: 'Burst Field',
    description: 'A compact, organic focal field.',
  },
  {
    id: 'band-diagonal',
    type: 'band',
    label: 'Diagonal Band',
    description: 'A sweeping diagonal color band.',
  },
  {
    id: 'band-horizon',
    type: 'band',
    label: 'Horizon Band',
    description: 'A broad horizontal atmospheric band.',
  },
];

function nextBytes(sequence: IdSequence): Uint8Array {
  const bytes = new Uint8Array(16);
  new DataView(bytes.buffer).setUint32(12, sequence.value++, false);
  return bytes;
}

export function createComponentCommandContext(sequence: IdSequence): ComponentCommandContext {
  return {
    canonicalize: canonicalRecipeBytes,
    createComponentId: () => stableIdFromBytes('component', nextBytes(sequence)),
    createAnchorId: () => stableIdFromBytes('anchor', nextBytes(sequence)),
  };
}

function sourceTemplate(recipe: TextureRecipe, type: Component['type']): Component {
  const existing = recipe.components.find((component) => component.type === type);
  if (existing !== undefined) return structuredClone(existing);

  const fallback = createDefaultRecipe().components.find((component) => component.type === type);
  if (fallback === undefined) throw new Error(`The default recipe has no ${type} template.`);
  return structuredClone(fallback);
}

/** Creates a detached prebuilt shape with fresh Field anchor identities. */
export function createComponentTemplate(
  recipe: TextureRecipe,
  type: Component['type'],
  sequence: IdSequence,
  presetId?: ShapePresetId,
): Component {
  const component = sourceTemplate(recipe, type);
  const count = recipe.components.filter((entry) => entry.type === type).length;
  const preset = SHAPE_PRESETS.find(
    (candidate) => candidate.id === presetId && candidate.type === type,
  );
  component.name = `${preset?.label ?? (type === 'field' ? 'Field' : 'Band')} ${count + 1}`;

  if (preset?.id === 'field-soft' && component.type === 'field') {
    component.transform = {
      translation: { x: 0.5, y: 0.48 },
      baseSize: { width: 0.9, height: 0.72 },
      rotationDeg: -8,
      uniformScale: 1,
    };
    component.appearance = {
      ...component.appearance,
      softness: 0.72,
      highlight: 0.34,
      grain: 0.05,
      blendMode: 'screen',
    };
  }

  if (preset?.id === 'field-burst' && component.type === 'field') {
    component.transform = {
      translation: { x: 0.32, y: 0.34 },
      baseSize: { width: 0.58, height: 0.56 },
      rotationDeg: 18,
      uniformScale: 1,
    };
    component.appearance = {
      ...component.appearance,
      softness: 0.35,
      highlight: 0.66,
      grain: 0.11,
      blendMode: 'screen',
    };
    component.contour.anchors = component.contour.anchors.map((anchor, index) => {
      const factor = index % 2 === 0 ? 1.1 : 0.77;
      return {
        ...anchor,
        x: Math.min(0.96, Math.max(0.04, 0.5 + (anchor.x - 0.5) * factor)),
        y: Math.min(0.96, Math.max(0.04, 0.5 + (anchor.y - 0.5) * factor)),
      };
    });
  }

  if (preset?.id === 'band-diagonal' && component.type === 'band') {
    component.transform = {
      translation: { x: 0.58, y: 0.58 },
      baseSize: { width: 1.28, height: 0.2 },
      rotationDeg: 28,
      uniformScale: 1,
    };
    component.appearance = {
      ...component.appearance,
      softness: 0.48,
      highlight: 0.42,
      grain: 0.07,
      blendMode: 'screen',
    };
    component.band = { endCap: 'round', taper: 0.3 };
  }

  if (preset?.id === 'band-horizon' && component.type === 'band') {
    component.transform = {
      translation: { x: 0.55, y: 0.38 },
      baseSize: { width: 1.34, height: 0.24 },
      rotationDeg: -6,
      uniformScale: 1,
    };
    component.appearance = {
      ...component.appearance,
      softness: 0.62,
      highlight: 0.38,
      grain: 0.06,
      blendMode: 'screen',
    };
    component.band = { endCap: 'flat', taper: 0.05 };
  }

  if (component.type === 'field') {
    component.contour.anchors = component.contour.anchors.map((anchor) => ({
      ...anchor,
      id: stableIdFromBytes('anchor', nextBytes(sequence)) as AnchorId,
    }));
  }

  return component;
}

export function rememberCreatedId(
  context: ComponentCommandContext,
  receiver: (id: ComponentId) => void,
): ComponentCommandContext {
  return {
    ...context,
    createComponentId: () => {
      const id = context.createComponentId();
      receiver(id);
      return id;
    },
  };
}
