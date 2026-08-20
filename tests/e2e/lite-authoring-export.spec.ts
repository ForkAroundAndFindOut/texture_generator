import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const preview = (page: Page) => page.getByRole('region', { name: 'Texture preview' });
const layerRows = (page: Page) => page.locator('ol[aria-label="Layers"] > li');
const layerRow = (page: Page, componentId: string) =>
  page.locator(`ol[aria-label="Layers"] > li[data-component-id="${componentId}"]`);

const distRoot = resolve('dist');
let staticServer: Server | undefined;

test.beforeAll(async () => {
  staticServer = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1:4173').pathname;
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const target = resolve(distRoot, relativePath);
    if (target !== distRoot && !target.startsWith(`${distRoot}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const body = await readFile(target);
      const contentType =
        extname(target) === '.css'
          ? 'text/css; charset=utf-8'
          : extname(target) === '.js'
            ? 'text/javascript; charset=utf-8'
            : extname(target) === '.svg'
              ? 'image/svg+xml'
              : 'text/html; charset=utf-8';
      response.writeHead(200, { 'Content-Type': contentType }).end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    staticServer!.once('error', reject);
    staticServer!.listen(4173, '127.0.0.1', resolveListen);
  });
});

test.afterAll(async () => {
  const server = staticServer;
  staticServer = undefined;
  if (server === undefined) return;
  server.closeAllConnections();
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error === undefined ? resolveClose() : reject(error)));
  });
});

async function nonBasePixelsFromDataImage(page: Page, source: string): Promise<number> {
  return page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await new Promise<void>((resolveImage, rejectImage) => {
      image.addEventListener('load', () => resolveImage(), { once: true });
      image.addEventListener('error', () => rejectImage(new Error('export image failed to load')), {
        once: true,
      });
    });
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('2D export test context is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 0;
      const green = pixels[index + 1] ?? 0;
      const blue = pixels[index + 2] ?? 0;
      const alpha = pixels[index + 3] ?? 0;
      // The journey sets #101820 as the base. Count pixels visibly unlike it.
      if (alpha > 0 && Math.abs(red - 16) + Math.abs(green - 24) + Math.abs(blue - 32) > 30)
        count += 1;
    }
    return count;
  }, source);
}

/** Assert an authoring action changed the rendered canvas, not merely recipe state. */
async function expectPreviewPixelsToChange(page: Page, action: () => Promise<void>): Promise<void> {
  const before = await preview(page).screenshot({ animations: 'disabled', caret: 'hide' });
  await action();
  const after = await preview(page).screenshot({ animations: 'disabled', caret: 'hide' });
  expect(after.equals(before)).toBe(false);
}

test('development surface is styled, canvas-sized, and console-clean at port 5173', async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Texture Lab' })).toBeVisible();
  await expect(preview(page)).toHaveAttribute('data-selected-component-id', /cmp_/u);
  await expect(page.locator('[data-selection-overlay]')).toBeVisible();

  const layout = await page.evaluate(() => {
    const field = document.querySelector('[data-layer-kind="field"] path');
    const canvas = document.querySelector('.preview-surface');
    const sidebar = document.querySelector('.editor-sidebar');
    const inspector = document.querySelector('.editor-panels');
    if (
      !(field instanceof SVGPathElement) ||
      canvas === null ||
      sidebar === null ||
      inspector === null
    ) {
      throw new Error('v0.2 workspace landmarks are unavailable');
    }
    const fieldBounds = field.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    return {
      display: getComputedStyle(document.querySelector('.editor-layout')!).display,
      stylesheetCount: document.styleSheets.length,
      bodyHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
      fieldWidth: fieldBounds.width,
      fieldHeight: fieldBounds.height,
      canvasWidth: canvasBounds.width,
      canvasHeight: canvasBounds.height,
      sidebarVisible: sidebar.getBoundingClientRect().width > 200,
      inspectorVisible: inspector.getBoundingClientRect().width > 300,
    };
  });

  expect(layout.display).toBe('grid');
  expect(layout.stylesheetCount).toBeGreaterThan(0);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.fieldWidth).toBeGreaterThan(300);
  expect(layout.fieldHeight).toBeGreaterThan(180);
  expect(layout.canvasWidth).toBeGreaterThan(520);
  expect(layout.canvasHeight).toBeGreaterThan(420);
  expect(layout.sidebarVisible).toBe(true);
  expect(layout.inspectorVisible).toBe(true);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expect(page).toHaveScreenshot('texture-lab-workspace.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
  await page.close();
});

test('authors a clickable textured gradient and renders downloaded SVG/CSS', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Texture Lab' })).toBeVisible();
  await expect(preview(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add shape' })).toBeVisible();

  const rows = layerRows(page);
  const initialCount = await rows.count();
  await page.getByRole('button', { name: 'Add Soft Field' }).click();
  const addedFieldId = await preview(page).getAttribute('data-selected-component-id');
  expect(addedFieldId).toMatch(/^cmp_/u);
  const visualField = page.locator(`[data-layer-id="${addedFieldId}"] path`);
  const visualFieldBounds = await visualField.boundingBox();
  if (visualFieldBounds === null) throw new Error('Added Field is not visibly rendered.');
  await page.mouse.click(
    visualFieldBounds.x + visualFieldBounds.width / 2,
    visualFieldBounds.y + visualFieldBounds.height / 2,
  );
  await expect(preview(page)).toHaveAttribute('data-selected-component-id', addedFieldId!);
  await page.getByRole('button', { name: 'Add Diagonal Band' }).click();
  const addedBandId = await preview(page).getAttribute('data-selected-component-id');
  expect(addedBandId).toMatch(/^cmp_/u);
  await expect(rows).toHaveCount(initialCount + 2);

  const visualBand = page.locator(`[data-layer-id="${addedBandId}"] path`);
  const visualBandBounds = await visualBand.boundingBox();
  if (visualBandBounds === null) throw new Error('Added Band is not visibly rendered.');
  await page.mouse.click(
    visualBandBounds.x + visualBandBounds.width / 2,
    visualBandBounds.y + visualBandBounds.height / 2,
  );
  await expect(preview(page)).toHaveAttribute('data-selected-component-id', addedBandId!);

  const positionX = page.getByRole('spinbutton', { name: 'Position X' });
  const positionY = page.getByRole('spinbutton', { name: 'Position Y' });
  const translatedBandBounds = await visualBand.boundingBox();
  if (translatedBandBounds === null) throw new Error('Selected Band cannot be dragged.');
  const directXBefore = await positionX.inputValue();
  const directYBefore = await positionY.inputValue();
  await page.mouse.move(
    translatedBandBounds.x + translatedBandBounds.width / 2,
    translatedBandBounds.y + translatedBandBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    translatedBandBounds.x + translatedBandBounds.width / 2 + 60,
    translatedBandBounds.y + translatedBandBounds.height / 2 + 24,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(positionX).not.toHaveValue(directXBefore);
  await expect(positionY).not.toHaveValue(directYBefore);

  const positionBefore = await positionX.inputValue();
  await positionX.fill('0.27');
  await positionX.press('Enter');
  const transformHash = await preview(page).getAttribute('data-canonical-recipe-hash');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(positionX).not.toHaveValue('0.27');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(positionX).toHaveValue('0.27');
  await expect(preview(page)).toHaveAttribute('data-canonical-recipe-hash', transformHash!);
  expect(positionBefore).not.toBe('0.27');

  await expectPreviewPixelsToChange(page, async () => {
    await positionY.fill('0.34');
    await positionY.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const width = page.getByRole('spinbutton', { name: 'Width' });
    await width.fill('0.94');
    await width.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const height = page.getByRole('spinbutton', { name: 'Height' });
    await height.fill('0.28');
    await height.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const rotation = page.getByRole('spinbutton', { name: 'Rotation' });
    await rotation.fill('18');
    await rotation.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const scale = page.getByRole('spinbutton', { name: 'Scale' });
    await scale.fill('0.86');
    await scale.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    await page.getByRole('slider', { name: 'Taper' }).press('End');
  });
  await expectPreviewPixelsToChange(page, async () => {
    await page.getByLabel('End cap').selectOption('flat');
  });

  await expectPreviewPixelsToChange(page, async () => {
    await page.getByLabel('Layer color', { exact: true }).fill('#5b8cff');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const hex = page.getByLabel('Layer color hex');
    await hex.fill('#7dd3fc');
    await hex.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    await page
      .getByRole('group', { name: 'Layer color quick colors' })
      .getByRole('button', { name: 'Use Mint #22AA88' })
      .click();
  });
  await expect(page.getByLabel('Layer color', { exact: true })).toHaveValue('#22aa88');
  await expectPreviewPixelsToChange(page, async () => {
    await page.getByLabel('Layer color opacity').fill('0.44');
    await page.getByLabel('Layer color opacity').press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const softness = page.getByRole('spinbutton', { name: 'Softness' });
    await softness.fill('0.3');
    await softness.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const highlight = page.getByRole('spinbutton', { name: 'Highlight' });
    await highlight.fill('0.8');
    await highlight.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const grain = page.getByRole('spinbutton', { name: 'Grain' });
    await grain.fill('0.18');
    await grain.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    const asymmetry = page.getByRole('spinbutton', { name: 'Asymmetry' });
    await asymmetry.fill('0.4');
    await asymmetry.press('Enter');
  });
  await expectPreviewPixelsToChange(page, async () => {
    await page.getByLabel('Canvas color', { exact: true }).fill('#101820');
  });

  const blendMode = page.getByLabel('Blend mode');
  const blendScreenshots = new Set<string>();
  for (const blend of ['normal', 'multiply', 'screen', 'overlay', 'soft-light']) {
    await blendMode.selectOption(blend);
    blendScreenshots.add(
      (await preview(page).screenshot({ animations: 'disabled' })).toString('base64'),
    );
  }
  expect(blendScreenshots.size).toBe(5);
  await blendMode.selectOption('multiply');

  const scaleBefore = await page.getByRole('spinbutton', { name: 'Scale' }).inputValue();
  const scaleHandle = page.locator('[data-canvas-handle="scale"]');
  const scaleBox = await scaleHandle.boundingBox();
  if (scaleBox === null) throw new Error('Selected layer has no scale handle.');
  await page.mouse.move(scaleBox.x + scaleBox.width / 2, scaleBox.y + scaleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    scaleBox.x + scaleBox.width / 2 - 36,
    scaleBox.y + scaleBox.height / 2 - 26,
    {
      steps: 4,
    },
  );
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Scale' })).not.toHaveValue(scaleBefore);

  const rotationBefore = await page.getByRole('spinbutton', { name: 'Rotation' }).inputValue();
  const rotateHandle = page.locator('[data-canvas-handle="rotate"]');
  const rotateBox = await rotateHandle.boundingBox();
  if (rotateBox === null) throw new Error('Selected layer has no rotation handle.');
  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rotateBox.x + rotateBox.width / 2 + 35,
    rotateBox.y + rotateBox.height / 2 + 15,
    {
      steps: 4,
    },
  );
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: 'Rotation' })).not.toHaveValue(rotationBefore);

  const addedFieldRow = layerRow(page, addedFieldId!);
  await addedFieldRow.getByRole('button', { name: /Select /u }).click();
  await page.getByRole('button', { name: 'Edit anchors' }).click();
  const anchors = page.locator('[data-canvas-handle="anchor"]');
  const anchorCount = await anchors.count();
  const anchorSegment = page.locator('[data-canvas-handle="anchor-segment"]').first();
  const anchorSegmentBox = await anchorSegment.boundingBox();
  if (anchorSegmentBox === null) throw new Error('A Field contour segment is not clickable.');
  await page.mouse.click(
    anchorSegmentBox.x + anchorSegmentBox.width / 2,
    anchorSegmentBox.y + anchorSegmentBox.height / 2,
  );
  await expect(anchors).toHaveCount(anchorCount + 1);
  const selectedAnchor = page.locator('.anchor-overlay__handle.is-selected');
  const selectedAnchorBox = await selectedAnchor.boundingBox();
  if (selectedAnchorBox === null) throw new Error('New Field anchor is not clickable.');
  await page.mouse.move(
    selectedAnchorBox.x + selectedAnchorBox.width / 2,
    selectedAnchorBox.y + selectedAnchorBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    selectedAnchorBox.x + selectedAnchorBox.width / 2 + 12,
    selectedAnchorBox.y + selectedAnchorBox.height / 2 + 8,
    { steps: 3 },
  );
  await page.mouse.up();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(anchors).toHaveCount(anchorCount);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(anchors).toHaveCount(anchorCount + 1);

  const nameInput = page.getByLabel('Layer name', { exact: true });
  await nameInput.fill('Aurora field');
  await nameInput.press('Enter');
  await expect(addedFieldRow.locator('input:not([type="color"])')).toHaveValue('Aurora field');
  await addedFieldRow.getByRole('button', { name: 'Hide layer' }).click();
  await expect(addedFieldRow.getByRole('button', { name: 'Show layer' })).toBeVisible();
  await addedFieldRow.getByRole('button', { name: 'Show layer' }).click();

  const addedBandRow = layerRow(page, addedBandId!);
  const zBefore = await addedBandRow.getAttribute('data-z-order');
  await addedBandRow.getByRole('button', { name: 'Move layer down' }).click();
  await expect.poll(() => addedBandRow.getAttribute('data-z-order')).not.toBe(zBefore);
  await addedBandRow.getByRole('button', { name: 'Duplicate layer' }).click();
  await expect(rows).toHaveCount(initialCount + 3);
  const duplicateId = await preview(page).getAttribute('data-selected-component-id');
  expect(duplicateId).toMatch(/^cmp_/u);
  const duplicateRow = layerRow(page, duplicateId!);
  await duplicateRow.getByRole('button', { name: 'Remove layer' }).click();
  await expect(rows).toHaveCount(initialCount + 2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(initialCount + 3);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(rows).toHaveCount(initialCount + 2);

  const canvasSvg = preview(page).locator('svg');
  const canvasBox = await canvasSvg.boundingBox();
  if (canvasBox === null)
    throw new Error('Canvas SVG is unavailable for empty-canvas selection clearing.');
  await page.mouse.click(canvasBox.x + 12, canvasBox.y + 12);
  await expect(preview(page)).not.toHaveAttribute('data-selected-component-id');
  await expect(page.getByLabel('Layer inspector')).toContainText('Select a Field or Band');

  await addedBandRow.getByRole('button', { name: /Select /u }).click();
  const rotation = page.getByRole('spinbutton', { name: 'Rotation' });
  await rotation.fill('999');
  await expect(page.getByRole('alert')).toContainText('Use -180 to 179 degrees.');
  await rotation.blur();
  await expect(rotation).not.toHaveValue('999');

  const svgDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const svgDownload = await svgDownloadEvent;
  expect(svgDownload.suggestedFilename()).toBe('texture-lab.svg');
  const svgPath = await svgDownload.path();
  if (svgPath === null) throw new Error('SVG download has no readable path.');
  const svg = await readFile(svgPath, 'utf8');
  expect(svg).toContain('stop-color="#22AA88"');
  expect(svg).toContain('mix-blend-mode:multiply');
  expect(svg).toContain('in="SourceGraphic"');
  expect(svg).not.toContain('data-selection-overlay');
  expect(svg).not.toContain('<script');

  const cssDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  const cssDownload = await cssDownloadEvent;
  expect(cssDownload.suggestedFilename()).toBe('texture-lab.css');
  const cssPath = await cssDownload.path();
  if (cssPath === null) throw new Error('CSS download has no readable path.');
  const css = await readFile(cssPath, 'utf8');
  expect(css).toContain('data:image/svg+xml,');
  expect(css).toContain('%2322AA88');
  expect(css).toContain('background-size: cover');

  await page.getByRole('button', { name: 'Copy CSS' }).click();
  await expect(page.locator('.export-panel__status')).toContainText(/CSS/u);

  const svgPage = await browser.newPage({ viewport: { width: 760, height: 520 } });
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await svgPage.setContent(
    `<img id="exported-svg" alt="Exported texture" width="720" height="480" src="${svgDataUrl}">`,
  );
  await expect(svgPage.getByRole('img', { name: 'Exported texture' })).toBeVisible();
  expect(await nonBasePixelsFromDataImage(svgPage, svgDataUrl)).toBeGreaterThan(10_000);

  const cssPage = await browser.newPage({ viewport: { width: 760, height: 520 } });
  const fixtureHtml = await readFile(resolve('tests/e2e/fixtures/export-host.html'), 'utf8');
  await cssPage.setContent(fixtureHtml);
  await cssPage.locator('#texture-export-style').evaluate((style, cssText) => {
    style.textContent = cssText;
  }, css);
  const cssFixture = cssPage.locator('.texture-lab-texture');
  await expect(cssFixture).toBeVisible();
  const backgroundImage = await cssFixture.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(backgroundImage).toContain('data:image/svg+xml,');
  const cssDataUrl = backgroundImage.match(/^url\(["']?(.*?)["']?\)$/u)?.[1];
  if (cssDataUrl === undefined)
    throw new Error('CSS fixture did not expose a renderable data URL.');
  expect(await nonBasePixelsFromDataImage(cssPage, cssDataUrl)).toBeGreaterThan(10_000);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  await svgPage.close();
  await cssPage.close();
});
