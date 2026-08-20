import type { SceneRenderIR } from '../shared/sceneIr';

export type SceneCssSerializationOptions = {
  readonly selector?: string;
};

function encodeSvg(svg: string): string {
  return encodeURIComponent(svg)
    .replaceAll("'", '%27')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29');
}

function rgba(hex: string): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + red + ' ' + green + ' ' + blue + ')';
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Scene CSS values must be finite.');
  return Number(value.toFixed(6)).toString();
}

/**
 * Build a responsive CSS-only host rule. The encoded SVG remains a vector
 * source generated from the same SceneRenderIR as DOM preview and download.
 */
export function serializeSceneCss(
  ir: SceneRenderIR,
  svg: string,
  options: SceneCssSerializationOptions = {},
): string {
  const selector = options.selector ?? '.texture-lab-scene';
  if (!/^[.#]?[A-Za-z_][A-Za-z0-9_-]*$/u.test(selector)) {
    throw new RangeError('Scene CSS selector must be a simple class, id, or type selector.');
  }
  const viewBox = ir.artboard.viewBox;
  const backgroundSize = ir.artboard.profile.fitMode === 'fit' ? 'contain' : 'cover';
  return (
    selector +
    ' {\n  aspect-ratio: ' +
    number(viewBox.width) +
    ' / ' +
    number(viewBox.height) +
    ';\n  background-color: ' +
    rgba(ir.background) +
    ';\n  background-image: url("data:image/svg+xml,' +
    encodeSvg(svg) +
    '");\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: ' +
    backgroundSize +
    ';\n}\n'
  );
}
