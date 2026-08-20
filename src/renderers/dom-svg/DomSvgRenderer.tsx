import { createElement, type ReactElement, type ReactNode } from 'react';

import type {
  BaseLayerIR,
  ComponentLayerIR,
  EffectsLayerIR,
  LayerIR,
  MatrixIR,
  PathCommand,
  RenderIR,
} from '../shared/ir';
import { gradientForComponent, gradientId } from '../shared/paint';

/** Stable model returned by the DOM adapter before React composition. */
export interface DomSvgModel {
  readonly kind: 'dom-svg';
  readonly width: number;
  readonly height: number;
  readonly viewBox: string;
  readonly element: ReactElement;
}

export interface DomSvgRendererProps {
  readonly ir: RenderIR;
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
  /** Editor-only SVG affordances; omitted from standalone serialization. */
  readonly overlay?: ReactNode;
}

const number = (value: number): string => {
  if (!Number.isFinite(value)) throw new RangeError('SVG values must be finite.');
  return Number(value.toFixed(6)).toString();
};

const matrix = (value: MatrixIR): string =>
  `matrix(${number(value.a)} ${number(value.b)} ${number(value.c)} ${number(value.d)} ${number(value.e)} ${number(value.f)})`;

/** Convert shared component-local commands to deterministic SVG path data. */
export function serializePathCommands(commands: readonly PathCommand[]): string {
  return commands
    .map((command) => {
      switch (command.kind) {
        case 'move':
          return `M ${number(command.x)} ${number(command.y)}`;
        case 'line':
          return `L ${number(command.x)} ${number(command.y)}`;
        case 'cubic':
          return `C ${number(command.c1x)} ${number(command.c1y)} ${number(command.c2x)} ${number(command.c2y)} ${number(command.x)} ${number(command.y)}`;
        case 'close':
          return 'Z';
      }
    })
    .join(' ');
}

type FilterLayerIR = ComponentLayerIR | EffectsLayerIR;

const filterId = (layer: FilterLayerIR): string => `${layer.definitionId}-grain`;

const stableSeed = (value: string): number => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 10_000) + 1;
};

const renderFilter = (layer: FilterLayerIR): ReactElement | null => {
  if (layer.fade.filter.kind !== 'grain') return null;
  return createElement(
    'filter',
    {
      id: filterId(layer),
      x: '-10%',
      y: '-10%',
      width: '120%',
      height: '120%',
      colorInterpolationFilters: 'sRGB',
    },
    createElement('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: '0.8',
      numOctaves: 2,
      seed: stableSeed(layer.definitionId),
      result: 'noise',
    }),
    createElement('feColorMatrix', {
      in: 'noise',
      type: 'saturate',
      values: '0',
      result: 'grain',
    }),
    createElement(
      'feComponentTransfer',
      { in: 'grain', result: 'grain-alpha' },
      createElement('feFuncA', {
        type: 'table',
        tableValues: `0 ${number(layer.fade.filter.amount)}`,
      }),
    ),
    createElement('feBlend', {
      in: 'SourceGraphic',
      in2: 'grain-alpha',
      mode: 'soft-light',
      result: 'textured',
    }),
    createElement('feComposite', {
      in: 'textured',
      in2: 'SourceGraphic',
      operator: 'in',
    }),
  );
};

const renderGradient = (layer: ComponentLayerIR): ReactElement => {
  const gradient = gradientForComponent(layer);
  const stops = gradient.stops.map((stop) =>
    createElement('stop', {
      key: `${stop.offset}:${stop.opacity}`,
      offset: `${number(stop.offset * 100)}%`,
      stopColor: layer.color.hex,
      stopOpacity: number(layer.color.opacity * stop.opacity),
    }),
  );
  if (gradient.kind === 'radial') {
    return createElement(
      'radialGradient',
      {
        id: gradientId(layer),
        gradientUnits: 'objectBoundingBox',
        cx: number(gradient.cx),
        cy: number(gradient.cy),
        r: number(gradient.r),
      },
      ...stops,
    );
  }
  return createElement(
    'linearGradient',
    {
      id: gradientId(layer),
      gradientUnits: 'objectBoundingBox',
      x1: number(gradient.x1),
      y1: number(gradient.y1),
      x2: number(gradient.x2),
      y2: number(gradient.y2),
    },
    ...stops,
  );
};

const renderDefs = (layers: readonly LayerIR[]): ReactElement =>
  createElement(
    'defs',
    { key: 'defs' },
    ...layers
      .filter((layer): layer is ComponentLayerIR => layer.kind === 'field' || layer.kind === 'band')
      .map(renderGradient),
    ...layers
      .filter((layer): layer is FilterLayerIR => layer.kind !== 'base')
      .map((layer) => renderFilter(layer))
      .filter((value): value is ReactElement => value !== null),
  );

const renderBase = (layer: BaseLayerIR): ReactElement =>
  createElement(
    'g',
    {
      key: layer.definitionId,
      id: layer.definitionId,
      'data-layer-kind': layer.kind,
      'data-layer-id': layer.id,
      className: 'texture-layer',
    },
    createElement('rect', {
      x: 0,
      y: 0,
      width: '100%',
      height: '100%',
      fill: layer.color.hex,
      fillOpacity: layer.color.opacity,
    }),
  );

const renderComponent = (layer: ComponentLayerIR): ReactElement => {
  const filter = layer.fade.filter.kind === 'grain' ? `url(#${filterId(layer)})` : undefined;
  return createElement(
    'g',
    {
      key: layer.definitionId,
      id: layer.definitionId,
      'data-layer-kind': layer.kind,
      'data-layer-id': layer.id,
      className: `texture-layer texture-layer--blend-${layer.blendMode}`,
      opacity: 1,
    },
    createElement('path', {
      d: serializePathCommands(layer.path.commands),
      transform: matrix(layer.path.matrix),
      fill: `url(#${gradientId(layer)})`,
      filter,
      'data-source-component-id': layer.path.sourceComponentId,
      'data-source-anchor-ids': layer.path.sourceAnchorIds?.join(' ') || undefined,
    }),
  );
};

const renderEffects = (layer: EffectsLayerIR): ReactElement =>
  createElement('g', {
    key: layer.definitionId,
    id: layer.definitionId,
    'data-layer-kind': layer.kind,
    'data-layer-id': layer.id,
    className: 'texture-layer',
    'aria-hidden': true,
  });

const renderLayer = (layer: LayerIR): ReactElement => {
  switch (layer.kind) {
    case 'base':
      return renderBase(layer);
    case 'field':
    case 'band':
      return renderComponent(layer);
    case 'effects':
      return renderEffects(layer);
  }
};

const renderTiles = (ir: RenderIR): readonly ReactElement[] => {
  if (ir.tileCopies.length === 0) return [];
  return ir.tileCopies.map((copy, index) =>
    createElement(
      'g',
      {
        key: `tile-${index}`,
        'data-tile-copy': `${copy.offset.x},${copy.offset.y}`,
        transform: `translate(${number(copy.offset.x * ir.canvas.width)} ${number(copy.offset.y * ir.canvas.height)})`,
        'aria-hidden': true,
      },
      ir.layers.map(renderLayer),
    ),
  );
};

const buildElement = (
  ir: RenderIR,
  title: string,
  description: string,
  className: string | undefined,
  overlay: ReactNode | undefined,
): ReactElement => {
  const titleId = `${ir.layers[0].definitionId}-title`;
  const descriptionId = `${ir.layers[0].definitionId}-description`;
  const preserveAspectRatio =
    ir.fit.mode === 'stretch'
      ? 'none'
      : ir.fit.mode === 'cover'
        ? 'xMidYMid slice'
        : 'xMidYMid meet';
  return createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: ir.fit.target.width,
      height: ir.fit.target.height,
      viewBox: `0 0 ${number(ir.canvas.width)} ${number(ir.canvas.height)}`,
      preserveAspectRatio,
      role: 'img',
      'aria-labelledby': `${titleId} ${descriptionId}`,
      className,
      focusable: 'false',
      'data-render-ir-version': ir.version,
    },
    createElement('title', { id: titleId }, title),
    createElement('desc', { id: descriptionId }, description),
    renderDefs(ir.layers),
    createElement(
      'g',
      { key: 'fit', 'data-fit-mode': ir.fit.mode },
      ir.layers.map(renderLayer),
      renderTiles(ir),
      overlay,
    ),
  );
};

/** Build an accessible inline SVG model from shared RenderIR. */
export function renderDomSvg(
  ir: RenderIR,
  options: Readonly<
    Pick<DomSvgRendererProps, 'title' | 'description' | 'className' | 'overlay'>
  > = {},
): DomSvgModel {
  return {
    kind: 'dom-svg',
    width: ir.fit.target.width,
    height: ir.fit.target.height,
    viewBox: `0 0 ${number(ir.canvas.width)} ${number(ir.canvas.height)}`,
    element: buildElement(
      ir,
      options.title ?? 'Texture preview',
      options.description ?? 'Deterministic preview generated from the canonical texture recipe.',
      options.className,
      options.overlay,
    ),
  };
}

/** React adapter used by the application preview surface. */
export function DomSvgRenderer({
  ir,
  title,
  description,
  className,
  overlay,
}: DomSvgRendererProps) {
  return renderDomSvg(ir, {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(className === undefined ? {} : { className }),
    ...(overlay === undefined ? {} : { overlay }),
  }).element;
}

export default DomSvgRenderer;
