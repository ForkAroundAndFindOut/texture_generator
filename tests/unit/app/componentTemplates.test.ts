import { describe, expect, test } from 'vitest';

import { createDefaultRecipe } from '../../../src/domain';
import {
  createComponentTemplate,
  SHAPE_PRESETS,
  type IdSequence,
} from '../../../src/app/session/componentTemplates';

describe('v0.2 visual shape presets', () => {
  test('creates a distinct, detached template for each visible preset', () => {
    const recipe = createDefaultRecipe();
    const sequence: IdSequence = { value: 500 };
    const templates = SHAPE_PRESETS.map((preset) =>
      createComponentTemplate(recipe, preset.type, sequence, preset.id),
    );

    expect(templates.map((template) => template.name)).toEqual([
      'Soft Field 2',
      'Burst Field 2',
      'Diagonal Band 2',
      'Horizon Band 2',
    ]);
    expect(templates[0]?.type).toBe('field');
    expect(templates[1]?.type).toBe('field');
    expect(templates[2]?.type).toBe('band');
    expect(templates[3]?.type).toBe('band');

    const soft = templates[0];
    const burst = templates[1];
    const diagonal = templates[2];
    const horizon = templates[3];
    if (
      soft?.type !== 'field' ||
      burst?.type !== 'field' ||
      diagonal?.type !== 'band' ||
      horizon?.type !== 'band'
    ) {
      throw new Error('preset types do not match their definitions');
    }

    expect(soft.transform).not.toEqual(burst.transform);
    expect(soft.contour.anchors.map((anchor) => anchor.id)).not.toEqual(
      burst.contour.anchors.map((anchor) => anchor.id),
    );
    expect(diagonal.transform).not.toEqual(horizon.transform);
    expect(diagonal.band).not.toEqual(horizon.band);
    expect(recipe.components[0]?.name).toBe('Primary field');
  });
});
