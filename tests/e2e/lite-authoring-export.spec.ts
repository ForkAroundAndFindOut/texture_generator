import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const distRoot = resolve('dist');
let staticServer: Server | undefined;
let staticServerBaseUrl = 'http://127.0.0.1:4173';

const layerRows = (page: Page) => page.locator('ol[aria-label="Composition layers"] > li');
const compositionCanvas = (page: Page) => page.getByRole('region', { name: 'Composition canvas' });

async function expectFreshResponsiveEmbed(
  page: Page,
  css: string,
  backgroundSize: 'cover' | 'contain',
): Promise<void> {
  const freshHost = await page.context().newPage();
  try {
    await freshHost.setContent(
      `<style>body{margin:0;padding:24px;background:#111;display:grid;gap:24px}.texture-lab-scene{display:block}.wide{width:840px;height:360px}.tall{width:300px;height:640px}${css}</style><div id="wide" class="texture-lab-scene wide"></div><div id="tall" class="texture-lab-scene tall"></div>`,
    );
    for (const selector of ['#wide', '#tall']) {
      await expect(freshHost.locator(selector)).toHaveCSS('background-size', backgroundSize);
      await expect(freshHost.locator(selector)).toHaveCSS('background-repeat', 'no-repeat');
      const backgroundImage = await freshHost
        .locator(selector)
        .evaluate((element) => getComputedStyle(element).backgroundImage);
      expect(backgroundImage).toContain('data:image/svg+xml,');
    }
    const wide = await freshHost.locator('#wide').boundingBox();
    const tall = await freshHost.locator('#tall').boundingBox();
    expect(wide?.width).toBe(840);
    expect(wide?.height).toBe(360);
    expect(tall?.width).toBe(300);
    expect(tall?.height).toBe(640);
  } finally {
    await freshHost.close();
  }
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await page.addScriptTag({ url: `${staticServerBaseUrl}/_test/axe.min.js` });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        readonly axe: {
          readonly run: (
            context: Document,
            options: unknown,
          ) => Promise<{
            readonly violations: readonly {
              readonly id: string;
              readonly impact: string | null;
              readonly nodes: readonly unknown[];
            }[];
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodeCount: violation.nodes.length,
    }));
  });
  expect(violations).toEqual([]);
}

test.beforeAll(async () => {
  staticServer = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/_test/axe.min.js') {
      const axe = await readFile(resolve('node_modules/axe-core/axe.min.js'));
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(axe);
      return;
    }
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const target = resolve(distRoot, relativePath);
    if (target !== distRoot && !target.startsWith(`${distRoot}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const body = await readFile(target);
      const extension = extname(target);
      const contentType =
        extension === '.css'
          ? 'text/css; charset=utf-8'
          : extension === '.js'
            ? 'text/javascript; charset=utf-8'
            : 'text/html; charset=utf-8';
      response.writeHead(200, { 'Content-Type': contentType }).end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    staticServer!.once('error', reject);
    const port = process.env['TEXTURE_LAB_BASE_URL'] === undefined ? 4173 : 0;
    staticServer!.listen(port, '127.0.0.1', () => {
      const address = staticServer!.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The E2E fixture server did not expose a TCP address.'));
        return;
      }
      staticServerBaseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
      resolveListen();
    });
  });
});

test.afterAll(async () => {
  const server = staticServer;
  staticServer = undefined;
  staticServerBaseUrl = 'http://127.0.0.1:4173';
  if (server === undefined) return;
  server.closeAllConnections();
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
  });
});

test('v0.3 authors a portable art composition without rasterizing it', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Texture Lab' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Starter compositions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visual gestures' })).toBeVisible();
  await expect(
    compositionCanvas(page).getByRole('img', { name: /Texture Lab composition/u }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Choose Aurora wave starter' }).click();
  const rows = layerRows(page);
  const starterCount = await rows.count();
  expect(starterCount).toBeGreaterThan(0);

  const frame = page.locator('.scene-artboard__frame');
  const initialFrame = await frame.boundingBox();
  if (initialFrame === null) throw new Error('The v0.3 artboard frame is unavailable.');
  await page.getByRole('button', { name: '2:1', exact: true }).click();
  const wideFrame = await frame.boundingBox();
  if (wideFrame === null) throw new Error('The wide v0.3 artboard frame is unavailable.');
  expect(wideFrame.width / wideFrame.height).toBeGreaterThan(1.8);
  await page.getByRole('button', { name: '1:1', exact: true }).click();

  await page.getByRole('button', { name: /^Glow\b/u }).click();
  await expect(rows).toHaveCount(starterCount + 1);
  const canvas = compositionCanvas(page);
  const visualBeforeMaterial = await canvas.screenshot({ animations: 'disabled', caret: 'hide' });
  await page.getByRole('button', { name: 'Use White #FFFFFF', exact: true }).click();
  await page.getByLabel('Interaction mode').selectOption('keep-base-hue');
  const opacity = page.getByRole('slider', { name: 'Opacity' });
  const opacityBefore = await opacity.inputValue();
  await opacity.press('ArrowLeft');
  await expect(opacity).not.toHaveValue(opacityBefore);
  const visualAfterMaterial = await canvas.screenshot({ animations: 'disabled', caret: 'hide' });
  expect(visualAfterMaterial.equals(visualBeforeMaterial)).toBe(false);

  const selectedGroup = page.locator('.scene-artboard__svg [data-scene-group-id]').last();
  const selectedBounds = await selectedGroup.boundingBox();
  if (selectedBounds === null) throw new Error('The added Glow has no draggable canvas geometry.');
  const positionX = page.getByRole('spinbutton', { name: 'Position X' });
  const positionXBefore = await positionX.inputValue();
  await page.mouse.move(
    selectedBounds.x + selectedBounds.width / 2,
    selectedBounds.y + selectedBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    selectedBounds.x + selectedBounds.width / 2 + 32,
    selectedBounds.y + selectedBounds.height / 2 + 20,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(positionX).not.toHaveValue(positionXBefore);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(positionX).toHaveValue(positionXBefore);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(positionX).not.toHaveValue(positionXBefore);

  const beforeFreeform = await rows.count();
  await page.getByRole('button', { name: 'Draw Boundary' }).click();
  const canvasImage = canvas.getByRole('img', { name: /Texture Lab composition/u });
  const canvasBounds = await canvasImage.boundingBox();
  if (canvasBounds === null)
    throw new Error('The canvas SVG is unavailable for Boundary authoring.');
  const firstPoint = {
    x: canvasBounds.x + canvasBounds.width * 0.2,
    y: canvasBounds.y + canvasBounds.height * 0.2,
  };
  await page.mouse.click(firstPoint.x, firstPoint.y);
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.76,
    canvasBounds.y + canvasBounds.height * 0.3,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.48,
    canvasBounds.y + canvasBounds.height * 0.76,
  );
  await expect(page.getByRole('button', { name: 'Cancel Boundary' })).toBeVisible();
  await page.mouse.click(firstPoint.x + 3, firstPoint.y + 3);
  await expect(rows).toHaveCount(beforeFreeform + 1);
  await expect(page.getByLabel('Layer inspector')).toContainText('Freeform Boundary');
  await expect(
    rows.first().getByRole('textbox', { name: /Layer name Freeform Boundary/u }),
  ).toBeVisible();

  const beforeDoubleClickBoundary = await rows.count();
  await page.getByRole('button', { name: 'Draw Boundary' }).click();
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.18,
    canvasBounds.y + canvasBounds.height * 0.7,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.4,
    canvasBounds.y + canvasBounds.height * 0.32,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.72,
    canvasBounds.y + canvasBounds.height * 0.7,
  );
  await page.mouse.dblclick(
    canvasBounds.x + canvasBounds.width * 0.48,
    canvasBounds.y + canvasBounds.height * 0.82,
  );
  await expect(rows).toHaveCount(beforeDoubleClickBoundary + 1);
  await expect(page.getByLabel('Layer inspector')).toContainText('Freeform Boundary');

  await page.getByRole('button', { name: 'Export' }).focus();
  await page.keyboard.press('Enter');
  const exportPanel = page.getByRole('region', { name: 'Portable export' });
  await expect(exportPanel).toBeFocused();

  const sceneDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download scene JSON' }).click();
  const sceneDownload = await sceneDownloadEvent;
  expect(sceneDownload.suggestedFilename()).toBe('texture-lab-v0.3.scene.json');
  const scenePath = await sceneDownload.path();
  if (scenePath === null) throw new Error('Scene JSON download has no readable path.');
  const sceneJson = await readFile(scenePath, 'utf8');
  expect(JSON.parse(sceneJson)).toMatchObject({ schemaVersion: '0.3.1' });

  const svgDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const svgDownload = await svgDownloadEvent;
  expect(svgDownload.suggestedFilename()).toBe('texture-lab-v0.3.svg');
  const svgPath = await svgDownload.path();
  if (svgPath === null) throw new Error('SVG download has no readable path.');
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('data-scene-render-ir-version="scene-render-ir-v0.3"');
  expect(svg).toContain('data-scene-group-id=');
  expect(svg).not.toContain('<script');

  const cssDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const cssDownload = await cssDownloadEvent;
  expect(cssDownload.suggestedFilename()).toBe('texture-lab-v0.3.css');
  const cssPath = await cssDownload.path();
  if (cssPath === null) throw new Error('CSS download has no readable path.');
  const css = await readFile(cssPath, 'utf8');
  expect(css).toContain('aspect-ratio:');
  expect(css).toContain('background-image: url("data:image/svg+xml,');
  expect(css).toContain('background-size: cover');
  await expectFreshResponsiveEmbed(page, css, 'cover');

  await page.getByLabel('Framing').selectOption('fit');
  const fitCssDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const fitCssDownload = await fitCssDownloadEvent;
  const fitCssPath = await fitCssDownload.path();
  if (fitCssPath === null) throw new Error('Fit CSS download has no readable path.');
  const fitCss = await readFile(fitCssPath, 'utf8');
  expect(fitCss).toContain('background-size: contain');
  await expectFreshResponsiveEmbed(page, fitCss, 'contain');

  const importedLayerCount = await rows.count();
  await page.getByLabel('Import scene JSON').setInputFiles({
    name: 'round-trip.scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from(sceneJson),
  });
  await expect(exportPanel.getByRole('status')).toContainText('Scene imported');
  await expect(rows).toHaveCount(importedLayerCount);
  await page.getByLabel('Import scene JSON').setInputFiles({
    name: 'invalid.scene.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":"not-v0.3"}'),
  });
  await expect(exportPanel.getByRole('status')).toContainText('Import rejected');
  await expect(rows).toHaveCount(importedLayerCount);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(layerRows(page)).toHaveCount(importedLayerCount);

  const accessibility = await page.evaluate(() => {
    const unlabelledControls = [...document.querySelectorAll('button, input, select')]
      .filter((element) => !(element instanceof HTMLInputElement && element.type === 'hidden'))
      .filter((element) => {
        const label =
          element.getAttribute('aria-label') ??
          element.getAttribute('title') ??
          element.textContent?.trim() ??
          '';
        return (
          label.length === 0 && !(element instanceof HTMLInputElement && element.labels?.length)
        );
      })
      .map((element) => element.outerHTML);
    const frame = document.querySelector<HTMLElement>('.scene-artboard__frame');
    const bounds = frame?.getBoundingClientRect();
    const hit =
      bounds === undefined
        ? null
        : document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return {
      unlabelledControls,
      canvasHit: hit?.closest('[data-scene-artboard]') !== null,
      svgHasAccessibleName:
        document.querySelector('[data-scene-artboard] svg[role="img"][aria-labelledby]') !== null,
    };
  });
  expect(accessibility.unlabelledControls).toEqual([]);
  expect(accessibility.canvasHit).toBe(true);
  expect(accessibility.svgHasAccessibleName).toBe(true);
  await page.getByRole('button', { name: 'Draw Boundary' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveAccessibleName(/Glow|Band|Arc|Orb/u);
  await expectNoAxeViolations(page);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('v0.3 supports remix, reframe, layered selection, and safe Boundary editing', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Choose Aurora wave starter' }).focus();
  await page.keyboard.press('Enter');
  const rows = layerRows(page);
  const originalLayerCount = await rows.count();

  const sky = page.getByLabel('Sky palette color');
  const originalSky = await sky.inputValue();
  await page.getByRole('button', { name: 'Remix palette' }).click();
  await expect(sky).not.toHaveValue(originalSky);

  const positionX = page.getByRole('spinbutton', { name: 'Position X' });
  const scale = page.getByRole('spinbutton', { name: 'Scale X (%)' });
  const beforeRatioPosition = await positionX.inputValue();
  const beforeReframeScale = await scale.inputValue();
  await page.getByRole('button', { name: '21:9', exact: true }).click();
  await expect(positionX).toHaveValue(beforeRatioPosition);
  await page.getByRole('button', { name: 'Reframe visible content' }).click();
  await expect(scale).not.toHaveValue(beforeReframeScale);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(scale).toHaveValue(beforeReframeScale);
  await page.getByRole('button', { name: '1:1', exact: true }).click();

  await page.getByRole('button', { name: /^Glow\b/u }).focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(originalLayerCount + 1);
  await expect(rows.first().getByRole('button', { name: /Select Glow/u })).toBeVisible();
  await page.getByRole('button', { name: 'Use White #FFFFFF', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Fill color')).toHaveValue('#ffffff');

  await page.getByRole('button', { name: /^Orb\b/u }).click();
  await expect(rows).toHaveCount(originalLayerCount + 2);
  await expect(rows.first().getByRole('button', { name: /Select Orb/u })).toBeVisible();

  await page.getByRole('button', { name: /Select Glow/u }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Layer inspector').getByRole('heading')).toHaveText(/Glow/u);
  const glowRow = rows.filter({
    has: page.getByRole('button', { name: /Select Glow/u }),
  });
  await glowRow.getByRole('button', { name: 'Move layer down' }).focus();
  await page.keyboard.press('Enter');
  await glowRow.getByRole('button', { name: 'Move layer up' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Select Orb/u }).click();
  const canvasImage = compositionCanvas(page).getByRole('img', {
    name: /Texture Lab composition/u,
  });
  const canvasBounds = await canvasImage.boundingBox();
  if (canvasBounds === null) throw new Error('The canvas SVG is unavailable for layer selection.');
  await page.keyboard.down('Alt');
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.keyboard.up('Alt');
  await expect(page.getByLabel('Layer inspector').getByRole('heading')).toHaveText(/Orb/u);

  const beforeBoundary = await rows.count();
  await page.getByRole('button', { name: 'Draw Boundary' }).click();
  const firstPoint = {
    x: canvasBounds.x + canvasBounds.width * 0.22,
    y: canvasBounds.y + canvasBounds.height * 0.2,
  };
  await page.mouse.click(firstPoint.x, firstPoint.y);
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.76,
    canvasBounds.y + canvasBounds.height * 0.3,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.48,
    canvasBounds.y + canvasBounds.height * 0.76,
  );
  await page.locator('.scene-artboard__svg').focus();
  await page.keyboard.press('Enter');
  await expect(rows).toHaveCount(beforeBoundary + 1);
  await page.getByRole('button', { name: 'Edit Boundary' }).click();
  const corners = page.getByRole('button', { name: /^Boundary corner /u });
  await expect(corners).toHaveCount(3);

  await page.locator('.scene-artboard__boundary-segment').first().hover();
  await page.getByRole('button', { name: 'Insert Boundary corner after corner 1' }).click();
  await expect(corners).toHaveCount(4);
  const corner = page.getByRole('button', { name: 'Boundary corner 2' });
  const cornerBounds = await corner.boundingBox();
  if (cornerBounds === null) throw new Error('Boundary corner is unavailable for dragging.');
  const beforeDrag = await compositionCanvas(page).screenshot({
    animations: 'disabled',
    caret: 'hide',
  });
  await page.mouse.move(
    cornerBounds.x + cornerBounds.width / 2,
    cornerBounds.y + cornerBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    cornerBounds.x + cornerBounds.width / 2 + 18,
    cornerBounds.y + cornerBounds.height / 2 + 12,
    { steps: 3 },
  );
  await page.mouse.up();
  const afterDrag = await compositionCanvas(page).screenshot({
    animations: 'disabled',
    caret: 'hide',
  });
  expect(afterDrag.equals(beforeDrag)).toBe(false);
  await corner.click();
  await page.getByRole('button', { name: 'Remove selected Boundary point' }).click();
  await expect(corners).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(corners).toHaveCount(4);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(corners).toHaveCount(3);
  await page.getByRole('button', { name: 'Boundary corner 1' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit Boundary' })).toBeVisible();

  await page.getByRole('button', { name: 'Draw Boundary' }).click();
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.12,
    canvasBounds.y + canvasBounds.height * 0.12,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.86,
    canvasBounds.y + canvasBounds.height * 0.84,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.12,
    canvasBounds.y + canvasBounds.height * 0.84,
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width * 0.86,
    canvasBounds.y + canvasBounds.height * 0.12,
  );
  await expect(
    page.getByText(
      'That segment would cross or touch the existing Boundary. Choose another point.',
    ),
  ).toBeVisible();
  await expect(rows).toHaveCount(beforeBoundary + 1);
  await page.getByRole('button', { name: 'Cancel Boundary' }).focus();
  await page.keyboard.press('Enter');

  await expectNoAxeViolations(page);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('v0.3 starter gallery produces six distinct visible compositions', async ({ page }) => {
  const starters = [
    ['cloud-drift', 'Cloud drift'],
    ['aurora-wave', 'Aurora wave'],
    ['satin-orb', 'Satin orb'],
    ['sunset-paper', 'Sunset paper'],
    ['sea-glass', 'Sea glass'],
    ['violet-ribbons', 'Violet ribbons'],
  ] as const;

  await page.goto('/', { waitUntil: 'networkidle' });
  const artboard = page.locator('.scene-artboard__frame');

  for (const [id, label] of starters) {
    await page.getByRole('button', { name: `Choose ${label} starter` }).click();
    await expect(layerRows(page)).toHaveCount(3);
    await expect(artboard).toHaveScreenshot(`v0.3-starter-${id}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  }
});
