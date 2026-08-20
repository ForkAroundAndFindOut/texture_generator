import type { ComponentLayerIR, MatrixIR, RenderIR } from '../shared/ir';
import { gradientForComponent, gradientId } from '../shared/paint';
import { serializePathCommands } from './pathSerializer';

export type SvgSerializationOptions = {
  readonly title?: string;
  readonly description?: string;
};

const number = (value: number): string => {
  if (!Number.isFinite(value)) throw new RangeError('SVG values must be finite.');
  return Number(value.toFixed(6)).toString();
};

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const matrix = (value: MatrixIR): string =>
  `matrix(${number(value.a)} ${number(value.b)} ${number(value.c)} ${number(value.d)} ${number(value.e)} ${number(value.f)})`;

const filterId = (layer: ComponentLayerIR): string => `${layer.definitionId}-grain`;

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 10_000) + 1;
}

function serializeFilter(layer: ComponentLayerIR): string {
  if (layer.fade.filter.kind !== 'grain') return '';
  const id = escapeXml(filterId(layer));
  return `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${stableSeed(layer.definitionId)}" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="grain"/><feComponentTransfer in="grain" result="grain-alpha"><feFuncA type="table" tableValues="0 ${number(layer.fade.filter.amount)}"/></feComponentTransfer><feBlend in="SourceGraphic" in2="grain-alpha" mode="soft-light" result="textured"/><feComposite in="textured" in2="SourceGraphic" operator="in"/></filter>`;
}

function serializeGradient(layer: ComponentLayerIR): string {
  const gradient = gradientForComponent(layer);
  const id = escapeXml(gradientId(layer));
  const stops = gradient.stops
    .map(
      (stop) =>
        `<stop offset="${number(stop.offset * 100)}%" stop-color="${layer.color.hex}" stop-opacity="${number(layer.color.opacity * stop.opacity)}"/>`,
    )
    .join('');
  if (gradient.kind === 'radial') {
    return `<radialGradient id="${id}" gradientUnits="objectBoundingBox" cx="${number(gradient.cx)}" cy="${number(gradient.cy)}" r="${number(gradient.r)}">${stops}</radialGradient>`;
  }
  return `<linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${number(gradient.x1)}" y1="${number(gradient.y1)}" x2="${number(gradient.x2)}" y2="${number(gradient.y2)}">${stops}</linearGradient>`;
}

function serializeComponent(layer: ComponentLayerIR): string {
  const filter =
    layer.fade.filter.kind === 'grain' ? ` filter="url(#${escapeXml(filterId(layer))})"` : '';
  return `<g id="${escapeXml(layer.definitionId)}" data-layer-kind="${layer.kind}" data-layer-id="${escapeXml(layer.id)}" style="isolation:isolate;mix-blend-mode:${layer.blendMode}" opacity="1"><path d="${escapeXml(serializePathCommands(layer.path.commands))}" transform="${matrix(layer.path.matrix)}" fill="url(#${escapeXml(gradientId(layer))})"${filter}/></g>`;
}

function serializeLayers(ir: RenderIR): string {
  return ir.layers
    .map((layer) => {
      if (layer.kind === 'base') {
        return `<g id="base" data-layer-kind="base" data-layer-id="base"><rect x="0" y="0" width="100%" height="100%" fill="${layer.color.hex}" fill-opacity="${number(layer.color.opacity)}"/></g>`;
      }
      if (layer.kind === 'effects') {
        return '<g id="effects" data-layer-kind="effects" data-layer-id="effects"/>';
      }
      return serializeComponent(layer);
    })
    .join('');
}

/** Serialize RenderIR as a standalone, script-free SVG document. */
export function serializeSvg(ir: RenderIR, options: SvgSerializationOptions = {}): string {
  const title = escapeXml(options.title ?? 'Texture Lab texture');
  const description = escapeXml(
    options.description ?? 'Layered Field and Band texture exported from Texture Lab v0.1-lite.',
  );
  const definitions = ir.layers
    .map((layer) => {
      if (layer.kind !== 'field' && layer.kind !== 'band') return '';
      return `${serializeGradient(layer)}${serializeFilter(layer)}`;
    })
    .filter(Boolean)
    .join('');
  const content = serializeLayers(ir);
  const preserveAspectRatio =
    ir.fit.mode === 'stretch'
      ? 'none'
      : ir.fit.mode === 'cover'
        ? 'xMidYMid slice'
        : 'xMidYMid meet';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(ir.fit.target.width)}" height="${number(ir.fit.target.height)}" viewBox="0 0 ${number(ir.canvas.width)} ${number(ir.canvas.height)}" preserveAspectRatio="${preserveAspectRatio}" role="img" aria-labelledby="texture-title texture-description" data-render-ir-version="${ir.version}"><title id="texture-title">${title}</title><desc id="texture-description">${description}</desc>${definitions ? `<defs>${definitions}</defs>` : ''}<g data-fit-mode="${ir.fit.mode}">${content}</g></svg>\n`;
}
