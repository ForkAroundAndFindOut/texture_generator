import type { SceneV03 } from '../domain';
import { HistoryControls } from './components/HistoryControls';
import { SceneArtboard } from './components/SceneArtboard';
import { EditorLayout } from './layout/EditorLayout';
import { SceneArtboardControls } from './panels/SceneArtboardControls';
import { SceneExportPanel } from './panels/SceneExportPanel';
import { SceneLayerInspector } from './panels/SceneLayerInspector';
import { SceneLayerPanel } from './panels/SceneLayerPanel';
import { ScenePalettePanel } from './panels/ScenePalettePanel';
import { SceneShapeLibrary } from './panels/SceneShapeLibrary';
import { SceneStarterGallery } from './panels/SceneStarterGallery';
import { useSceneEditor } from './session/useSceneEditor';

export type AppProps = {
  /** Optional valid v0.3 source document for an embedded/editor-hosted session. */
  readonly initialScene?: SceneV03;
  readonly className?: string;
};

/** Texture Lab v0.3: a responsive vector composition canvas, not a shape dragger. */
export function App({ initialScene, className }: AppProps) {
  const editor = useSceneEditor(initialScene);
  const saveStatus =
    editor.persistence.kind === 'cached' ? 'Saved locally' : 'Local save needs attention';

  return (
    <EditorLayout
      {...(className === undefined ? {} : { className })}
      authoring={
        <SceneArtboardControls
          ratio={editor.scene.artboard.ratio}
          fitMode={editor.scene.artboard.fitMode}
          onRatioChange={(ratio) => editor.updateArtboard({ ratio })}
          onFitModeChange={(fitMode) => editor.updateArtboard({ fitMode })}
        />
      }
      sidebar={
        <>
          <SceneStarterGallery onChooseStarter={editor.chooseStarter} />
          <SceneShapeLibrary
            onAddShape={editor.addShape}
            freeformActive={editor.freeformDraft !== undefined}
            freeformPointCount={editor.freeformDraft?.points.length ?? 0}
            onBeginFreeform={editor.beginFreeform}
            onCancelFreeform={editor.cancelFreeform}
            onUndoFreeformPoint={editor.undoFreeformPoint}
          />
          <SceneLayerPanel
            groups={editor.scene.rootGroups}
            {...(editor.selectedGroupId === undefined
              ? {}
              : { selectedGroupId: editor.selectedGroupId })}
            onSelect={editor.selectGroup}
            onRename={editor.rename}
            onSetVisibility={editor.setVisibility}
            onReorder={editor.reorder}
            onDuplicate={editor.duplicate}
            onRemove={editor.remove}
          />
        </>
      }
      preview={
        <SceneArtboard
          scene={editor.scene}
          {...(editor.selectedGroupId === undefined
            ? {}
            : { selectedGroupId: editor.selectedGroupId })}
          onSelectGroup={editor.selectGroup}
          onClearSelection={editor.clearSelection}
          onDrag={editor.applyCanvasDrag}
          {...(editor.freeformDraft === undefined ? {} : { freeformDraft: editor.freeformDraft })}
          onFreeformPoint={editor.placeFreeformPoint}
          onFreeformHover={editor.hoverFreeform}
          onCancelFreeform={editor.cancelFreeform}
        />
      }
      panels={
        <>
          <SceneLayerInspector
            {...(editor.selectedGroup === undefined ? {} : { group: editor.selectedGroup })}
            {...(editor.selectedMaterial === undefined
              ? {}
              : { material: editor.selectedMaterial })}
            palette={editor.scene.palette}
            onUpdateTransform={editor.updateTransform}
            onUpdateMaterial={editor.updateMaterial}
          />
          <ScenePalettePanel
            background={editor.scene.background}
            palette={editor.scene.palette}
            onBackgroundChange={editor.updateBackground}
            onPaletteChange={editor.updatePaletteEntry}
          />
          <SceneExportPanel scene={editor.scene} onImportScene={editor.importScene} />
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
        if (typeof document === 'undefined') return;
        const panel = document.getElementById('texture-lab-export-panel');
        const inspector = panel?.closest<HTMLElement>('.editor-panels');
        if (
          panel !== null &&
          panel !== undefined &&
          inspector !== null &&
          inspector !== undefined
        ) {
          inspector.scrollTop =
            panel.getBoundingClientRect().top -
            inspector.getBoundingClientRect().top +
            inspector.scrollTop;
        }
        panel?.focus();
      }}
      previewStatus={`${editor.scene.rootGroups.length} layers · ${saveStatus}`}
      sessionStatus={
        <p>
          {editor.feedback ??
            (editor.restored
              ? 'Restored your saved composition. Choose a layer to continue shaping it.'
              : 'Start with a composition or add a gesture. Every new layer lands on top.')}
        </p>
      }
    />
  );
}

export default App;
