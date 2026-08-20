# Texture Lab v0.3 — Usage Guide

Texture Lab is a composition canvas for responsive, vector-native textures. A design is a stack of colors, boundaries, transforms, and material settings—not a fixed-size image.

## Start in one minute

1. Choose a starter such as **Cloud drift**, **Aurora wave**, **Satin orb**, or **Sunset paper**. Choose **Blank** when you want to build the composition yourself.
2. Set the artboard ratio for the target: `1:1`, `2:1`, `1:2`, `4:3`, `16:9`, or `21:9`.
3. Add a visual gesture, then tune its material in the right-hand controls.
4. Export Scene JSON, SVG, or responsive CSS when the composition is ready.

Every new layer is added at the front of the layer stack, so it appears above existing artwork by default.

## Artboard and framing

The artboard changes the visible viewport, not the stored artwork. Your geometry and layer transforms remain intact when you change ratios.

- **Cover** fills the host area and may crop the edges.
- **Fit** preserves the entire design inside the host area.

Example: for a wide website hero, choose `21:9` and **Cover**. The same exported source will still scale cleanly when the hero becomes narrower.

## Start with visual gestures

The first choices in **Visual gestures** are intended to create attractive texture quickly.

| Gesture           | Good for                                                |
| ----------------- | ------------------------------------------------------- |
| **Glow**          | Broad soft light, mist, and background color fields.    |
| **Band**          | Directional waves, light sweeps, and editorial stripes. |
| **Arc**           | Rings, curved accents, and halo fragments.              |
| **Orb**           | A concentrated highlight or soft dimensional accent.    |
| **Draw Boundary** | A custom, straight-sided filled silhouette.             |

The expandable menus also contain common 2D shapes plus 2D silhouettes named Cube, Sphere, Cylinder, Cone, Pyramid, and Prism. Those silhouettes are flat graphic bodies; Texture Lab does not rotate 3D objects.

## Work with layers

The Layers panel is ordered with the frontmost layer at the top.

- Click a layer to select it.
- Drag the visible layer on the canvas to move it directly.
- Use **Position X**, **Position Y**, **Scale**, and **Rotation** for precise adjustment.
- Use **Hide**, the arrow controls, **Copy**, or **Remove** to organize the composition.
- Use **Undo** and **Redo** for completed edits; a direct canvas drag is one undoable action.

Example: add a Glow, drag it toward the upper right, then add a Band. The Band appears above the Glow automatically. Move it down only when you deliberately want the Glow to sit on top.

## Material: color, softness, and blend behavior

Each selected layer has Material controls.

- **Fill color** creates a custom local color for that layer.
- **Quick colors** provide dependable starting colors. **White** is always available.
- **Palette colors** link the layer to a named scene swatch; changing that swatch updates linked layers.
- **Opacity** controls the layer’s strength.
- **Edge fade** softens outward from the boundary while keeping a solid interior. It is a boundary fade, not a center-radial gradient.
- **Bloom** adds soft light beyond the boundary.
- **Surface grain** adds deterministic Grain, Paper, or Film texture.

For a radial or misty field, start with **Glow** or **Orb** and then adjust Edge fade and Bloom. For a clean geometric body, begin with a 2D shape or a drawn Boundary and use a lower Edge fade.

### Interaction modes

Interaction describes how a layer contributes to the layers below it.

| Interaction       | Use it when                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| **Paint**         | You want normal colored paint and ordinary translucent overlap.                                          |
| **Glow**          | You want light or a bright highlight.                                                                    |
| **Shade**         | You want shadow and depth.                                                                               |
| **Texture**       | You want subtle surface character without aggressive color takeover.                                     |
| **Keep base hue** | You want the underlying hue to remain recognizable while the new layer contributes lightness or texture. |
| **Colorize**      | You want the new layer’s hue and saturation while retaining underlying lightness.                        |

Example — preserve green while adding red texture:

1. Make the canvas or an underlying field green.
2. Add a Band or Boundary and set its Fill color to red.
3. Set **Interaction** to **Keep base hue**.
4. Adjust Opacity and Edge fade until the overlap reads as green texture/light rather than a muddy red-green mix.

Choose **Paint** or **Colorize** instead when you want the red to take over visually.

## Draw a custom Boundary

**Draw Boundary** is a simple point-to-point tool, closer to measuring a route than to drawing with a pen.

1. Select **Draw Boundary**.
2. Click the canvas to place straight-line corners.
3. Place at least three points. The latest point previews a line toward the pointer.
4. Click near the highlighted first point to close the shape exactly at that starting point.
5. Refine the resulting layer with Fill, Opacity, Edge fade, Bloom, and Interaction.

Boundaries are intentionally one solid body:

- They accept **3–64 points**.
- Straight segments cannot cross or touch non-adjacent segments.
- Repeated corners and zero-area shapes are rejected.
- Use **Remove last point** while drawing, **Cancel Boundary**, or `Escape` while the canvas is focused to abandon a draft.

Example: draw a three-point wedge across the lower left of an Aurora composition, close it at the first point, choose White, set a low Opacity, and apply **Glow** for a frosted light accent.

## Canvas and palette

The **Canvas & palette** panel controls the base color and the named palette entries.

- Use **Canvas color** or Canvas quick colors to set the opaque background.
- Edit a named palette swatch to update every layer linked to it.
- Use a local Fill color when a layer should not change with later palette edits.

Example: begin with **Sea glass**, make the canvas a deeper teal, and change the `Bloom` palette swatch to a pale mint. Any layer linked to Bloom updates together.

## Portable export and import

Select **Export** in the header to reveal the Portable export panel without leaving the canvas view.

| Option                  | What it is for                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Download scene JSON** | A complete editable Texture Lab design. Load it later to continue editing.                                              |
| **Download SVG**        | A standalone vector image with paths, colors, filters, and layer order.                                                 |
| **Download CSS**        | A responsive CSS rule that uses the same SVG source and preserves the artboard aspect ratio.                            |
| **Copy CSS**            | Copy the responsive CSS rule directly to the clipboard.                                                                 |
| **Load scene JSON**     | Validate and replace the current design with a saved Scene JSON file. Invalid files leave the current design unchanged. |

None of these formats turns the design into an authoritative raster image. The scene JSON stores normalized coordinates and material parameters; SVG uses scalable paths and transforms; CSS sizes the same vector source to its host element.

Example — website hero:

1. Set the artboard to `21:9` and choose **Cover**.
2. Build the composition with a starter, a Glow, and one soft Band.
3. Download CSS and apply the generated `.texture-lab-scene` rule to a container on the site.
4. Keep the downloaded Scene JSON with the project so the art direction remains editable.

## Deliberate v0.3 limits

Texture Lab v0.3 does not include raster PNG/JPEG export, freehand curves, self-intersecting or multi-body paths, boolean geometry, shader/WebGL effects, animation, liquid distortion, or true 3D rotation. The fixed 3D-named choices are 2D visual silhouettes.

These limits keep the canvas fast, understandable, and portable: one responsive vector composition can be edited and rendered at many screen sizes.
