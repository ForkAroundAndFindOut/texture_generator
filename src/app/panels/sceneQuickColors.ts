export type SceneQuickColor = Readonly<{
  readonly name: string;
  readonly hex: string;
}>;

/** Small, dependable color starting points; White is intentionally explicit. */
export const SCENE_QUICK_COLORS: readonly SceneQuickColor[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Ink', hex: '#151A2D' },
  { name: 'Sky', hex: '#5B8CFF' },
  { name: 'Violet', hex: '#9D6CFF' },
  { name: 'Rose', hex: '#F5A7D8' },
  { name: 'Coral', hex: '#FF9B78' },
  { name: 'Sun', hex: '#F3B35C' },
  { name: 'Mint', hex: '#22AA88' },
];
