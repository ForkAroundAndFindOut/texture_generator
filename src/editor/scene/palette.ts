import { parseSceneColor, type CanonicalSceneColor, type SceneV03 } from '../../domain';

export const MAX_SCENE_PALETTE_ENTRIES = 32;
export const PALETTE_FILE_FORMAT = 'texture-lab-palette' as const;
export const PALETTE_FILE_VERSION = 1 as const;
export const PALETTE_FILE_MAX_BYTES = 1_000_000;

export type PaletteImportMode = 'append' | 'overwrite' | 'clear';

export type PaletteImportEntry = Readonly<{
  readonly name: string;
  readonly color: CanonicalSceneColor;
  readonly sourceIndex: number;
}>;

export type PaletteImportIssue = Readonly<{
  readonly sourceIndex?: number;
  readonly kind: 'file' | 'invalid' | 'capacity';
  readonly message: string;
}>;

export type PaletteImportParseResult = Readonly<{
  readonly entries: readonly PaletteImportEntry[];
  readonly issues: readonly PaletteImportIssue[];
}>;

export type PaletteImportPreview = Readonly<{
  readonly mode: PaletteImportMode;
  readonly entries: readonly PaletteImportEntry[];
  readonly approvedEntries: readonly PaletteImportEntry[];
  readonly issues: readonly PaletteImportIssue[];
  readonly resultingCount: number;
  readonly retainedCount: number;
  readonly overwrittenCount: number;
  readonly appendedCount: number;
  readonly referencedConversionCount: number;
  readonly replacesPalette: boolean;
  readonly canApply: boolean;
}>;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function hasOwn(value: JsonRecord, key: string): boolean {
  return Object.hasOwn(value, key);
}

function generatedName(prefix: string, occupied: ReadonlySet<string>): string {
  let index = 1;
  while (occupied.has(`${prefix} ${index}`.toLocaleLowerCase())) index += 1;
  return `${prefix} ${index}`;
}

export function createPaletteFile(scene: SceneV03): {
  readonly format: typeof PALETTE_FILE_FORMAT;
  readonly version: typeof PALETTE_FILE_VERSION;
  readonly entries: readonly { readonly name: string; readonly color: CanonicalSceneColor }[];
} {
  return {
    format: PALETTE_FILE_FORMAT,
    version: PALETTE_FILE_VERSION,
    entries: scene.palette.map(({ name, color }) => ({ name, color })),
  };
}

export function parsePaletteFile(candidate: unknown): PaletteImportParseResult {
  const root = asRecord(candidate);
  if (root === undefined) {
    return {
      entries: [],
      issues: [{ kind: 'file', message: 'Palette file must be a JSON object.' }],
    };
  }
  if (root['format'] !== PALETTE_FILE_FORMAT) {
    return {
      entries: [],
      issues: [
        { kind: 'file', message: `Unsupported palette format. Expected ${PALETTE_FILE_FORMAT}.` },
      ],
    };
  }
  if (root['version'] !== PALETTE_FILE_VERSION) {
    return {
      entries: [],
      issues: [{ kind: 'file', message: 'Unsupported palette version. Expected version 1.' }],
    };
  }
  if (!Array.isArray(root['entries'])) {
    return {
      entries: [],
      issues: [{ kind: 'file', message: 'Palette file entries must be an array.' }],
    };
  }

  const entries: PaletteImportEntry[] = [];
  const issues: PaletteImportIssue[] = [];
  const occupied = new Set<string>();
  for (const [index, rawEntry] of root['entries'].entries()) {
    const path = `Entry ${index + 1}`;
    const entry = asRecord(rawEntry);
    if (entry === undefined) {
      issues.push({ sourceIndex: index, kind: 'invalid', message: `${path} must be an object.` });
      continue;
    }
    const rawName = hasOwn(entry, 'name') ? entry['name'] : undefined;
    let name: string;
    if (rawName === undefined) {
      name = generatedName('Imported', occupied);
    } else if (typeof rawName !== 'string') {
      issues.push({
        sourceIndex: index,
        kind: 'invalid',
        message: `${path} name must be a string.`,
      });
      continue;
    } else {
      name = rawName.trim();
      if (name.length === 0 || name.length > 80) {
        issues.push({
          sourceIndex: index,
          kind: 'invalid',
          message: `${path} name must contain 1–80 characters.`,
        });
        continue;
      }
    }
    const nameKey = name.toLocaleLowerCase();
    if (occupied.has(nameKey)) {
      issues.push({
        sourceIndex: index,
        kind: 'invalid',
        message: `${path} duplicates another palette name.`,
      });
      continue;
    }
    if (typeof entry['color'] !== 'string') {
      issues.push({
        sourceIndex: index,
        kind: 'invalid',
        message: `${path} color must be a string.`,
      });
      continue;
    }
    const color = parseSceneColor(entry['color']);
    if (color.kind === 'invalid') {
      issues.push({
        sourceIndex: index,
        kind: 'invalid',
        message: `${path} color is invalid. ${color.message}`,
      });
      continue;
    }
    occupied.add(nameKey);
    entries.push({ name, color: color.color, sourceIndex: index });
  }
  return { entries, issues };
}

function countPaletteReferences(scene: SceneV03): number {
  let count = 0;
  const visit = (node: SceneV03['rootGroups'][number]['children'][number]): void => {
    if (node.kind === 'group') {
      node.children.forEach(visit);
      return;
    }
    if (node.fill.kind === 'palette') count += 1;
  };
  scene.rootGroups.forEach(visit);
  return count;
}

export function buildPaletteImportPreview(
  scene: SceneV03,
  parsed: PaletteImportParseResult,
  mode: PaletteImportMode,
): PaletteImportPreview {
  const capacity =
    mode === 'clear' ? MAX_SCENE_PALETTE_ENTRIES : MAX_SCENE_PALETTE_ENTRIES - scene.palette.length;
  const approvedEntries = parsed.entries.slice(0, Math.max(0, capacity));
  const overflow = parsed.entries.slice(approvedEntries.length).map((entry) => ({
    sourceIndex: entry.sourceIndex,
    kind: 'capacity' as const,
    message: `Entry ${entry.sourceIndex + 1} exceeds the 32-entry palette capacity.`,
  }));
  const issues = [...parsed.issues, ...overflow];
  const overwrittenCount =
    mode === 'overwrite' ? Math.min(approvedEntries.length, scene.palette.length) : 0;
  const appendedCount =
    mode === 'clear'
      ? approvedEntries.length
      : Math.max(0, approvedEntries.length - overwrittenCount);
  const retainedCount = mode === 'clear' ? 0 : scene.palette.length - overwrittenCount;
  const resultingCount = retainedCount + overwrittenCount + appendedCount;
  return {
    mode,
    entries: parsed.entries,
    approvedEntries,
    issues,
    resultingCount,
    retainedCount,
    overwrittenCount,
    appendedCount,
    referencedConversionCount: mode === 'clear' ? countPaletteReferences(scene) : 0,
    replacesPalette: mode === 'clear',
    canApply:
      approvedEntries.length > 0 &&
      resultingCount >= 1 &&
      resultingCount <= MAX_SCENE_PALETTE_ENTRIES,
  };
}
