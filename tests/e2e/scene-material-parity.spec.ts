import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { expect, test, type Page } from '@playwright/test';

import {
  createBlankSceneV03,
  type InteractionMode,
  type SceneV03,
} from '../../src/domain/index.js';
import {
  compileSceneRenderIR,
  DomSceneSvgRenderer,
  serializeSceneCss,
  serializeSceneSvg,
} from '../../src/renderers/index.js';

const stableId = (prefix: 'grp' | 'mat', index: number): string =>
  prefix + '_' + String(index).padStart(26, '0');

const interactions: InteractionMode[] = ['paint', 'texture', 'keep-base-hue'];

function redOverGreenScene(interaction: InteractionMode): SceneV03 {
  const scene = createBlankSceneV03();
  scene.background = '#228B22';
  scene.rootGroups = [
    {
      kind: 'group',
      id: stableId('grp', 1),
      name: interaction + ' red overlay',
      visible: true,
      transform: {
        translation: { x: 0.5, y: 0.5 },
        uniformScale: 1,
        rotationDeg: 0,
      },
      children: [
        {
          kind: 'material',
          id: stableId('mat', 1),
          name: 'Red overlay',
          visible: true,
          geometry: {
            kind: 'boundary',
            boundary: {
              vertices: [
                { x: 0.2, y: 0.2 },
                { x: 0.8, y: 0.2 },
                { x: 0.8, y: 0.8 },
                { x: 0.2, y: 0.8 },
              ],
            },
          },
          fill: { kind: 'local', color: '#FF0000' },
          opacity: 0.65,
          edgeFeather: 0,
          bloom: 0,
          interaction,
        },
      ],
    },
  ];
  return scene;
}

async function sourceCenterPixel(
  page: Page,
  selector: string,
  source: 'svg' | 'css',
): Promise<number[]> {
  return page.locator(selector).evaluate(async (element, sourceKind) => {
    const sourceText =
      sourceKind === 'svg'
        ? new XMLSerializer().serializeToString(element.querySelector('svg')!)
        : getComputedStyle(element).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/u)?.[1];
    if (sourceText === undefined) throw new Error('Preview source is unavailable.');

    const image = new Image();
    image.src = sourceKind === 'svg' ? 'data:image/svg+xml;base64,' + btoa(sourceText) : sourceText;
    await new Promise<void>((resolveImage, rejectImage) => {
      image.addEventListener('load', () => resolveImage(), { once: true });
      image.addEventListener(
        'error',
        () => rejectImage(new Error('Preview source did not load.')),
        {
          once: true,
        },
      );
    });
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('2D canvas context is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return Array.from(context.getImageData(160, 90, 1, 1).data);
  }, source);
}

test('red-over-green Interaction choices are visibly distinct with DOM, SVG, and CSS parity', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const rendered = interactions.map((interaction) => {
    const ir = compileSceneRenderIR(redOverGreenScene(interaction));
    const svg = serializeSceneSvg(ir, { title: interaction + ' red over green' });
    const dom = renderToStaticMarkup(createElement(DomSceneSvgRenderer, { ir }));
    return {
      interaction,
      dom,
      svg,
      css: serializeSceneCss(ir, svg, { selector: '#css-' + interaction }),
    };
  });
  const css = rendered.map((entry) => entry.css).join('');
  const tiles = rendered
    .map(
      (entry) =>
        '<section data-interaction="' +
        entry.interaction +
        '"><h2>' +
        entry.interaction +
        '</h2><div id="dom-' +
        entry.interaction +
        '" class="preview dom-preview">' +
        entry.dom +
        '</div><div id="svg-' +
        entry.interaction +
        '" class="preview svg-preview">' +
        entry.svg +
        '</div><div id="css-' +
        entry.interaction +
        '" class="preview css-preview"></div></section>',
    )
    .join('');

  await page.setContent(
    '<style>body{margin:0;background:#111;color:#fff;font:14px system-ui}#interaction-board{display:grid;grid-template-columns:repeat(3,320px);gap:16px;padding:16px}.preview{width:320px;height:180px;overflow:hidden;background:#228B22}.preview svg{display:block;width:100%;height:100%}h2{font-size:14px;margin:0 0 4px;text-transform:capitalize}' +
      css +
      '</style><main id="interaction-board">' +
      tiles +
      '</main>',
  );

  const colors = new Map<string, number[]>();
  for (const interaction of interactions) {
    const dom = await sourceCenterPixel(page, '#dom-' + interaction, 'svg');
    const svg = await sourceCenterPixel(page, '#svg-' + interaction, 'svg');
    const cssPixel = await sourceCenterPixel(page, '#css-' + interaction, 'css');
    expect(dom).toEqual(svg);
    expect(cssPixel).toEqual(svg);
    colors.set(interaction, svg);
  }

  const paint = colors.get('paint')!;
  const texture = colors.get('texture')!;
  const keepBaseHue = colors.get('keep-base-hue')!;
  expect(new Set([paint.join(','), texture.join(','), keepBaseHue.join(',')]).size).toBe(3);
  expect(keepBaseHue[1]).toBeGreaterThan(keepBaseHue[0]!);

  await expect(page.locator('#interaction-board')).toHaveScreenshot('scene-interactions.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
