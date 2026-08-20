/**
 * Product-owned validation contracts.
 *
 * The recipe boundary deliberately does not expose a validator's error type
 * (or its wording). Both schema and domain validation return this small, stable
 * shape so callers can render and recover from failures without depending on
 * a validation implementation.
 */
export type ValidationDiagnostic = {
  code: string;
  path: string;
  message: string;
  recovery: string;
  entityId?: string;
};

export type ValidationResult = { ok: true } | { ok: false; diagnostics: ValidationDiagnostic[] };

/** The serializable subset of a standalone validator error used by the adapter. */
export type SchemaValidationError = {
  instancePath?: unknown;
  keyword?: unknown;
  params?: unknown;
  schemaPath?: unknown;
};

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const stringParam = (params: unknown, key: string): string | undefined => {
  const value = asRecord(params)?.[key];
  return typeof value === 'string' ? value : undefined;
};

const pointerSegment = (value: string): string => value.replaceAll('~', '~0').replaceAll('/', '~1');

export const appendJsonPointer = (path: string, segment: string): string => {
  const escapedSegment = pointerSegment(segment);
  return path === '' || path === '/' ? `/${escapedSegment}` : `${path}/${escapedSegment}`;
};

const normalizePath = (instancePath: unknown): string =>
  typeof instancePath === 'string' && instancePath.length > 0 ? instancePath : '/';

const pathLooksLikeId = (path: string, schemaPath: string): boolean =>
  /(?:^|\/)(?:id|selectedComponentIds)(?:\/|$)/.test(path) ||
  /(?:Id|componentId|paletteId|anchorId)\/(?:pattern|type)$/.test(schemaPath);

const projectCode = (
  keyword: string,
  path: string,
  schemaPath: string,
  params: unknown,
): string => {
  if (keyword === 'required') return 'missing-property';
  if (keyword === 'additionalProperties') return 'unknown-property';
  if (keyword === 'const') {
    if (path === '/schemaVersion') return 'unsupported-version';
    if (path === '/provenance/generatorVersion') return 'unsupported-generator-version';
    if (path === '/provenance/rangesProfile') return 'unsupported-ranges-profile';
    return 'invalid-value';
  }
  if (keyword === 'enum') {
    if (path.endsWith('/blendMode')) return 'invalid-blend-mode';
    if (path.endsWith('/endCap')) return 'invalid-band-shape';
    return 'invalid-value';
  }
  if (keyword === 'pattern') {
    if (schemaPath.includes('canonicalColor') || path.endsWith('/hex')) return 'malformed-color';
    if (schemaPath.includes('sha256') || /(?:Hash|Digest)$/.test(path)) {
      return 'invalid-provenance-hash';
    }
    if (pathLooksLikeId(path, schemaPath)) return 'invalid-stable-id';
    return 'invalid-format';
  }
  if (keyword === 'type') {
    if (path === '/') return 'invalid-recipe';
    if (path.endsWith('/anchors')) return 'invalid-anchor-count';
    const expectedType = stringParam(params, 'type');
    if (expectedType === 'number' || expectedType === 'integer') return 'invalid-number';
    if (expectedType === 'boolean') return 'invalid-boolean';
    if (expectedType === 'array') return 'invalid-array';
    if (expectedType === 'object') return 'invalid-object';
    if (expectedType === 'string' && path.endsWith('/hex')) return 'malformed-color';
    if (
      expectedType === 'string' &&
      (schemaPath.includes('sha256') || /(?:Hash|Digest)$/.test(path))
    ) {
      return 'invalid-provenance-hash';
    }
    if (expectedType === 'string' && pathLooksLikeId(path, schemaPath)) {
      return 'invalid-stable-id';
    }
    return 'invalid-type';
  }
  if (
    keyword === 'minimum' ||
    keyword === 'maximum' ||
    keyword === 'exclusiveMinimum' ||
    keyword === 'exclusiveMaximum'
  ) {
    return path.includes('/anchors') && path.endsWith('/anchors')
      ? 'invalid-anchor-count'
      : 'out-of-range-number';
  }
  if (keyword === 'minItems' || keyword === 'maxItems') {
    return path.endsWith('/anchors') ? 'invalid-anchor-count' : 'invalid-array-length';
  }
  if (keyword === 'uniqueItems') {
    return path.includes('/selectedComponentIds') ? 'duplicate-provenance-target' : 'duplicate-id';
  }
  if (keyword === 'oneOf' || keyword === 'anyOf') return 'invalid-discriminant';
  return 'invalid-recipe-shape';
};

const recoveryFor = (code: string): string => {
  switch (code) {
    case 'unsupported-version':
      return 'Migrate the recipe to schema version 0.1.0.';
    case 'unknown-property':
      return 'Remove the unknown property or use a supported recipe version.';
    case 'missing-property':
      return 'Add the required property and try again.';
    case 'malformed-color':
      return 'Use an uppercase six-digit sRGB color such as #AABBCC.';
    case 'invalid-stable-id':
      return 'Use a lowercase prefixed 128-bit stable ID.';
    case 'out-of-range-number':
      return 'Use a value within the documented recipe range.';
    case 'invalid-anchor-count':
      return 'Provide between 10 and 64 ordered anchors.';
    case 'invalid-blend-mode':
      return 'Choose one of the supported blend modes.';
    case 'duplicate-id':
    case 'duplicate-provenance-target':
      return 'Give each durable identity a unique value.';
    case 'invalid-discriminant':
      return 'Use a supported component or color-source kind.';
    case 'parse-failure':
    case 'duplicate-property':
      return 'Fix the JSON object and try again.';
    case 'input-too-large':
      return 'Reduce the Recipe JSON to the supported input size.';
    default:
      return 'Correct the value and try again.';
  }
};

const messageFor = (code: string, path: string, error: SchemaValidationError): string => {
  const params = asRecord(error.params);
  const property = stringParam(error.params, 'additionalProperty');
  const missing = stringParam(error.params, 'missingProperty');
  if (code === 'unknown-property' && property !== undefined) {
    return `Unknown recipe property at ${path}.`;
  }
  if (code === 'missing-property' && missing !== undefined) {
    return `Recipe is missing required property at ${path}.`;
  }
  if (code === 'unsupported-version') return 'Recipe schemaVersion is not supported.';
  if (code === 'unsupported-generator-version') return 'Recipe generatorVersion is not supported.';
  if (code === 'unsupported-ranges-profile') return 'Recipe rangesProfile is not supported.';
  if (code === 'malformed-color') return `Color at ${path} is not canonical uppercase #RRGGBB.`;
  if (code === 'invalid-stable-id') return `Stable identity at ${path} is malformed.`;
  if (code === 'invalid-number') return `Expected a number at ${path}.`;
  if (code === 'invalid-boolean') return `Expected a boolean at ${path}.`;
  if (code === 'invalid-array') return `Expected an array at ${path}.`;
  if (code === 'invalid-object') return `Expected an object at ${path}.`;
  if (code === 'out-of-range-number') return `Number at ${path} is outside the supported range.`;
  if (code === 'invalid-anchor-count') return 'Field contours require 10-64 anchors.';
  if (code === 'invalid-blend-mode') return `Blend mode at ${path} is unsupported.`;
  if (code === 'duplicate-id' || code === 'duplicate-provenance-target') {
    return `Stable identity at ${path} is duplicated.`;
  }
  if (code === 'invalid-discriminant') return `Value at ${path} has an unsupported kind.`;
  if (code === 'invalid-recipe') return 'Recipe must be an object.';
  if (code === 'invalid-type') return `Value at ${path} has the wrong type.`;
  if (code === 'invalid-array-length') return `Array at ${path} has an unsupported length.`;
  if (code === 'invalid-value') return `Value at ${path} is unsupported.`;
  if (code === 'invalid-format' || code === 'invalid-provenance-hash') {
    return `Value at ${path} has an invalid format.`;
  }
  // Keep this fallback independent from the dependency's `message` field.
  void params;
  return `Recipe shape at ${path} is invalid.`;
};

/** Convert standalone-validator errors into deterministic product diagnostics. */
export function mapSchemaErrors(
  errors: readonly SchemaValidationError[] | null | undefined,
): ValidationDiagnostic[] {
  if (errors === undefined || errors === null || errors.length === 0) {
    return [
      {
        code: 'invalid-recipe-shape',
        path: '/',
        message: 'Recipe shape is invalid.',
        recovery: 'Correct the recipe structure and try again.',
      },
    ];
  }

  const diagnostics = errors.map((error) => {
    const instancePath = normalizePath(error.instancePath);
    const keyword = typeof error.keyword === 'string' ? error.keyword : 'unknown';
    const schemaPath = typeof error.schemaPath === 'string' ? error.schemaPath : '';
    const property = stringParam(error.params, 'additionalProperty');
    const missing = stringParam(error.params, 'missingProperty');
    const path =
      keyword === 'additionalProperties' && property !== undefined
        ? appendJsonPointer(instancePath, property)
        : keyword === 'required' && missing !== undefined
          ? appendJsonPointer(instancePath, missing)
          : instancePath;
    const code = projectCode(keyword, path, schemaPath, error.params);
    return { code, path, message: messageFor(code, path, error), recovery: recoveryFor(code) };
  });

  diagnostics.sort(
    (left, right) =>
      left.path.localeCompare(right.path, 'en', { sensitivity: 'variant' }) ||
      left.code.localeCompare(right.code, 'en', { sensitivity: 'variant' }) ||
      left.message.localeCompare(right.message, 'en', { sensitivity: 'variant' }),
  );
  return diagnostics;
}

export const parseFailureDiagnostic = (
  message = 'Recipe JSON could not be parsed.',
): ValidationDiagnostic => ({
  code: 'parse-failure',
  path: '/',
  message,
  recovery: 'Fix the JSON syntax and try again.',
});

export const duplicatePropertyDiagnostic = (path: string, key: string): ValidationDiagnostic => ({
  code: 'duplicate-property',
  path,
  message: `Duplicate JSON object property at ${path} (${JSON.stringify(key)}).`,
  recovery: 'Remove duplicate object properties and try again.',
});

export const inputTooLargeDiagnostic = (maxBytes: number): ValidationDiagnostic => ({
  code: 'input-too-large',
  path: '/',
  message: `Recipe JSON exceeds the ${maxBytes}-byte input limit.`,
  recovery: recoveryFor('input-too-large'),
});
