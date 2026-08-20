import type Type from 'typebox';

import type {
  AnchorIdSchema,
  AppliedShuffleScopeSchema,
  BandComponentLocksSchema,
  BandSchema,
  BandShapeSchema,
  BaseLayerSchema,
  BaseLocksSchema,
  BlendModeSchema,
  CanvasSchema,
  CanonicalColorSchema,
  ColorValueSchema,
  ComponentAppearanceSchema,
  ComponentColorSourceSchema,
  ComponentIdSchema,
  ComponentSchema,
  ComponentTransformSchema,
  CubicSegmentSchema,
  FieldComponentLocksSchema,
  FieldContourSchema,
  FieldSchema,
  GeneratorProvenanceSchema,
  GlobalEffectsSchema,
  GlobalShuffleLocksSchema,
  HandleOffsetSchema,
  LineSegmentSchema,
  LocalColorSourceSchema,
  PaletteColorSourceSchema,
  PaletteEntrySchema,
  PaletteIdSchema,
  PaletteLocksSchema,
  PointSchema,
  RecipeTypeContext,
  SegmentBendSchema,
  Sha256Schema,
  ShapeAnchorSchema,
  SizeSchema,
  TextureRecipeSchema,
} from './schema';

type Static<Schema extends Type.TSchema> = Type.Static<Schema, RecipeTypeContext>;

export type PaletteId = Static<typeof PaletteIdSchema>;
export type ComponentId = Static<typeof ComponentIdSchema>;
export type AnchorId = Static<typeof AnchorIdSchema>;
export type CanonicalColor = Static<typeof CanonicalColorSchema>;
export type Sha256Hex = Static<typeof Sha256Schema>;
export type ColorValue = Static<typeof ColorValueSchema>;
export type BaseLocks = Static<typeof BaseLocksSchema>;
export type BaseLayer = Static<typeof BaseLayerSchema>;
export type Canvas = Static<typeof CanvasSchema>;
export type PaletteLocks = Static<typeof PaletteLocksSchema>;
export type PaletteEntry = Static<typeof PaletteEntrySchema>;
export type Point = Static<typeof PointSchema>;
export type Size = Static<typeof SizeSchema>;
export type ComponentTransform = Static<typeof ComponentTransformSchema>;
export type BlendMode = Static<typeof BlendModeSchema>;
export type ComponentAppearance = Static<typeof ComponentAppearanceSchema>;
export type PaletteColorSource = Static<typeof PaletteColorSourceSchema>;
export type LocalColorSource = Static<typeof LocalColorSourceSchema>;
export type ComponentColorSource = Static<typeof ComponentColorSourceSchema>;
export type BandComponentLocks = Static<typeof BandComponentLocksSchema>;
export type FieldComponentLocks = Static<typeof FieldComponentLocksSchema>;
export type LineSegment = Static<typeof LineSegmentSchema>;
export type HandleOffset = Static<typeof HandleOffsetSchema>;
export type CubicSegment = Static<typeof CubicSegmentSchema>;
export type SegmentBend = Static<typeof SegmentBendSchema>;
export type ShapeAnchor = Static<typeof ShapeAnchorSchema>;
export type FieldContour = Static<typeof FieldContourSchema>;
export type Field = Static<typeof FieldSchema>;
export type BandShape = Static<typeof BandShapeSchema>;
export type Band = Static<typeof BandSchema>;
export type Component = Static<typeof ComponentSchema>;
export type GlobalEffects = Static<typeof GlobalEffectsSchema>;
export type GlobalShuffleLocks = Static<typeof GlobalShuffleLocksSchema>;
export type AppliedShuffleScope = Static<typeof AppliedShuffleScopeSchema>;
export type GeneratorProvenance = Static<typeof GeneratorProvenanceSchema>;
export type TextureRecipe = Static<typeof TextureRecipeSchema>;

export type RecipeSchemaVersion = TextureRecipe['schemaVersion'];
export type GeneratorOperation = GeneratorProvenance['operation'];

type Assert<T extends true> = T;
type Extends<Left, Right> = [Left] extends [Right] ? true : false;

// Compile-time proof that the exported root is exactly the canonical schema static.
type _TextureRecipeSchemaEquality = Assert<
  Extends<TextureRecipe, Type.Static<typeof TextureRecipeSchema, RecipeTypeContext>> &
    Extends<Type.Static<typeof TextureRecipeSchema, RecipeTypeContext>, TextureRecipe>
>;
