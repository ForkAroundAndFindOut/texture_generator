export const SCENE_V03_SCHEMA_VERSION = '0.3.0' as const;

export const ARTBOARD_RATIOS = ['1:1', '2:1', '1:2', '4:3', '16:9', '21:9'] as const;
export type ArtboardRatio = (typeof ARTBOARD_RATIOS)[number];

export const ARTBOARD_FIT_MODES = ['fit', 'cover'] as const;
export type ArtboardFitMode = (typeof ARTBOARD_FIT_MODES)[number];

export const INTERACTION_MODES = [
  'paint',
  'glow',
  'shade',
  'texture',
  'keep-base-hue',
  'colorize',
] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export const GRAIN_KINDS = ['grain', 'paper', 'film'] as const;
export type GrainKind = (typeof GRAIN_KINDS)[number];

export type SceneV03IdKind = 'scene' | 'palette' | 'group' | 'material';
export type SceneV03Id = string;
export type PaletteEntryId = SceneV03Id;
export type GroupId = SceneV03Id;
export type MaterialId = SceneV03Id;

export type CanonicalSceneColor = string;

export interface ScenePoint {
  x: number;
  y: number;
}

/**
 * V0.3's sole filled geometry contract. T2 adds simple-polygon validity; the
 * schema already constrains stored point count and normalized coordinates.
 */
export interface Boundary {
  vertices: ScenePoint[];
}

export interface BoundaryGeometry {
  kind: 'boundary';
  boundary: Boundary;
}

export interface PaletteFill {
  kind: 'palette';
  paletteId: PaletteEntryId;
}

export interface LocalFill {
  kind: 'local';
  color: CanonicalSceneColor;
}

export type MaterialFill = PaletteFill | LocalFill;

export interface GrainStyle {
  kind: GrainKind;
  amount: number;
  scale: number;
  seed: number;
}

export interface GroupTransform {
  translation: ScenePoint;
  uniformScale: number;
  rotationDeg: number;
}

export interface SceneMaterial {
  kind: 'material';
  id: MaterialId;
  name: string;
  visible: boolean;
  geometry: BoundaryGeometry;
  fill: MaterialFill;
  opacity: number;
  edgeFeather: number;
  bloom: number;
  interaction: InteractionMode;
  grain?: GrainStyle;
}

export interface SceneGroup {
  kind: 'group';
  id: GroupId;
  name: string;
  visible: boolean;
  transform: GroupTransform;
  children: SceneNode[];
}

export type SceneNode = SceneGroup | SceneMaterial;

export interface ScenePaletteEntry {
  id: PaletteEntryId;
  name: string;
  color: CanonicalSceneColor;
}

export interface Artboard {
  ratio: ArtboardRatio;
  fitMode: ArtboardFitMode;
}

/**
 * The v0.3 source document. Arrays intentionally stay in draw order:
 * rootGroups and group children are back-to-front.
 */
export interface SceneV03 {
  schemaVersion: typeof SCENE_V03_SCHEMA_VERSION;
  id: SceneV03Id;
  artboard: Artboard;
  background: CanonicalSceneColor;
  palette: ScenePaletteEntry[];
  rootGroups: SceneGroup[];
}
