import { createElement } from 'react';

import type { AnchorId, ShapeAnchor } from '../../domain';
import type { ComponentLayerIR } from '../../renderers';
import { transformCanvasPoint } from './canvasGeometry';

export type AnchorOverlayProps = {
  readonly layer: ComponentLayerIR;
  readonly anchors: readonly ShapeAnchor[];
  readonly selectedAnchorId?: AnchorId;
};

/** Non-exported, bounded Field anchor affordances used only in anchor-edit mode. */
export function AnchorOverlay({ layer, anchors, selectedAnchorId }: AnchorOverlayProps) {
  const points = anchors.map((anchor) => ({
    anchor,
    point: transformCanvasPoint(layer.path.matrix, anchor),
  }));
  return createElement(
    'g',
    { className: 'anchor-overlay', 'data-anchor-overlay': layer.id, 'aria-hidden': true },
    ...points.flatMap(({ anchor, point }, index) => {
      const next = points[(index + 1) % points.length];
      if (next === undefined) return [];
      const shared = {
        x1: point.x,
        y1: point.y,
        x2: next.point.x,
        y2: next.point.y,
        vectorEffect: 'non-scaling-stroke',
      };
      return [
        createElement('line', {
          ...shared,
          key: `${anchor.id}-guide`,
          className: 'anchor-overlay__segment-guide',
          stroke: '#F97316',
          strokeWidth: 2,
          strokeDasharray: '4 4',
          pointerEvents: 'none',
        }),
        createElement('line', {
          ...shared,
          key: `${anchor.id}-target`,
          className: 'anchor-overlay__segment',
          'data-canvas-handle': 'anchor-segment',
          'data-after-anchor-id': anchor.id,
          'data-component-id': layer.id,
          stroke: 'transparent',
          strokeWidth: 22,
          pointerEvents: 'stroke',
        }),
      ];
    }),
    ...points.map(({ anchor, point }) => {
      const selected = anchor.id === selectedAnchorId;
      return createElement('circle', {
        key: anchor.id,
        cx: point.x,
        cy: point.y,
        r: selected ? 12 : 9,
        className: `anchor-overlay__handle${selected ? ' is-selected' : ''}`,
        'data-canvas-handle': 'anchor',
        'data-anchor-id': anchor.id,
        'data-component-id': layer.id,
        fill: selected ? '#FDE68A' : '#FFFFFF',
        stroke: '#F97316',
        strokeWidth: 3,
        vectorEffect: 'non-scaling-stroke',
      });
    }),
  );
}

export default AnchorOverlay;
