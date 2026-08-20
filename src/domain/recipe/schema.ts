import Type from 'typebox';

const closedObject = { additionalProperties: false } as const;

type RecipeDefinitionName =
  | 'canvas'
  | 'baseLayer'
  | 'paletteEntry'
  | 'globalEffects'
  | 'globalShuffleLocks'
  | 'generatorProvenance';

const ref = <Name extends RecipeDefinitionName>(name: Name) =>
  Type.Ref(`#/$defs/${name}` as `#/$defs/${Name}`);

const oneOf = <StaticType>(schemas: readonly unknown[]) =>
  Type.Unsafe<StaticType>({ oneOf: schemas });

const literal = <const Value extends string>(value: Value) => Type.Unsafe<Value>({ const: value });

export const NormalizedUnitSchema = Type.Number({ minimum: 0, maximum: 1 });
export const NormalizedSignedUnitSchema = Type.Number({ minimum: -1, maximum: 1 });
export const CanonicalColorSchema = Type.String({ pattern: '^#[0-9A-F]{6}$' });
export const PaletteIdSchema = Type.String({ pattern: '^pal_[0-9a-hjkmnp-tv-z]{26}$' });
export const ComponentIdSchema = Type.String({ pattern: '^cmp_[0-9a-hjkmnp-tv-z]{26}$' });
export const AnchorIdSchema = Type.String({ pattern: '^anc_[0-9a-hjkmnp-tv-z]{26}$' });
export const Sha256Schema = Type.String({ pattern: '^[0-9a-f]{64}$' });

export const ColorValueSchema = Type.Object(
  {
    hex: Type.Ref('#/$defs/canonicalColor'),
    opacity: Type.Ref('#/$defs/normalizedUnit'),
  },
  closedObject,
);

export const BaseLocksSchema = Type.Object(
  { color: Type.Boolean(), opacity: Type.Boolean() },
  closedObject,
);

export const BaseLayerSchema = Type.Object(
  { value: Type.Ref('#/$defs/colorValue'), locks: Type.Ref('#/$defs/baseLocks') },
  closedObject,
);

export const CanvasSchema = Type.Object(
  {
    width: Type.Integer({ minimum: 16, maximum: 8192 }),
    height: Type.Integer({ minimum: 16, maximum: 8192 }),
    tileMode: Type.Boolean(),
  },
  closedObject,
);

export const PaletteLocksSchema = Type.Object(
  { identity: Type.Boolean(), color: Type.Boolean(), opacity: Type.Boolean() },
  closedObject,
);

export const PaletteEntrySchema = Type.Object(
  {
    id: Type.Ref('#/$defs/paletteId'),
    label: Type.String({ minLength: 1, maxLength: 80 }),
    value: Type.Ref('#/$defs/colorValue'),
    locks: Type.Ref('#/$defs/paletteLocks'),
  },
  closedObject,
);

export const PointSchema = Type.Object(
  {
    x: Type.Number({ minimum: -2, maximum: 3 }),
    y: Type.Number({ minimum: -2, maximum: 3 }),
  },
  closedObject,
);

export const SizeSchema = Type.Object(
  {
    width: Type.Number({ minimum: 0.001, maximum: 4 }),
    height: Type.Number({ minimum: 0.001, maximum: 4 }),
  },
  closedObject,
);

export const ComponentTransformSchema = Type.Object(
  {
    translation: Type.Ref('#/$defs/point'),
    baseSize: Type.Ref('#/$defs/size'),
    rotationDeg: Type.Number({ minimum: -180, exclusiveMaximum: 180 }),
    uniformScale: Type.Number({ minimum: 0.05, maximum: 4 }),
  },
  closedObject,
);

export const BlendModeSchema = Type.Enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
] as const);

export const ComponentAppearanceSchema = Type.Object(
  {
    softness: Type.Ref('#/$defs/normalizedUnit'),
    highlight: Type.Ref('#/$defs/normalizedUnit'),
    grain: Type.Ref('#/$defs/normalizedUnit'),
    asymmetry: Type.Ref('#/$defs/normalizedSignedUnit'),
    blendMode: BlendModeSchema,
  },
  closedObject,
);

export const PaletteColorSourceSchema = Type.Object(
  { kind: literal('palette'), paletteId: Type.Ref('#/$defs/paletteId') },
  closedObject,
);

export const LocalColorSourceSchema = Type.Object(
  { kind: literal('local'), value: Type.Ref('#/$defs/colorValue') },
  closedObject,
);

type ColorSourceReferenceContext = {
  '#/$defs/normalizedUnit': typeof NormalizedUnitSchema;
  '#/$defs/canonicalColor': typeof CanonicalColorSchema;
  '#/$defs/paletteId': typeof PaletteIdSchema;
  '#/$defs/colorValue': typeof ColorValueSchema;
};

type ComponentColorSourceStatic =
  | Type.Static<typeof PaletteColorSourceSchema, ColorSourceReferenceContext>
  | Type.Static<typeof LocalColorSourceSchema, ColorSourceReferenceContext>;

export const ComponentColorSourceSchema = oneOf<ComponentColorSourceStatic>([
  Type.Ref('#/$defs/paletteColorSource'),
  Type.Ref('#/$defs/localColorSource'),
]);

const commonComponentLockProperties = {
  identity: Type.Boolean(),
  colorSource: Type.Boolean(),
  geometry: Type.Boolean(),
  translation: Type.Boolean(),
  rotation: Type.Boolean(),
  uniformScale: Type.Boolean(),
  aspect: Type.Boolean(),
};

export const BandComponentLocksSchema = Type.Object(commonComponentLockProperties, closedObject);
export const FieldComponentLocksSchema = Type.Object(
  { ...commonComponentLockProperties, anchorCount: Type.Boolean() },
  closedObject,
);

export const LineSegmentSchema = Type.Object({ kind: literal('line') }, closedObject);
export const HandleOffsetSchema = Type.Object(
  {
    dx: Type.Number({ minimum: -2, maximum: 2 }),
    dy: Type.Number({ minimum: -2, maximum: 2 }),
  },
  closedObject,
);
export const CubicSegmentSchema = Type.Object(
  {
    kind: literal('cubic'),
    outHandle: Type.Ref('#/$defs/handleOffset'),
    inHandle: Type.Ref('#/$defs/handleOffset'),
  },
  closedObject,
);

type SegmentReferenceContext = {
  '#/$defs/handleOffset': typeof HandleOffsetSchema;
};

type SegmentBendStatic =
  | Type.Static<typeof LineSegmentSchema>
  | Type.Static<typeof CubicSegmentSchema, SegmentReferenceContext>;

export const SegmentBendSchema = oneOf<SegmentBendStatic>([
  Type.Ref('#/$defs/lineSegment'),
  Type.Ref('#/$defs/cubicSegment'),
]);

export const ShapeAnchorSchema = Type.Object(
  {
    id: Type.Ref('#/$defs/anchorId'),
    x: Type.Ref('#/$defs/normalizedUnit'),
    y: Type.Ref('#/$defs/normalizedUnit'),
    segmentToNext: SegmentBendSchema,
  },
  closedObject,
);

export const FieldContourSchema = Type.Object(
  {
    anchors: Type.Array(Type.Ref('#/$defs/shapeAnchor'), { minItems: 10, maxItems: 64 }),
  },
  closedObject,
);

const commonComponentProperties = {
  id: Type.Ref('#/$defs/componentId'),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  transform: Type.Ref('#/$defs/componentTransform'),
  appearance: Type.Ref('#/$defs/componentAppearance'),
  colorSource: Type.Ref('#/$defs/componentColorSource'),
};

export const FieldSchema = Type.Object(
  {
    id: commonComponentProperties.id,
    name: commonComponentProperties.name,
    type: literal('field'),
    transform: commonComponentProperties.transform,
    appearance: commonComponentProperties.appearance,
    colorSource: commonComponentProperties.colorSource,
    locks: Type.Ref('#/$defs/fieldComponentLocks'),
    contour: Type.Ref('#/$defs/fieldContour'),
  },
  closedObject,
);

export const BandShapeSchema = Type.Object(
  {
    endCap: Type.Enum(['round', 'flat'] as const),
    taper: Type.Ref('#/$defs/normalizedUnit'),
  },
  closedObject,
);

export const BandSchema = Type.Object(
  {
    id: commonComponentProperties.id,
    name: commonComponentProperties.name,
    type: literal('band'),
    transform: commonComponentProperties.transform,
    appearance: commonComponentProperties.appearance,
    colorSource: commonComponentProperties.colorSource,
    locks: Type.Ref('#/$defs/bandComponentLocks'),
    band: Type.Ref('#/$defs/bandShape'),
  },
  closedObject,
);

type ComponentReferenceContext = ColorSourceReferenceContext &
  SegmentReferenceContext & {
    '#/$defs/componentId': typeof ComponentIdSchema;
    '#/$defs/normalizedSignedUnit': typeof NormalizedSignedUnitSchema;
    '#/$defs/anchorId': typeof AnchorIdSchema;
    '#/$defs/point': typeof PointSchema;
    '#/$defs/size': typeof SizeSchema;
    '#/$defs/componentTransform': typeof ComponentTransformSchema;
    '#/$defs/componentAppearance': typeof ComponentAppearanceSchema;
    '#/$defs/paletteColorSource': typeof PaletteColorSourceSchema;
    '#/$defs/localColorSource': typeof LocalColorSourceSchema;
    '#/$defs/componentColorSource': typeof ComponentColorSourceSchema;
    '#/$defs/bandComponentLocks': typeof BandComponentLocksSchema;
    '#/$defs/fieldComponentLocks': typeof FieldComponentLocksSchema;
    '#/$defs/lineSegment': typeof LineSegmentSchema;
    '#/$defs/cubicSegment': typeof CubicSegmentSchema;
    '#/$defs/shapeAnchor': typeof ShapeAnchorSchema;
    '#/$defs/fieldContour': typeof FieldContourSchema;
    '#/$defs/bandShape': typeof BandShapeSchema;
  };

type ComponentStatic =
  | Type.Static<typeof FieldSchema, ComponentReferenceContext>
  | Type.Static<typeof BandSchema, ComponentReferenceContext>;

export const ComponentSchema = oneOf<ComponentStatic>([
  Type.Ref('#/$defs/field'),
  Type.Ref('#/$defs/band'),
]);

export const GlobalEffectsSchema = Type.Object(
  {
    grain: Type.Ref('#/$defs/normalizedUnit'),
    contrast: Type.Ref('#/$defs/normalizedSignedUnit'),
    softnessBias: Type.Ref('#/$defs/normalizedSignedUnit'),
  },
  closedObject,
);

export const GlobalShuffleLocksSchema = Type.Object(
  {
    paletteCount: Type.Boolean(),
    componentCount: Type.Boolean(),
    effects: Type.Boolean(),
  },
  closedObject,
);

export const AppliedShuffleScopeSchema = Type.Object(
  {
    baseColor: Type.Boolean(),
    baseOpacity: Type.Boolean(),
    paletteCount: Type.Boolean(),
    paletteValues: Type.Boolean(),
    componentCount: Type.Boolean(),
    componentColors: Type.Boolean(),
    componentGeometry: Type.Boolean(),
    anchorCount: Type.Boolean(),
    translation: Type.Boolean(),
    rotation: Type.Boolean(),
    uniformScale: Type.Boolean(),
    aspect: Type.Boolean(),
    effects: Type.Boolean(),
  },
  closedObject,
);

export const GeneratorProvenanceSchema = Type.Object(
  {
    generatorVersion: literal('xoshiro128ss-v1'),
    seed: Type.Integer({ minimum: 0, maximum: 4_294_967_295 }),
    operation: Type.Enum(['generate', 'shuffle'] as const),
    scope: Type.Ref('#/$defs/appliedShuffleScope'),
    selectedComponentIds: Type.Array(Type.Ref('#/$defs/componentId'), { uniqueItems: true }),
    rangesProfile: literal('texture-lab-ranges-v1'),
    inputRecipeHash: Type.Ref('#/$defs/sha256'),
    lockDigest: Type.Ref('#/$defs/sha256'),
  },
  closedObject,
);

export const RecipeDefinitions = {
  normalizedUnit: NormalizedUnitSchema,
  normalizedSignedUnit: NormalizedSignedUnitSchema,
  canonicalColor: CanonicalColorSchema,
  paletteId: PaletteIdSchema,
  componentId: ComponentIdSchema,
  anchorId: AnchorIdSchema,
  sha256: Sha256Schema,
  colorValue: ColorValueSchema,
  baseLocks: BaseLocksSchema,
  baseLayer: BaseLayerSchema,
  canvas: CanvasSchema,
  paletteLocks: PaletteLocksSchema,
  paletteEntry: PaletteEntrySchema,
  point: PointSchema,
  size: SizeSchema,
  componentTransform: ComponentTransformSchema,
  componentAppearance: ComponentAppearanceSchema,
  paletteColorSource: PaletteColorSourceSchema,
  localColorSource: LocalColorSourceSchema,
  componentColorSource: ComponentColorSourceSchema,
  bandComponentLocks: BandComponentLocksSchema,
  fieldComponentLocks: FieldComponentLocksSchema,
  lineSegment: LineSegmentSchema,
  handleOffset: HandleOffsetSchema,
  cubicSegment: CubicSegmentSchema,
  shapeAnchor: ShapeAnchorSchema,
  fieldContour: FieldContourSchema,
  field: FieldSchema,
  bandShape: BandShapeSchema,
  band: BandSchema,
  globalEffects: GlobalEffectsSchema,
  globalShuffleLocks: GlobalShuffleLocksSchema,
  appliedShuffleScope: AppliedShuffleScopeSchema,
  generatorProvenance: GeneratorProvenanceSchema,
} as const;

export type RecipeTypeContext = {
  [
    Name in keyof typeof RecipeDefinitions as `#/$defs/${Name & string}`
  ]: (typeof RecipeDefinitions)[Name];
};

export const TextureRecipeSchema = Type.Object(
  {
    schemaVersion: literal('0.1.0'),
    canvas: ref('canvas'),
    base: ref('baseLayer'),
    palette: Type.Array(ref('paletteEntry')),
    components: Type.Array(ComponentSchema),
    effects: ref('globalEffects'),
    shuffleLocks: ref('globalShuffleLocks'),
    provenance: Type.Optional(ref('generatorProvenance')),
  },
  {
    ...closedObject,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:texture-lab:schema:recipe:0.1.0',
    title: 'Texture Lab Recipe v0.1.0',
    $defs: RecipeDefinitions,
  },
);
