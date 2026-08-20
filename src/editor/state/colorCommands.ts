import {
  normalizeRecipe,
  resolveComponentColor,
  validateRecipeDomain,
  validateRecipeShape,
  type ComponentId,
  type TextureRecipe,
} from '../../domain';
import {
  cloneCanonicalBytes,
  cloneRecipe,
  type CandidateResult,
  type DesignCommand,
} from './commands';

export type ColorPatch = { readonly hex?: string; readonly opacity?: number };
export type ColorCommandContext = {
  readonly canonicalize: (recipe: TextureRecipe) => Uint8Array;
};
export type ColorCommandDiagnostic = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

const failure = (
  code: string,
  path: string,
  message: string,
): CandidateResult<TextureRecipe, ColorCommandDiagnostic> => ({
  kind: 'failure',
  diagnostics: [{ code, path, message }],
});

function checkedPatch(
  patch: ColorPatch,
  path: string,
): { readonly hex?: string; readonly opacity?: number } | ColorCommandDiagnostic {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { code: 'invalid-color-patch', path, message: 'Color patch must be an object.' };
  }
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some((key) => key !== 'hex' && key !== 'opacity')) {
    return { code: 'invalid-color-patch', path, message: 'Change hex, opacity, or both.' };
  }

  const result: { hex?: string; opacity?: number } = {};
  if (patch.hex !== undefined) {
    const hex = patch.hex.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(hex)) {
      return { code: 'invalid-color', path: `${path}/hex`, message: 'Use a six-digit hex color.' };
    }
    result.hex = hex;
  }
  if (patch.opacity !== undefined) {
    if (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1) {
      return {
        code: 'invalid-opacity',
        path: `${path}/opacity`,
        message: 'Opacity must be between 0 and 1.',
      };
    }
    result.opacity = patch.opacity;
  }
  return result;
}

function finalize(
  candidate: TextureRecipe,
  context: ColorCommandContext,
  summary: string,
): CandidateResult<TextureRecipe, ColorCommandDiagnostic> {
  try {
    const detached = cloneRecipe(candidate);
    const normalized = normalizeRecipe(cloneRecipe(detached));
    const shape = validateRecipeShape(normalized);
    if (!shape.ok) return { kind: 'failure', diagnostics: shape.diagnostics };
    const domain = validateRecipeDomain(normalized);
    if (!domain.ok) return { kind: 'failure', diagnostics: domain.diagnostics };
    return {
      kind: 'success',
      candidate: detached,
      canonicalBytes: cloneCanonicalBytes(context.canonicalize(normalized)),
      summary,
    };
  } catch {
    return failure('invalid-color-candidate', '/', 'The color edit could not be validated.');
  }
}

export function updateComponentColorCommand(
  componentId: ComponentId,
  patch: ColorPatch,
  context: ColorCommandContext,
): DesignCommand<TextureRecipe, ColorCommandDiagnostic> {
  return {
    kind: 'component-color',
    summary: 'Update component color',
    prepare: (current) => {
      const checked = checkedPatch(patch, '/components/colorSource/value');
      if ('code' in checked) return { kind: 'failure', diagnostics: [checked] };
      const candidate = cloneRecipe(current);
      const component = candidate.components.find((entry) => entry.id === componentId);
      if (component === undefined) {
        return failure('unknown-component-target', '/components', 'Select an existing component.');
      }
      const currentColor = resolveComponentColor(candidate, component).value;
      component.colorSource = {
        kind: 'local',
        value: {
          hex: checked.hex ?? currentColor.hex,
          opacity: checked.opacity ?? currentColor.opacity,
        },
      };
      return finalize(candidate, context, 'Update component color');
    },
  };
}

export function updateBaseColorCommand(
  patch: ColorPatch,
  context: ColorCommandContext,
): DesignCommand<TextureRecipe, ColorCommandDiagnostic> {
  return {
    kind: 'base-color',
    summary: 'Update canvas color',
    prepare: (current) => {
      const checked = checkedPatch(patch, '/base/value');
      if ('code' in checked) return { kind: 'failure', diagnostics: [checked] };
      const candidate = cloneRecipe(current);
      candidate.base.value = {
        hex: checked.hex ?? candidate.base.value.hex,
        opacity: checked.opacity ?? candidate.base.value.opacity,
      };
      return finalize(candidate, context, 'Update canvas color');
    },
  };
}
