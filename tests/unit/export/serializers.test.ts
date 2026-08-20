import { describe, expect, test } from 'vitest';

import { compileFieldGeometry, createDefaultRecipe, normalizeRecipe } from '../../../src/domain';
import {
  compileRenderIR,
  serializeCss,
  serializeSvg,
  type RenderProfile,
} from '../../../src/renderers';
import { gradientForComponent } from '../../../src/renderers/shared/paint';

const profile: RenderProfile = {
  kind: 'render-profile',
  usage: 'component',
  width: 720,
  height: 480,
  fit: 'contain',
  inspectTiles: false,
  targetShape: 'landscape',
};

describe('v0.1-lite SVG and CSS serializers', () => {
  test('resolves normalized component geometry into canvas coordinates exactly once', () => {
    const recipe = createDefaultRecipe();
    const field = recipe.components.find((component) => component.type === 'field');
    if (field === undefined) throw new Error('default recipe has no Field');

    const domainPath = compileFieldGeometry(field);
    const ir = compileRenderIR(recipe, profile);
    const renderedField = ir.layers.find((layer) => layer.kind === 'field');
    if (renderedField?.kind !== 'field') throw new Error('RenderIR has no Field');

    expect(renderedField.path.matrix.a).toBeCloseTo(domainPath.matrix.a * ir.canvas.width, 6);
    expect(renderedField.path.matrix.b).toBeCloseTo(domainPath.matrix.b * ir.canvas.height, 6);
    expect(renderedField.path.matrix.c).toBeCloseTo(domainPath.matrix.c * ir.canvas.width, 6);
    expect(renderedField.path.matrix.d).toBeCloseTo(domainPath.matrix.d * ir.canvas.height, 6);
    expect(renderedField.path.matrix.e).toBeCloseTo(domainPath.matrix.e * ir.canvas.width, 6);
    expect(renderedField.path.matrix.f).toBeCloseTo(domainPath.matrix.f * ir.canvas.height, 6);

    const svg = serializeSvg(ir);
    expect(svg).toContain('data-fit-mode="contain"');
    expect(svg).not.toContain('data-fit-mode="contain" transform=');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  test('serializes deterministic standalone SVG in canonical layer order', () => {
    const ir = compileRenderIR(createDefaultRecipe(), profile);
    const first = serializeSvg(ir);
    const second = serializeSvg(ir);

    expect(first).toBe(second);
    expect(first.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(first.endsWith('\n')).toBe(true);
    expect(first).not.toContain('<script');
    expect(first).not.toContain('foreignObject');

    const positions = ir.layers.map((layer) => first.indexOf(`data-layer-id="${layer.id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  test('escapes accessible text and preserves component color, opacity, and blend', () => {
    const recipe = structuredClone(createDefaultRecipe());
    const band = recipe.components.find((component) => component.type === 'band');
    if (band === undefined) throw new Error('default recipe has no Band');
    band.colorSource = { kind: 'local', value: { hex: '#112233', opacity: 0.42 } };
    band.appearance.blendMode = 'multiply';
    const ir = compileRenderIR(normalizeRecipe(recipe), profile);
    const svg = serializeSvg(ir, { title: '<Texture & "friends">' });

    expect(svg).toContain('&lt;Texture &amp; &quot;friends&quot;&gt;');
    const renderedBand = ir.layers.find((layer) => layer.kind === 'band');
    if (renderedBand?.kind !== 'band') throw new Error('RenderIR has no Band');
    const peakOpacity = Math.max(
      ...gradientForComponent(renderedBand).stops.map(
        (stop) => stop.opacity * renderedBand.color.opacity,
      ),
    );
    const serializedPeakOpacity = Number(peakOpacity.toFixed(6)).toString();

    expect(svg).toContain('stop-color="#112233"');
    expect(svg).toContain(`stop-opacity="${serializedPeakOpacity}"`);
    expect(svg).toContain(`fill="url(#${renderedBand.definitionId}-paint)"`);
    expect(svg).toContain('mix-blend-mode:multiply');
  });

  test('uses a Field radial fade and a Band cross-axis fade from the same IR', () => {
    const svg = serializeSvg(compileRenderIR(createDefaultRecipe(), profile));

    expect(svg).toContain('<radialGradient');
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('gradientUnits="objectBoundingBox"');
  });

  test('keeps SourceGraphic in the grain filter rather than replacing the layer', () => {
    const ir = compileRenderIR(createDefaultRecipe(), profile);
    const svg = serializeSvg(ir);

    expect(svg).toContain('in="SourceGraphic" in2="grain-alpha" mode="soft-light"');
    expect(svg).toContain('in="textured" in2="SourceGraphic" operator="in"');
  });

  test('embeds the exact SVG in deterministic self-contained CSS', () => {
    const ir = compileRenderIR(createDefaultRecipe(), profile);
    const svg = serializeSvg(ir);
    const css = serializeCss(ir, svg);
    const encoded = /data:image\/svg\+xml,([^"\n]+)/.exec(css)?.[1];

    expect(serializeCss(ir, svg)).toBe(css);
    expect(css).toContain('.texture-lab-texture {');
    expect(css).toContain('background-image: url("data:image/svg+xml,');
    expect(encoded).toBeDefined();
    expect(decodeURIComponent(encoded!)).toBe(svg);
  });

  test('rejects selector text that could escape the generated rule', () => {
    const ir = compileRenderIR(createDefaultRecipe(), profile);
    expect(() => serializeCss(ir, serializeSvg(ir), { selector: '.x { color:red }' })).toThrow();
  });
});
