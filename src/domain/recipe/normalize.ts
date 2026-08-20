import type { ComponentId, TextureRecipe } from './types';

export const RECIPE_QUANTUM = 1e-6;

export function quantizeRecipeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Recipe numbers must be finite');
  }

  const quantized = Math.round(value / RECIPE_QUANTUM) * RECIPE_QUANTUM;
  return Object.is(quantized, -0) ? 0 : quantized;
}

export function normalizeRotationDegrees(value: number): number {
  const quantized = quantizeRecipeNumber(value);
  const normalized = ((((quantized + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : quantizeRecipeNumber(normalized);
}

function normalizeJsonValue(value: unknown, key?: string): unknown {
  if (typeof value === 'number') {
    return key === 'rotationDeg' ? normalizeRotationDegrees(value) : quantizeRecipeNumber(value);
  }
  if (typeof value === 'string') {
    return key === 'hex' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : value;
  }
  if (typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (typeof value === 'object' && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      normalized[childKey] = normalizeJsonValue(childValue, childKey);
    }
    return normalized;
  }
  throw new TypeError(`Recipe contains a non-JSON value of type ${typeof value}`);
}

function orderSelectedIds(recipe: TextureRecipe): void {
  if (recipe.provenance === undefined) return;

  const selected = new Set<ComponentId>(recipe.provenance.selectedComponentIds);
  recipe.provenance.selectedComponentIds = recipe.components
    .map((component) => component.id)
    .filter((id) => selected.has(id));
}

/** Returns a detached, idempotently normalized recipe while preserving semantic array order. */
export function normalizeRecipe(value: TextureRecipe): TextureRecipe {
  const normalized = normalizeJsonValue(value) as TextureRecipe;
  orderSelectedIds(normalized);
  return normalized;
}
