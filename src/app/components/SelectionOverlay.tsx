import { createElement } from 'react';

import type { ComponentLayerIR } from '../../renderers';
import { serializePathCommands } from '../../renderers/dom-svg/DomSvgRenderer';
import { canvasBoundsForPath } from './canvasGeometry';

export type SelectionOverlayProps = {
  readonly layer: ComponentLayerIR;
  readonly canvas: Readonly<{ width: number; height: number }>;
};

/** Non-exported SVG affordances for the currently selected layer. */
export function SelectionOverlay({ layer, canvas }: SelectionOverlayProps) {
  const bounds = canvasBoundsForPath(layer.path, canvas);
  if (bounds === undefined) return null;
  const handleRadius = Math.max(10, Math.min(20, Math.min(bounds.width, bounds.height) * 0.05));
  const handleInset = handleRadius * 1.6;
  const constrain = (value: number, maximum: number): number =>
    Math.max(handleInset, Math.min(maximum - handleInset, value));
  // Keep controls wholly inside the clipped canvas even when a Band extends
  // beyond its edges; otherwise the inspector can sit over an unreachable
  // handle.
  const scaleX = constrain(bounds.x + bounds.width, canvas.width);
  const scaleY = constrain(bounds.y + bounds.height, canvas.height);
  const rotateY = constrain(bounds.y - handleRadius * 3, canvas.height);

  return createElement(
    'g',
    {
      className: 'selection-overlay',
      'data-selection-overlay': layer.id,
      'aria-hidden': true,
    },
    createElement('path', {
      d: serializePathCommands(layer.path.commands),
      transform: `matrix(${layer.path.matrix.a} ${layer.path.matrix.b} ${layer.path.matrix.c} ${layer.path.matrix.d} ${layer.path.matrix.e} ${layer.path.matrix.f})`,
      fill: 'none',
      stroke: '#FFFFFF',
      strokeWidth: 3,
      vectorEffect: 'non-scaling-stroke',
      pointerEvents: 'none',
    }),
    createElement('rect', {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fill: 'none',
      stroke: '#7DD3FC',
      strokeWidth: 2,
      strokeDasharray: '7 5',
      vectorEffect: 'non-scaling-stroke',
      pointerEvents: 'none',
    }),
    createElement('line', {
      x1: bounds.center.x,
      y1: bounds.y,
      x2: bounds.center.x,
      y2: rotateY + handleRadius,
      stroke: '#7DD3FC',
      strokeWidth: 2,
      vectorEffect: 'non-scaling-stroke',
      pointerEvents: 'none',
    }),
    createElement('circle', {
      cx: scaleX,
      cy: scaleY,
      r: handleRadius,
      className: 'selection-overlay__handle selection-overlay__handle--scale',
      'data-canvas-handle': 'scale',
      'data-component-id': layer.id,
      fill: '#FFFFFF',
      stroke: '#0EA5E9',
      strokeWidth: 3,
      vectorEffect: 'non-scaling-stroke',
    }),
    createElement('circle', {
      cx: bounds.center.x,
      cy: rotateY,
      r: handleRadius,
      className: 'selection-overlay__handle selection-overlay__handle--rotate',
      'data-canvas-handle': 'rotate',
      'data-component-id': layer.id,
      fill: '#0EA5E9',
      stroke: '#FFFFFF',
      strokeWidth: 3,
      vectorEffect: 'non-scaling-stroke',
    }),
  );
}

export default SelectionOverlay;
