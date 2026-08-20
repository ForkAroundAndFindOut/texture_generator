import { useEffect, useRef, useState } from 'react';

import type { ColorValue, Component, ComponentId, ResolvedComponentColor } from '../../domain';
import type { ColorPatch } from '../../editor';
import { QUICK_COLOR_SWATCHES } from './colorSwatches';

export type ColorControlsProps = {
  readonly base: ColorValue;
  readonly component?: Component | null;
  readonly componentColor?: ResolvedComponentColor;
  readonly onBaseChange: (patch: ColorPatch) => void;
  readonly onComponentChange: (componentId: ComponentId, patch: ColorPatch) => void;
};

type ColorEditorProps = {
  readonly id: string;
  readonly label: string;
  readonly value: ColorValue;
  readonly onChange: (patch: ColorPatch) => void;
};

const isCanonicalHex = (value: string): boolean => /^#[0-9a-fA-F]{6}$/u.test(value);

/** A synchronized picker, hex field, slider, and numeric opacity control. */
function ColorEditor({ id, label, value, onChange }: ColorEditorProps) {
  const [hexDraft, setHexDraft] = useState(value.hex);
  const [opacityDraft, setOpacityDraft] = useState(value.opacity.toString());
  const [error, setError] = useState<string | undefined>(undefined);
  const editingHex = useRef(false);
  const editingOpacity = useRef(false);

  useEffect(() => {
    if (!editingHex.current) setHexDraft(value.hex);
    if (!editingOpacity.current) setOpacityDraft(Number(value.opacity.toFixed(6)).toString());
  }, [value.hex, value.opacity]);

  function commitHex(): void {
    editingHex.current = false;
    if (!isCanonicalHex(hexDraft)) {
      setHexDraft(value.hex);
      setError('Use a six-digit hex color such as #5B8CFF.');
      return;
    }
    setError(undefined);
    onChange({ hex: hexDraft.toUpperCase() });
  }

  function commitOpacity(rawValue: string): void {
    const opacity = Number(rawValue);
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      setError('Opacity must be a number from 0 to 1.');
      return;
    }
    setError(undefined);
    onChange({ opacity });
  }

  function finishOpacity(): void {
    editingOpacity.current = false;
    const opacity = Number(opacityDraft);
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      setOpacityDraft(Number(value.opacity.toFixed(6)).toString());
      setError('Opacity must be a number from 0 to 1.');
      return;
    }
    setError(undefined);
    onChange({ opacity });
  }

  return (
    <div className="color-controls__editor">
      <label className="color-controls__field" htmlFor={`${id}-picker`}>
        <span>{label}</span>
        <input
          id={`${id}-picker`}
          type="color"
          value={value.hex}
          onChange={(event) => onChange({ hex: event.currentTarget.value.toUpperCase() })}
        />
      </label>
      <label className="color-controls__field" htmlFor={`${id}-hex`}>
        <span>Hex</span>
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          spellCheck={false}
          maxLength={7}
          aria-label={`${label} hex`}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          value={hexDraft}
          onFocus={() => {
            editingHex.current = true;
          }}
          onChange={(event) => setHexDraft(event.currentTarget.value)}
          onBlur={commitHex}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              editingHex.current = false;
              setHexDraft(value.hex);
              setError(undefined);
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <div className="color-controls__field color-controls__field--opacity">
        <label htmlFor={`${id}-opacity-range`}>Opacity</label>
        <div className="color-controls__opacity-inputs">
          <input
            id={`${id}-opacity-range`}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={value.opacity}
            onChange={(event) => onChange({ opacity: Number(event.currentTarget.value) })}
          />
          <input
            id={`${id}-opacity`}
            type="number"
            inputMode="decimal"
            min={0}
            max={1}
            step={0.01}
            aria-label={`${label} opacity`}
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : `${id}-error`}
            value={opacityDraft}
            onFocus={() => {
              editingOpacity.current = true;
            }}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setOpacityDraft(next);
              commitOpacity(next);
            }}
            onBlur={finishOpacity}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                editingOpacity.current = false;
                setOpacityDraft(Number(value.opacity.toFixed(6)).toString());
                setError(undefined);
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>
      <div className="color-controls__swatches" role="group" aria-label={`${label} quick colors`}>
        <span>Quick colors</span>
        <div>
          {QUICK_COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              className="color-controls__swatch"
              aria-label={`Use ${swatch.name} ${swatch.hex}`}
              aria-pressed={value.hex.toUpperCase() === swatch.hex}
              title={`${swatch.name} ${swatch.hex}`}
              style={{ backgroundColor: swatch.hex }}
              onClick={() => onChange({ hex: swatch.hex })}
            />
          ))}
        </div>
      </div>
      {error === undefined ? null : (
        <small id={`${id}-error`} className="color-controls__error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function ColorControls({
  base,
  component,
  componentColor,
  onBaseChange,
  onComponentChange,
}: ColorControlsProps) {
  return (
    <aside className="color-controls" aria-label="Color and opacity">
      <h2>Color and opacity</h2>
      {component === null || component === undefined || componentColor === undefined ? (
        <p>Select a Field or Band to assign a color while the canvas stays visible.</p>
      ) : (
        <fieldset>
          <legend>{component.name}</legend>
          <p className="color-controls__source">
            {componentColor.source === 'palette'
              ? `Palette-linked${componentColor.paletteLabel ? `: ${componentColor.paletteLabel}` : ''}. Editing makes this layer local.`
              : 'Local layer color.'}
          </p>
          <ColorEditor
            id={`lite-component-color-${component.id}`}
            label="Layer color"
            value={componentColor.value}
            onChange={(patch) => onComponentChange(component.id, patch)}
          />
        </fieldset>
      )}

      <fieldset>
        <legend>Canvas</legend>
        <ColorEditor
          id="lite-base-color"
          label="Canvas color"
          value={base}
          onChange={onBaseChange}
        />
        <p className="color-controls__source">Canvas: 1200 × 800 px</p>
      </fieldset>
    </aside>
  );
}

export default ColorControls;
