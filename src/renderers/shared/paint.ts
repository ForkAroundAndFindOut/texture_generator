import type { ComponentLayerIR } from './ir';

export type GradientStop = Readonly<{
  readonly offset: number;
  readonly opacity: number;
}>;

export type ComponentGradient =
  | Readonly<{
      readonly kind: 'radial';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly stops: readonly GradientStop[];
    }>
  | Readonly<{
      readonly kind: 'linear';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly stops: readonly GradientStop[];
    }>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** Stable resource identity shared by the preview and standalone SVG adapters. */
export const gradientId = (layer: ComponentLayerIR): string => `${layer.definitionId}-paint`;

/**
 * Build the only gradient recipe used by visual adapters. The Field fades
 * outward from its centre; the Band fades across its short axis. This keeps
 * softness, highlight, and asymmetry visible rather than exposing inert form
 * controls.
 */
export function gradientForComponent(layer: ComponentLayerIR): ComponentGradient {
  const coreOpacity = clamp(0.68 + layer.fade.highlight * 0.32, 0, 1);
  const shoulderOpacity = clamp(coreOpacity * (0.82 + layer.fade.highlight * 0.18), 0, 1);

  if (layer.kind === 'field') {
    const shoulder = clamp(0.48 + (1 - layer.fade.softness) * 0.34, 0.25, 0.9);
    return {
      kind: 'radial',
      cx: 0.5,
      cy: 0.5,
      r: 0.72,
      stops: [
        { offset: 0, opacity: coreOpacity },
        { offset: shoulder, opacity: shoulderOpacity },
        { offset: 1, opacity: 0 },
      ],
    };
  }

  const center = clamp(0.5 + layer.fade.asymmetry * 0.2, 0.2, 0.8);
  const halfWidth = clamp(0.18 + layer.fade.softness * 0.24, 0.14, 0.45);
  const start = clamp(center - halfWidth, 0.02, 0.48);
  const end = clamp(center + halfWidth, 0.52, 0.98);
  return {
    kind: 'linear',
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
    stops: [
      { offset: 0, opacity: 0 },
      { offset: start, opacity: shoulderOpacity },
      { offset: center, opacity: coreOpacity },
      { offset: end, opacity: shoulderOpacity },
      { offset: 1, opacity: 0 },
    ],
  };
}
