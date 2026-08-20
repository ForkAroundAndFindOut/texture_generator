import type { GroupId, SceneGroup } from '../../domain';
import type { SceneLayerTransformPatch } from '../../editor';

export type SceneLayerInspectorProps = {
  readonly group?: SceneGroup;
  readonly onUpdateTransform: (groupId: GroupId, patch: SceneLayerTransformPatch) => void;
};

type NumericControlProps = {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onCommit: (value: number) => void;
};

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

/** Deliberately focused transform inspector; material controls arrive alongside palette controls. */
export function SceneLayerInspector({ group, onUpdateTransform }: SceneLayerInspectorProps) {
  if (group === undefined) {
    return (
      <section className="scene-layer-inspector" aria-label="Layer inspector">
        <p className="editor-eyebrow">Layer controls</p>
        <h2>Select a layer</h2>
        <p>Click a layer in the rail or on the artboard to move and refine it.</p>
      </section>
    );
  }
  return (
    <section className="scene-layer-inspector" aria-label="Layer inspector">
      <p className="editor-eyebrow">Layer controls</p>
      <h2>{group.name}</h2>
      <p>
        Set a precise composition transform. Material color, blend, and edge controls follow below.
      </p>
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
    </section>
  );
}

export default SceneLayerInspector;
