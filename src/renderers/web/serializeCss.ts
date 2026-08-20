import type { BaseLayerIR, RenderIR } from '../shared/ir';

export type CssSerializationOptions = {
  readonly selector?: string;
};

function encodeSvg(svg: string): string {
  return encodeURIComponent(svg)
    .replaceAll("'", '%27')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29');
}

function baseLayer(ir: RenderIR): BaseLayerIR {
  const base = ir.layers[0];
  if (base.kind !== 'base') throw new RangeError('RenderIR must begin with its base layer.');
  return base;
}

function rgba(hex: string, opacity: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgb(${red} ${green} ${blue} / ${Number(opacity.toFixed(6))})`;
}

/** Build a self-contained CSS class whose only asset is an encoded SVG data URL. */
export function serializeCss(
  ir: RenderIR,
  svg: string,
  options: CssSerializationOptions = {},
): string {
  const selector = options.selector ?? '.texture-lab-texture';
  if (!/^[.#]?[A-Za-z_][A-Za-z0-9_-]*$/.test(selector)) {
    throw new RangeError('CSS export selector must be a simple class, id, or type selector.');
  }
  const base = baseLayer(ir);
  return `${selector} {\n  background-color: ${rgba(base.color.hex, base.color.opacity)};\n  background-image: url("data:image/svg+xml,${encodeSvg(svg)}");\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: cover;\n}\n`;
}
