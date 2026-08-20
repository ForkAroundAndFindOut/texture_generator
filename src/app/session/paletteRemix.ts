import type { CanonicalSceneColor, SceneV03 } from '../../domain';

/**
 * Curated, deliberately high-contrast color families for a one-action
 * composition remix. The canvas color is separate, so a remix never erases a
 * user's background decision or a material's local fill override.
 */
const PALETTE_REMIXES: readonly (readonly CanonicalSceneColor[])[] = [
  ['#6FE0D7', '#78A9FF', '#F5A7D8', '#FFF4E8'],
  ['#FF9B78', '#FFD08A', '#E5B4F3', '#78A9FF'],
  ['#A7E8BD', '#5B8CFF', '#F3B35C', '#F5A7D8'],
  ['#B9C8FF', '#EFA8DE', '#B7F3E7', '#FFF6BD'],
] as const;

function signature(colors: readonly CanonicalSceneColor[]): string {
  return colors.join('|');
}

/** Returns a deterministic next palette while retaining the current palette's shape. */
export function nextScenePaletteRemix(scene: SceneV03): readonly CanonicalSceneColor[] {
  const current = signature(scene.palette.map((entry) => entry.color));
  const currentIndex = PALETTE_REMIXES.findIndex((colors) => signature(colors) === current);
  const candidate = PALETTE_REMIXES[(currentIndex + 1) % PALETTE_REMIXES.length]!;
  return scene.palette.map((_, index) => candidate[index % candidate.length]!);
}

export { PALETTE_REMIXES };
