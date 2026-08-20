import type {
  GroupId,
  InteractionMode,
  SceneGroup,
  SceneMaterial,
  ScenePaletteEntry,
} from '../../domain';
import type { SceneLayerTransformPatch, SceneMaterialPatch } from '../../editor';
import { SCENE_QUICK_COLORS } from './sceneQuickColors';

export type SceneLayerInspectorProps = {
  readonly group?: SceneGroup;
  readonly material?: SceneMaterial;
  readonly palette: readonly ScenePaletteEntry[];
  readonly onUpdateTransform: (groupId: GroupId, patch: SceneLayerTransformPatch) => void;
  readonly onUpdateMaterial: (materialId: string, patch: SceneMaterialPatch) => void;
  readonly boundaryEditing: boolean;
  readonly selectedBoundaryVertexIndex?: number;
  readonly onToggleBoundaryEdit: () => void;
  readonly onRemoveBoundaryVertex: () => void;
};

type NumericControlProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onCommit: (value: number) => void;
};

const INTERACTIONS: readonly Readonly<{
  value: InteractionMode;
  label: string;
  description: string;
}>[] = [
  { value: 'paint', label: 'Paint', description: 'Normal color paint over the layers below.' },
  {
    value: 'glow',
    label: 'Glow',
    description: 'Screen-like light that brightens the composition.',
  },
  {
    value: 'shade',
    label: 'Shade',
    description: 'Multiply-like shading that deepens the composition.',
  },
  {
    value: 'texture',
    label: 'Texture',
    description: 'Soft-light texture that keeps the field subtle.',
  },
  {
    value: 'keep-base-hue',
    label: 'Keep base hue',
    description: 'Adds the material’s lightness while retaining the underlying hue.',
  },
  {
    value: 'colorize',
    label: 'Colorize',
    description: 'Applies hue and saturation while retaining lightness.',
  },
];

function NumericControl({ label, value, min, max, step, onCommit }: NumericControlProps) {
  return (
    <label className="scene-layer-inspector__control">
      <span>{label}</span>
      <input
        key={`${label}-${value}`}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') event.currentTarget.value = String(value);
        }}
      />
    </label>
  );
}

type RangeControlProps = {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
};

function RangeControl({ label, value, onChange }: RangeControlProps) {
  return (
    <label className="scene-layer-inspector__range">
      <span>
        {label}
        <output>{Math.round(value * 100)}%</output>
      </span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function materialColor(material: SceneMaterial, palette: readonly ScenePaletteEntry[]): string {
  const fill = material.fill;
  if (fill.kind === 'local') return fill.color;
  return palette.find((entry) => entry.id === fill.paletteId)?.color ?? '#FFFFFF';
}

/** Transform and material controls share one selected layer so the workflow stays in one place. */
export function SceneLayerInspector({
  group,
  material,
  palette,
  onUpdateTransform,
  onUpdateMaterial,
  boundaryEditing,
  selectedBoundaryVertexIndex,
  onToggleBoundaryEdit,
  onRemoveBoundaryVertex,
}: SceneLayerInspectorProps) {
  if (group === undefined || material === undefined) {
    return (
      <section className="scene-layer-inspector" aria-label="Layer inspector">
        <p className="editor-eyebrow">Layer controls</p>
        <h2>Select a layer</h2>
        <p>Click a layer in the rail or drag it on the artboard to move and refine it.</p>
      </section>
    );
  }
  const interaction = INTERACTIONS.find((entry) => entry.value === material.interaction);
  const grain = material.grain;
  const fillColor = materialColor(material, palette);
  const update = (patch: SceneMaterialPatch): void => onUpdateMaterial(material.id, patch);

  return (
    <section className="scene-layer-inspector" aria-label="Layer inspector">
      <p className="editor-eyebrow">Layer controls</p>
      <h2>{group.name}</h2>
      <p>Drag on the canvas for a direct move, or use precise controls below.</p>
      <fieldset>
        <legend>Transform</legend>
        <NumericControl
          label="Position X"
          value={group.transform.translation.x}
          min={-2}
          max={3}
          step={0.01}
          onCommit={(value) => onUpdateTransform(group.id, { translation: { x: value } })}
        />
        <NumericControl
          label="Position Y"
          value={group.transform.translation.y}
          min={-2}
          max={3}
          step={0.01}
          onCommit={(value) => onUpdateTransform(group.id, { translation: { y: value } })}
        />
        <NumericControl
          label="Scale"
          value={group.transform.uniformScale}
          min={0.05}
          max={4}
          step={0.01}
          onCommit={(value) => onUpdateTransform(group.id, { uniformScale: value })}
        />
        <NumericControl
          label="Rotation"
          value={group.transform.rotationDeg}
          min={-180}
          max={180}
          step={1}
          onCommit={(value) => onUpdateTransform(group.id, { rotationDeg: value })}
        />
      </fieldset>
      <fieldset>
        <legend>Material</legend>
        <label className="scene-layer-inspector__color">
          <span>Fill color</span>
          <input
            aria-label="Fill color"
            type="color"
            value={fillColor}
            onChange={(event) =>
              update({ fill: { kind: 'local', color: event.currentTarget.value } })
            }
          />
        </label>
        <div className="scene-layer-inspector__quick" role="group" aria-label="Fill quick colors">
          {SCENE_QUICK_COLORS.map((color) => (
            <button
              key={color.hex}
              type="button"
              aria-label={`Use ${color.name} ${color.hex}`}
              title={`${color.name} ${color.hex}`}
              style={{ background: color.hex }}
              onClick={() => update({ fill: { kind: 'local', color: color.hex } })}
            />
          ))}
        </div>
        <div className="scene-layer-inspector__palette" role="group" aria-label="Use palette color">
          {palette.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={
                material.fill.kind === 'palette' && material.fill.paletteId === entry.id
              }
              onClick={() => update({ fill: { kind: 'palette', paletteId: entry.id } })}
            >
              <span style={{ background: entry.color }} aria-hidden="true" />
              {entry.name}
            </button>
          ))}
        </div>
        <RangeControl
          label="Opacity"
          value={material.opacity}
          onChange={(opacity) => update({ opacity })}
        />
        <RangeControl
          label="Edge fade"
          value={material.edgeFeather}
          onChange={(edgeFeather) => update({ edgeFeather })}
        />
        <RangeControl
          label="Bloom"
          value={material.bloom}
          onChange={(bloom) => update({ bloom })}
        />
      </fieldset>
      <fieldset>
        <legend>Boundary</legend>
        <button type="button" aria-pressed={boundaryEditing} onClick={onToggleBoundaryEdit}>
          {boundaryEditing ? 'Finish Boundary editing' : 'Edit Boundary'}
        </button>
        {boundaryEditing ? (
          <>
            <p className="scene-layer-inspector__hint">
              Drag a corner on the canvas. Click a midpoint to add a corner, then select a corner to
              remove it. The solid body cannot cross itself.
            </p>
            <button
              type="button"
              disabled={
                selectedBoundaryVertexIndex === undefined ||
                material.geometry.boundary.vertices.length <= 3
              }
              onClick={onRemoveBoundaryVertex}
            >
              Remove selected Boundary point
            </button>
          </>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Interaction</legend>
        <label className="scene-layer-inspector__select">
          <span>Blend behavior</span>
          <select
            aria-label="Interaction mode"
            value={material.interaction}
            onChange={(event) =>
              update({ interaction: event.currentTarget.value as InteractionMode })
            }
          >
            {INTERACTIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <p className="scene-layer-inspector__hint">{interaction?.description}</p>
      </fieldset>
      <fieldset>
        <legend>Surface grain</legend>
        <label className="scene-layer-inspector__select">
          <span>Overlay</span>
          <select
            aria-label="Grain overlay"
            value={grain?.kind ?? 'none'}
            onChange={(event) => {
              const kind = event.currentTarget.value;
              update(
                kind === 'none'
                  ? { grain: undefined }
                  : {
                      grain: {
                        kind: kind as NonNullable<SceneMaterial['grain']>['kind'],
                        amount: grain?.amount ?? 0.08,
                        scale: grain?.scale ?? 0.42,
                        seed: grain?.seed ?? 1,
                      },
                    },
              );
            }}
          >
            <option value="none">None</option>
            <option value="grain">Grain</option>
            <option value="paper">Paper</option>
            <option value="film">Film</option>
          </select>
        </label>
        {grain === undefined ? null : (
          <>
            <RangeControl
              label="Grain amount"
              value={grain.amount}
              onChange={(amount) => update({ grain: { ...grain, amount } })}
            />
            <RangeControl
              label="Grain scale"
              value={grain.scale}
              onChange={(scale) => update({ grain: { ...grain, scale } })}
            />
          </>
        )}
      </fieldset>
    </section>
  );
}

export default SceneLayerInspector;
