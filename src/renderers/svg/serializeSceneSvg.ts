import type { MatrixIR, PathIR } from '../shared/ir';
import type {
  SceneMaterialRenderIR,
  SceneRenderGroupIR,
  SceneRenderIR,
  SceneRenderNodeIR,
} from '../shared/sceneIr';
import { serializePathCommands } from './pathSerializer';

export type SceneSvgSerializationOptions = {
  readonly title?: string;
  readonly description?: string;
};

const number = (value: number): string => {
  if (!Number.isFinite(value)) throw new RangeError('Scene SVG values must be finite.');
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
  'matrix(' +
  number(value.a) +
  ' ' +
  number(value.b) +
  ' ' +
  number(value.c) +
  ' ' +
  number(value.d) +
  ' ' +
  number(value.e) +
  ' ' +
  number(value.f) +
  ')';

const materialPath = (material: SceneMaterialRenderIR): string =>
  escapeXml(serializePathCommands(material.path.commands));

const materialTransform = (material: SceneMaterialRenderIR): string => matrix(material.path.matrix);

const materialIds = (material: SceneMaterialRenderIR) => ({
  edge: material.definitionId + '-edge',
  bloom: material.definitionId + '-bloom',
  grain: material.definitionId + '-grain',
});

function grainSeed(value: number): number {
  return Math.abs(value % 10_000) + 1;
}

function serializeMaterialDefinitions(material: SceneMaterialRenderIR): string {
  const ids = materialIds(material);
  const definitions: string[] = [];
  if (material.edgeFeather > 0) {
    const deviation = Math.max(0.001, material.edgeFeather * 0.04);
    definitions.push(
      '<filter id="' +
        escapeXml(ids.edge) +
        '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' +
        number(deviation) +
        '"/></filter>',
    );
  }
  if (material.bloom > 0) {
    const deviation = Math.max(0.001, material.bloom * 0.1);
    definitions.push(
      '<filter id="' +
        escapeXml(ids.bloom) +
        '" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="' +
        number(deviation) +
        '"/></filter>',
    );
  }
  if (material.grain !== undefined && material.grain.amount > 0) {
    definitions.push(
      '<filter id="' +
        escapeXml(ids.grain) +
        '" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="' +
        number(0.25 + material.grain.scale * 0.75) +
        '" numOctaves="2" seed="' +
        grainSeed(material.grain.seed) +
        '" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="grain"/><feComponentTransfer in="grain" result="grain-alpha"><feFuncA type="table" tableValues="0 ' +
        number(material.grain.amount) +
        '"/></feComponentTransfer><feBlend in="SourceGraphic" in2="grain-alpha" mode="soft-light" result="textured"/><feComposite in="textured" in2="SourceGraphic" operator="in"/></filter>',
    );
  }
  return definitions.join('');
}

function corePath(material: SceneMaterialRenderIR): string {
  const grain = material.grain;
  const grainFilter =
    grain === undefined || grain.amount === 0
      ? ''
      : ' filter="url(#' + escapeXml(materialIds(material).grain) + ')"';
  return (
    '<path d="' +
    materialPath(material) +
    '" transform="' +
    materialTransform(material) +
    '" fill="' +
    material.color +
    '"' +
    grainFilter +
    '/>'
  );
}

function bloomPath(material: SceneMaterialRenderIR): string {
  if (material.bloom === 0) return '';
  return (
    '<path data-material-bloom="true" d="' +
    materialPath(material) +
    '" transform="' +
    materialTransform(material) +
    '" fill="' +
    material.color +
    '" fill-opacity="' +
    number(Math.min(1, 0.25 + material.bloom * 0.75)) +
    '" filter="url(#' +
    escapeXml(materialIds(material).bloom) +
    ')"/>'
  );
}

function featherPath(material: SceneMaterialRenderIR): string {
  if (material.edgeFeather === 0) return '';
  return (
    '<path data-material-feather="true" d="' +
    materialPath(material) +
    '" transform="' +
    materialTransform(material) +
    '" fill="none" stroke="' +
    material.color +
    '" stroke-width="' +
    number(material.edgeFeather * 0.22) +
    '" stroke-opacity="' +
    number(Math.min(1, 0.4 + material.edgeFeather * 0.6)) +
    '" filter="url(#' +
    escapeXml(materialIds(material).edge) +
    ')"/>'
  );
}

function serializeMaterial(material: SceneMaterialRenderIR): string {
  const hidden = material.visible ? '' : ' display="none"';
  return (
    '<g id="' +
    escapeXml(material.definitionId) +
    '" data-scene-node-kind="material" data-scene-material-id="' +
    escapeXml(material.id) +
    '" data-interaction="' +
    escapeXml(material.interaction) +
    '" style="isolation:isolate;mix-blend-mode:' +
    material.blendMode +
    '" opacity="' +
    number(material.opacity) +
    '"' +
    hidden +
    '>' +
    bloomPath(material) +
    featherPath(material) +
    corePath(material) +
    '</g>'
  );
}

function serializeNode(node: SceneRenderNodeIR): string {
  return node.kind === 'group' ? serializeGroup(node) : serializeMaterial(node);
}

function serializeGroup(group: SceneRenderGroupIR): string {
  const hidden = group.visible ? '' : ' display="none"';
  return (
    '<g id="scene-group-' +
    escapeXml(group.id) +
    '" data-scene-node-kind="group" data-scene-group-id="' +
    escapeXml(group.id) +
    '"' +
    hidden +
    '>' +
    group.children.map(serializeNode).join('') +
    '</g>'
  );
}

/**
 * Serialize the shared SceneRenderIR as standalone script-free vector SVG.
 * Geometry remains paths plus matrices; there is no raster backing asset.
 */
export function serializeSceneSvg(
  ir: SceneRenderIR,
  options: SceneSvgSerializationOptions = {},
): string {
  const title = escapeXml(options.title ?? 'Texture Lab v0.3 scene');
  const description = escapeXml(
    options.description ?? 'Responsive vector texture exported from Texture Lab.',
  );
  const titleId = 'scene-title-' + ir.sceneId;
  const descriptionId = 'scene-description-' + ir.sceneId;
  const definitions = ir.materials.map(serializeMaterialDefinitions).join('');
  const viewBox = ir.artboard.viewBox;

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    number(viewBox.width) +
    '" height="' +
    number(viewBox.height) +
    '" viewBox="' +
    number(viewBox.minX) +
    ' ' +
    number(viewBox.minY) +
    ' ' +
    number(viewBox.width) +
    ' ' +
    number(viewBox.height) +
    '" preserveAspectRatio="' +
    ir.artboard.preserveAspectRatio +
    '" role="img" aria-labelledby="' +
    escapeXml(titleId) +
    ' ' +
    escapeXml(descriptionId) +
    '" data-scene-render-ir-version="' +
    ir.version +
    '"><title id="' +
    escapeXml(titleId) +
    '">' +
    title +
    '</title><desc id="' +
    escapeXml(descriptionId) +
    '">' +
    description +
    '</desc>' +
    (definitions.length === 0 ? '' : '<defs>' + definitions + '</defs>') +
    '<rect data-scene-background="true" x="' +
    number(viewBox.minX) +
    '" y="' +
    number(viewBox.minY) +
    '" width="' +
    number(viewBox.width) +
    '" height="' +
    number(viewBox.height) +
    '" fill="' +
    ir.background +
    '"/>' +
    ir.rootGroups.map(serializeGroup).join('') +
    '</svg>\n'
  );
}

export type { PathIR };
