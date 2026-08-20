import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { AnchorId, ComponentId, Field, TextureRecipe } from '../../domain';
import {
  compileRenderIR,
  DomSvgRenderer,
  type ComponentLayerIR,
  type RenderIR,
  type RenderProfile,
} from '../../renderers';
import { AnchorOverlay } from './AnchorOverlay';
import { invertCanvasPoint } from './canvasGeometry';
import { SelectionOverlay } from './SelectionOverlay';

export type PreviewGestureKind = 'translate' | 'scale' | 'rotate' | 'anchor';

export type PreviewGesture = {
  readonly phase: 'start' | 'move' | 'end' | 'cancel';
  readonly kind: PreviewGestureKind;
  readonly componentId: ComponentId;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly pointX: number;
  readonly pointY: number;
  readonly anchorId?: AnchorId;
  /** Anchor drags are resolved by the preview against the source matrix. */
  readonly localPoint?: Readonly<{ x: number; y: number }>;
};

export type PreviewSurfaceProps = {
  readonly recipe: TextureRecipe;
  readonly canonicalRecipeHash: string;
  readonly profile?: RenderProfile;
  readonly previewState?: 'rendering' | 'rendered' | 'idle' | 'error';
  readonly latestScale?: number;
  readonly selectedComponentId?: ComponentId;
  readonly selectedAnchorId?: AnchorId;
  readonly anchorEditMode?: boolean;
  readonly onSelectComponent?: (componentId: ComponentId) => void;
  readonly onSelectAnchor?: (anchorId: AnchorId) => void;
  readonly onInsertAnchor?: (
    componentId: ComponentId,
    afterAnchorId: AnchorId,
    localPoint: Readonly<{ x: number; y: number }>,
  ) => void;
  readonly onClearSelection?: () => void;
  readonly onGesture?: (gesture: PreviewGesture) => void;
  readonly className?: string;
};

type ActivePointerGesture = {
  readonly kind: PreviewGestureKind;
  readonly componentId: ComponentId;
  readonly anchorId?: AnchorId;
  readonly originX: number;
  readonly originY: number;
};

const DEFAULT_PROFILE: RenderProfile = {
  kind: 'render-profile',
  usage: 'component',
  width: 720,
  height: 480,
  fit: 'contain',
  inspectTiles: false,
  targetShape: 'landscape',
};

const ZOOM_STEPS = [75, 100, 125, 150] as const;

const closestElement = (target: EventTarget | null, selector: string): Element | undefined =>
  target instanceof Element ? (target.closest(selector) ?? undefined) : undefined;

const componentLayerById = (
  ir: RenderIR | undefined,
  componentId: ComponentId | undefined,
): ComponentLayerIR | undefined => {
  if (ir === undefined || componentId === undefined) return undefined;
  const layer = ir.layers.find((entry) => entry.id === componentId);
  return layer?.kind === 'field' || layer?.kind === 'band' ? layer : undefined;
};

/**
 * The visual authoring surface. It owns no recipe state: pointer coordinates
 * are translated into clear gestures while the editor hook owns validation,
 * history grouping, and canonical design updates.
 */
export function PreviewSurface({
  recipe,
  canonicalRecipeHash,
  profile = DEFAULT_PROFILE,
  previewState = 'rendered',
  latestScale,
  selectedComponentId,
  selectedAnchorId,
  anchorEditMode = false,
  onSelectComponent,
  onSelectAnchor,
  onInsertAnchor,
  onClearSelection,
  onGesture,
  className,
}: PreviewSurfaceProps) {
  const compiled = useMemo<RenderIR | undefined>(() => {
    try {
      return compileRenderIR(recipe, profile);
    } catch {
      return undefined;
    }
  }, [profile, recipe]);
  const activeGesture = useRef<ActivePointerGesture | undefined>(undefined);
  const [zoom, setZoom] = useState<(typeof ZOOM_STEPS)[number]>(100);

  const selectedLayer = componentLayerById(compiled, selectedComponentId);
  const selectedField = recipe.components.find(
    (component): component is Field =>
      component.id === selectedComponentId && component.type === 'field',
  );
  const overlay =
    selectedLayer === undefined || compiled === undefined ? undefined : (
      <>
        <SelectionOverlay layer={selectedLayer} canvas={compiled.canvas} />
        {anchorEditMode && selectedLayer.kind === 'field' && selectedField !== undefined ? (
          <AnchorOverlay
            layer={selectedLayer}
            anchors={selectedField.contour.anchors}
            {...(selectedAnchorId === undefined ? {} : { selectedAnchorId })}
          />
        ) : null}
      </>
    );

  function canvasPoint(
    event: ReactPointerEvent<HTMLDivElement>,
  ): Readonly<{ x: number; y: number }> {
    const svg = event.currentTarget.querySelector('svg');
    const rect = svg?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    return {
      x: rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0,
      y: rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0,
    };
  }

  function emitGesture(
    event: ReactPointerEvent<HTMLDivElement>,
    phase: PreviewGesture['phase'],
  ): void {
    const active = activeGesture.current;
    if (active === undefined) return;
    const point = canvasPoint(event);
    const layer = componentLayerById(compiled, active.componentId);
    const localPoint =
      active.kind === 'anchor' && layer !== undefined && compiled !== undefined
        ? invertCanvasPoint(layer.path.matrix, {
            x: point.x * compiled.canvas.width,
            y: point.y * compiled.canvas.height,
          })
        : undefined;
    onGesture?.({
      phase,
      kind: active.kind,
      componentId: active.componentId,
      ...(active.anchorId === undefined ? {} : { anchorId: active.anchorId }),
      deltaX: point.x - active.originX,
      deltaY: point.y - active.originY,
      pointX: point.x,
      pointY: point.y,
      ...(localPoint === undefined ? {} : { localPoint }),
    });
  }

  function startGesture(
    event: ReactPointerEvent<HTMLDivElement>,
    kind: PreviewGestureKind,
    componentId: ComponentId,
    anchorId?: AnchorId,
  ): void {
    const point = canvasPoint(event);
    activeGesture.current = {
      kind,
      componentId,
      originX: point.x,
      originY: point.y,
      ...(anchorId === undefined ? {} : { anchorId }),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    emitGesture(event, 'start');
  }

  return (
    <div
      className={className ?? 'preview-surface__content'}
      role="region"
      aria-label="Texture preview"
      data-canonical-recipe-hash={canonicalRecipeHash}
      data-layer-order={compiled?.layers.map((layer) => layer.id).join(' ') ?? ''}
      data-preview-state={previewState}
      {...(latestScale === undefined ? {} : { 'data-latest-scale': latestScale.toFixed(2) })}
      {...(selectedComponentId === undefined
        ? {}
        : { 'data-selected-component-id': selectedComponentId })}
      onPointerDown={(event) => {
        if (event.button !== 0 || compiled === undefined) return;
        if (closestElement(event.target, '.preview-surface__toolbar') !== undefined) return;
        const handle = closestElement(event.target, '[data-canvas-handle]');
        const handleKind = handle?.getAttribute('data-canvas-handle');
        const handleComponentId = handle?.getAttribute('data-component-id') as ComponentId | null;
        if (
          handleComponentId !== null &&
          handleComponentId !== undefined &&
          handleKind === 'anchor-segment'
        ) {
          const afterAnchorId = handle?.getAttribute('data-after-anchor-id') as AnchorId | null;
          const layer = componentLayerById(compiled, handleComponentId);
          if (afterAnchorId === null || afterAnchorId === undefined || layer === undefined) return;
          const point = canvasPoint(event);
          const localPoint = invertCanvasPoint(layer.path.matrix, {
            x: point.x * compiled.canvas.width,
            y: point.y * compiled.canvas.height,
          });
          if (localPoint === undefined) return;
          onSelectComponent?.(handleComponentId);
          onInsertAnchor?.(handleComponentId, afterAnchorId, localPoint);
          event.preventDefault();
          return;
        }
        if (
          handleComponentId !== null &&
          handleComponentId !== undefined &&
          (handleKind === 'scale' || handleKind === 'rotate' || handleKind === 'anchor')
        ) {
          onSelectComponent?.(handleComponentId);
          if (handleKind === 'anchor') {
            const anchorId = handle?.getAttribute('data-anchor-id') as AnchorId | null;
            if (anchorId === null || anchorId === undefined) return;
            onSelectAnchor?.(anchorId);
            startGesture(event, 'anchor', handleComponentId, anchorId);
          } else {
            startGesture(event, handleKind, handleComponentId);
          }
          return;
        }

        const componentElement = closestElement(
          event.target,
          '[data-layer-kind="field"], [data-layer-kind="band"]',
        );
        const componentId = componentElement?.getAttribute('data-layer-id') as ComponentId | null;
        if (componentId === null || componentId === undefined) {
          onClearSelection?.();
          return;
        }
        onSelectComponent?.(componentId);
        if (componentId === selectedComponentId) startGesture(event, 'translate', componentId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) emitGesture(event, 'move');
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        emitGesture(event, 'end');
        event.currentTarget.releasePointerCapture(event.pointerId);
        activeGesture.current = undefined;
      }}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          emitGesture(event, 'cancel');
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activeGesture.current = undefined;
      }}
    >
      <div className="preview-surface__toolbar" role="group" aria-label="Canvas zoom">
        <button type="button" onClick={() => setZoom(100)}>
          Fit
        </button>
        <button type="button" onClick={() => setZoom(100)} aria-pressed={zoom === 100}>
          100%
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() =>
            setZoom((current) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(current) - 1)]!)
          }
          disabled={zoom === ZOOM_STEPS[0]}
        >
          −
        </button>
        <output aria-label="Canvas zoom level">{zoom}%</output>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() =>
            setZoom(
              (current) =>
                ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(current) + 1)]!,
            )
          }
          disabled={zoom === ZOOM_STEPS.at(-1)}
        >
          +
        </button>
      </div>
      <div className="preview-surface__viewport" data-zoom={zoom}>
        {compiled === undefined ? (
          <p role="status">Preview unavailable for this design.</p>
        ) : (
          <DomSvgRenderer
            ir={compiled}
            title="Texture preview"
            description="Live textured-gradient preview generated from the current design."
            overlay={overlay}
          />
        )}
      </div>
    </div>
  );
}

export default PreviewSurface;
