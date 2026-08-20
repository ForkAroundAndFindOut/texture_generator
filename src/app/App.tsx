import { useMemo } from 'react';

import { resolveComponentColor, type TextureRecipe } from '../domain';
import { compileRenderIR, serializeCss, serializeSvg, type RenderProfile } from '../renderers';
import { HistoryControls } from './components/HistoryControls';
import { PreviewSurface } from './components/PreviewSurface';
import { EditorLayout } from './layout/EditorLayout';
import { ColorControls } from './panels/ColorControls';
import { ComponentInspector } from './panels/ComponentInspector';
import { ComponentListPanel } from './panels/ComponentListPanel';
import { ExportPanel } from './panels/ExportPanel';
import { ShapePicker } from './panels/ShapePicker';
import { useLiteEditor } from './session/useLiteEditor';

export type AppProps = {
  readonly initialRecipe?: TextureRecipe;
  readonly className?: string;
};

const LITE_PROFILE: RenderProfile = {
  kind: 'render-profile',
  usage: 'component',
  width: 720,
  height: 480,
  fit: 'contain',
  inspectTiles: false,
  targetShape: 'landscape',
};

/** Standalone v0.2 clickable textured-gradient authoring composition. */
export function App({ initialRecipe, className }: AppProps) {
  const editor = useLiteEditor(initialRecipe);
  const previewComponent = editor.previewRecipe.components.find(
    (component) => component.id === editor.selectedComponentId,
  );
  const exportIr = useMemo(() => compileRenderIR(editor.recipe, LITE_PROFILE), [editor.recipe]);
  const svgText = useMemo(() => serializeSvg(exportIr), [exportIr]);
  const cssText = useMemo(() => serializeCss(exportIr, svgText), [exportIr, svgText]);

  const layerRail = (
    <>
      <ShapePicker onAddPreset={editor.addPreset} />
      <ComponentListPanel
        components={editor.recipe.components}
        selectedComponentIds={editor.selectedIds}
        onSelectComponents={editor.select}
        onDuplicateComponent={editor.duplicate}
        onRemoveComponent={editor.remove}
        onReorderComponent={editor.reorder}
        onReorderTo={editor.reorderTo}
        onRenameComponent={editor.rename}
        onToggleVisibility={editor.toggleVisibility}
        isComponentVisible={editor.isLayerVisible}
        colorForComponent={(component) => resolveComponentColor(editor.recipe, component).value.hex}
      />
    </>
  );

  return (
    <EditorLayout
      {...(className === undefined ? {} : { className })}
      sidebar={layerRail}
      preview={
        <PreviewSurface
          recipe={editor.previewRecipe}
          canonicalRecipeHash={editor.canonicalRecipeHash}
          profile={LITE_PROFILE}
          previewState={editor.history.openInteraction === undefined ? 'rendered' : 'rendering'}
          {...(previewComponent === undefined
            ? {}
            : { latestScale: previewComponent.transform.uniformScale })}
          {...(editor.selectedComponentId === undefined
            ? {}
            : { selectedComponentId: editor.selectedComponentId })}
          {...(editor.selectedAnchorId === undefined
            ? {}
            : { selectedAnchorId: editor.selectedAnchorId })}
          anchorEditMode={editor.anchorEditMode}
          onSelectComponent={(id) => editor.select([id])}
          onSelectAnchor={editor.selectAnchor}
          onInsertAnchor={editor.insertAnchor}
          onClearSelection={editor.clearSelection}
          onGesture={editor.applyPreviewGesture}
        />
      }
      panels={
        <>
          <ComponentInspector
            component={editor.selectedComponent ?? null}
            {...(editor.selectedComponentColor === undefined
              ? {}
              : { componentColor: editor.selectedComponentColor.value.hex })}
            anchorEditMode={editor.anchorEditMode}
            {...(editor.selectedAnchorId === undefined
              ? {}
              : { selectedAnchorId: editor.selectedAnchorId })}
            {...(editor.feedback === undefined ? {} : { feedback: editor.feedback })}
            onGestureInput={editor.updateInspector}
            onGestureEnd={editor.finishGesture}
            onGestureCancel={editor.cancelGesture}
            onBlendModeChange={editor.updateBlend}
            onBandShapeChange={editor.updateBandShape}
            onNameChange={editor.rename}
            onDuplicate={editor.duplicate}
            onRemove={editor.remove}
            onResetTransform={editor.resetTransform}
            onAnchorEditModeChange={editor.setAnchorEditing}
            onAddAnchor={editor.addAnchor}
            onRemoveAnchor={editor.removeAnchor}
          />
          <ColorControls
            base={editor.recipe.base.value}
            component={editor.selectedComponent ?? null}
            {...(editor.selectedComponentColor === undefined
              ? {}
              : { componentColor: editor.selectedComponentColor })}
            onBaseChange={editor.updateBaseColor}
            onComponentChange={editor.updateComponentColor}
          />
          <ExportPanel
            svgText={svgText}
            cssText={cssText}
            width={LITE_PROFILE.width}
            height={LITE_PROFILE.height}
          />
        </>
      }
      headerActions={
        <HistoryControls
          depth={editor.history.pointer}
          canUndo={editor.history.pointer > 0}
          canRedo={editor.history.pointer < editor.history.entries.length}
          onUndo={editor.undo}
          onRedo={editor.redo}
        />
      }
      onExport={() => {
        const panel = document.getElementById('texture-lab-export-panel');
        panel?.scrollIntoView({ block: 'nearest' });
        panel?.focus();
      }}
      previewStatus={
        editor.feedback !== undefined
          ? 'Needs attention'
          : editor.history.openInteraction === undefined
            ? 'Preview live'
            : 'Updating preview'
      }
      sessionStatus={
        <p>
          {editor.feedback ?? 'Drag a selected layer, then refine its color, texture, and blend.'}
        </p>
      }
    />
  );
}

export default App;
