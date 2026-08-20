/**
 * A deliberately small, starter-derived quick-color set. These are direct
 * assignments, not a palette-management feature: a designer can experiment
 * without first creating, naming, or maintaining palette records.
 */
export type QuickColorSwatch = Readonly<{
  readonly name: string;
  readonly hex: string;
}>;

export const QUICK_COLOR_SWATCHES: readonly QuickColorSwatch[] = [
  { name: 'Night canvas', hex: '#101820' },
  { name: 'Field blue', hex: '#5B8CFF' },
  { name: 'Band rose', hex: '#FDA4AF' },
  { name: 'Sky', hex: '#7DD3FC' },
  { name: 'Amber', hex: '#FDE68A' },
  { name: 'Mint', hex: '#22AA88' },
];
