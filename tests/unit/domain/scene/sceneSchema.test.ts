import { describe, expect, it } from 'vitest';

import {
  canonicalSceneV03FileBytes,
  canonicalSceneV03String,
  createBlankSceneV03,
  createDefaultRecipe,
  SceneV03ValidationError,
  validateSceneV03,
  type SceneMaterial,
  type SceneV03,
} from '../../../../src/domain/index.js';

const stableId = (prefix: 'grp' | 'mat' | 'pal', index: number): string =>
  prefix + '_' + String(index).padStart(26, '0');

function createSceneFixture(): SceneV03 {
  const scene = createBlankSceneV03();
  scene.rootGroups = [
    {
      kind: 'group',
      id: stableId('grp', 1),
      name: 'Soft orb',
      visible: true,
      transform: {
        translation: { x: 0.5, y: 0.5 },
        scale: { x: 1, y: 1 },
        rotationDeg: 0,
      },
      children: [
        {
          kind: 'material',
          id: stableId('mat', 1),
          name: 'Orb base',
          visible: true,
          geometry: {
            kind: 'boundary',
            boundary: {
              vertices: [
                { x: 0.2, y: 0.2 },
                { x: 0.8, y: 0.2 },
                { x: 0.5, y: 0.8 },
              ],
            },
          },
          fill: { kind: 'palette', paletteId: scene.palette[0]!.id },
          opacity: 0.72,
          edgeFeather: 0.25,
          bloom: 0.1,
          interaction: 'glow',
        },
      ],
    },
  ];
  return scene;
}

function diagnosticCodes(value: unknown): string[] {
  const result = validateSceneV03(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('v0.3 scene schema and canonical serialization', () => {
  it('validates a nested scene and serializes the same semantic document deterministically', () => {
    const scene = createSceneFixture();
    const reordered: SceneV03 = {
      rootGroups: scene.rootGroups,
      palette: scene.palette,
      background: scene.background,
      artboard: scene.artboard,
      id: scene.id,
      schemaVersion: scene.schemaVersion,
    };

    expect(validateSceneV03(scene)).toEqual({ ok: true });
    expect(canonicalSceneV03String(reordered)).toBe(canonicalSceneV03String(scene));
    expect(canonicalSceneV03FileBytes(scene).at(-1)).toBe(0x0a);
  });

  it('rejects invalid durable IDs, colors, artboard ratios, transforms, and palette references', () => {
    const invalidId = createSceneFixture();
    invalidId.rootGroups[0]!.id = 'invalid';
    expect(diagnosticCodes(invalidId)).toContain('invalid-id');

    const invalidColor = createSceneFixture();
    invalidColor.background = '#ff0';
    expect(diagnosticCodes(invalidColor)).toContain('invalid-color');

    const invalidRatio = createSceneFixture();
    (invalidRatio.artboard as { ratio: string }).ratio = '3:2';
    expect(diagnosticCodes(invalidRatio)).toContain('invalid-artboard-ratio');

    const invalidTransform = createSceneFixture();
    invalidTransform.rootGroups[0]!.transform.scale.x = 0;
    expect(diagnosticCodes(invalidTransform)).toContain('out-of-range-number');

    const invalidReference = createSceneFixture();
    const material = invalidReference.rootGroups[0]!.children[0] as SceneMaterial;
    material.fill = { kind: 'palette', paletteId: stableId('pal', 99) };
    expect(diagnosticCodes(invalidReference)).toContain('missing-palette-reference');
  });

  it('rejects group cycles and does not treat a v0.2 recipe as a v0.3 scene', () => {
    const cyclic = createSceneFixture();
    const root = cyclic.rootGroups[0]!;
    root.children.push(root);
    expect(diagnosticCodes(cyclic)).toContain('group-cycle');

    expect(diagnosticCodes(createDefaultRecipe())).toContain('unsupported-schema-version');
  });

  it('keeps the 0.3.1 transform format as an explicit breaking import boundary', () => {
    const legacy = createSceneFixture() as unknown as {
      schemaVersion: string;
      rootGroups: Array<{ transform: unknown }>;
    };
    legacy.schemaVersion = '0.3.0';
    legacy.rootGroups[0]!.transform = {
      translation: { x: 0.5, y: 0.5 },
      uniformScale: 1,
      rotationDeg: 0,
    };

    const codes = diagnosticCodes(legacy);
    expect(codes).toContain('unsupported-schema-version');
    expect(codes).toContain('missing-property');
    expect(codes).toContain('unknown-property');
  });

  it('rejects a self-crossing Boundary without accepting a damaged scene', () => {
    const invalid = createSceneFixture();
    const material = invalid.rootGroups[0]!.children[0] as SceneMaterial;
    material.geometry.boundary.vertices = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.8 },
    ];

    expect(diagnosticCodes(invalid)).toContain('self-intersection');
  });

  it('never serializes a document that fails validation', () => {
    const invalid = createSceneFixture();
    invalid.palette.pop();

    expect(() => canonicalSceneV03String(invalid)).toThrow(SceneV03ValidationError);
  });
});
