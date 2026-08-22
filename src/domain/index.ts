/**
 * Public framework-independent domain boundary.
 *
 * Domain exports must remain pure and browser/runtime safe. In particular,
 * this barrel must not import React, DOM/storage adapters, or TypeBox/Ajv
 * compiler tooling. Runtime exports below are limited to pure recipe and
 * geometry helpers; schema definitions remain private to schema/validation
 * implementation code.
 */

export type {
  AnchorId,
  Band,
  BandComponentLocks,
  BandShape,
  BaseLayer,
  BaseLocks,
  BlendMode,
  CanonicalColor,
  Canvas,
  ColorValue,
  Component,
  ComponentAppearance,
  ComponentColorSource,
  ComponentId,
  ComponentTransform,
  CubicSegment,
  Field,
  FieldComponentLocks,
  FieldContour,
  GlobalEffects,
  HandleOffset,
  LineSegment,
  LocalColorSource,
  PaletteColorSource,
  PaletteEntry,
  PaletteId,
  PaletteLocks,
  Point,
  RecipeSchemaVersion,
  SegmentBend,
  Sha256Hex,
  ShapeAnchor,
  Size,
  TextureRecipe,
} from './recipe/types';

export {
  canonicalRecipeBytes,
  canonicalRecipeFileBytes,
  canonicalRecipeString,
} from './recipe/canonicalSerialize';

export { DEFAULT_RECIPE, createDefaultRecipe } from './recipe/defaultRecipe';

export { parseSceneColor, rgbToSceneColor, sceneColorToRgb } from './color/sceneColor';
export type { SceneColorParseResult, SceneRgb } from './color/sceneColor';

export type { Sha256Port } from './recipe/hash';
export { hashRecipe, hashRecipeSync, sha256Hex, sha256HexSync } from './recipe/hash';

export type {
  DeterministicIdPort,
  ManualIdCryptoPort,
  ParsedStableId,
  StableId,
  StableIdKind,
} from './recipe/ids';
export {
  createDeterministicId,
  createManualId,
  isStableId,
  parseAnchorId,
  parseComponentId,
  parsePaletteId,
  parseStableId,
  stableIdFromBytes,
} from './recipe/ids';

export {
  normalizeRecipe,
  normalizeRotationDegrees,
  quantizeRecipeNumber,
  RECIPE_QUANTUM,
} from './recipe/normalize';

export type {
  SchemaValidationError,
  ValidationDiagnostic,
  ValidationResult,
} from './recipe/diagnostics';
export { mapSchemaErrors } from './recipe/diagnostics';

export type { ParsedJsonResult } from './recipe/schemaValidator';
export {
  MAX_RECIPE_JSON_BYTES,
  parseRecipeText,
  validateRecipeShape,
} from './recipe/schemaValidator';

export { validateRecipeDomain } from './recipe/domainValidator';

export { resolveComponentColor } from './color/resolveColor';
export type { ResolvedComponentColor } from './color/resolveColor';

/**
 * Pure geometry compilers are part of the domain boundary so renderers can
 * consume one canonical geometry model without importing domain internals.
 * These modules contain no renderer, framework, or schema-compiler imports.
 */
export type { BandFactoryOptions, BandFactoryOverrides } from './geometry/band';
export { compileBandGeometry, createBand } from './geometry/band';
export {
  assertValidBoundary,
  BoundaryValidationError,
  signedBoundaryArea,
  validateBoundary,
} from './geometry/boundary';
export type { BoundaryValidationIssue, BoundaryValidationResult } from './geometry/boundary';
export type { DefaultFieldFactoryOptions } from './geometry/defaultField';
export { compileFieldGeometry, createDefaultField } from './geometry/defaultField';
export {
  createBlobBoundary,
  createCircleBoundary,
  createEllipseBoundary,
  createPolygonBoundary,
  createPrimitiveBoundary,
  createRibbonBoundary,
  createRoundedRectangleBoundary,
  createSilhouetteBoundary,
  createSolidStarBoundary,
  createTriangleBoundary,
  PRIMITIVE_KINDS,
} from './geometry/primitives';
export type {
  BlobBoundaryOptions,
  EllipseBoundaryOptions,
  PolygonBoundaryOptions,
  PrimitiveKind,
  RibbonBoundaryOptions,
  RoundedRectangleBoundaryOptions,
  SilhouetteBoundaryOptions,
  SilhouetteKind,
  StarBoundaryOptions,
} from './geometry/primitives';

export {
  ARTBOARD_FIT_MODES,
  ARTBOARD_RATIOS,
  assertSceneV03,
  canonicalSceneV03Bytes,
  canonicalSceneV03FileBytes,
  canonicalSceneV03String,
  createBlankSceneV03,
  createSceneV03Id,
  DEFAULT_BLANK_SCENE_V03,
  GRAIN_KINDS,
  INTERACTION_MODES,
  isSceneV03,
  isSceneV03Id,
  normalizeSceneV03,
  normalizeSceneV03Rotation,
  quantizeSceneV03Number,
  SCENE_V03_QUANTUM,
  SCENE_V03_SCHEMA_VERSION,
  sceneV03IdFromBytes,
  SceneV03ValidationError,
  validateSceneV03,
} from './scene';
export type {
  Artboard,
  ArtboardFitMode,
  ArtboardRatio,
  Boundary,
  BoundaryGeometry,
  CanonicalSceneColor,
  GrainKind,
  GrainStyle,
  GroupId,
  GroupTransform,
  InteractionMode,
  LocalFill,
  MaterialFill,
  MaterialId,
  PaletteEntryId,
  PaletteFill,
  SceneGroup,
  SceneMaterial,
  SceneNode,
  ScenePaletteEntry,
  ScenePoint,
  SceneV03,
  SceneV03Id,
  SceneV03IdCryptoPort,
  SceneV03IdKind,
  SceneV03ValidationDiagnostic,
  SceneV03ValidationResult,
} from './scene';
