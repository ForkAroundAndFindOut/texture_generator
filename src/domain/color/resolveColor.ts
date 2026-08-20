import type { ColorValue, Component, TextureRecipe } from '../recipe/types';

export type ResolvedComponentColor = {
  readonly value: ColorValue;
  readonly source: 'local' | 'palette';
  readonly paletteLabel?: string;
};

/** Resolve the visible component color without mutating recipe or component state. */
export function resolveComponentColor(
  recipe: TextureRecipe,
  component: Component,
): ResolvedComponentColor {
  if (component.colorSource.kind === 'local') {
    return { value: { ...component.colorSource.value }, source: 'local' };
  }

  const paletteId = Object.getOwnPropertyDescriptor(component.colorSource, 'paletteId')?.value;
  if (typeof paletteId !== 'string') {
    throw new RangeError(`Component ${component.id} has an invalid palette color source.`);
  }
  const palette = recipe.palette.find((entry) => entry.id === paletteId);
  if (palette === undefined) {
    throw new RangeError(`Component ${component.id} references a missing palette entry.`);
  }
  return {
    value: { ...palette.value },
    source: 'palette',
    paletteLabel: palette.label,
  };
}
