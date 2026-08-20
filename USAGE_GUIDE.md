# Texture Lab v0.3 Usage Guide

Texture Lab is a responsive vector composition canvas. A scene stores colors, straight-sided Boundaries, material settings, transforms, and layer order. It is not a fixed-size image: the same Scene JSON, SVG, or CSS output redraws at the host’s dimensions.

## Start a composition

1. Pick **Blank** or one of the six starter compositions: **Cloud drift**, **Aurora wave**, **Satin orb**, **Sunset paper**, **Sea glass**, or **Violet ribbons**.
2. Choose an Artboard ratio: `1:1`, `2:1`, `1:2`, `4:3`, `16:9`, or `21:9`.
3. Use **Visual gestures** to add material, then refine the selected layer in **Layer inspector**.

Example: choose **Cloud drift**, press **Remix palette**, add a **Band**, then lower its **Opacity** and raise its **Edge fade** for a soft editorial sweep.

## Artboard and responsive framing

The Artboard changes the visible viewport; changing ratio does not silently reposition or distort source geometry.

- **Cover** fills the target area and may crop at the edges.
- **Fit** shows the full composition inside the target area.
- **Reframe visible content** is the explicit, undoable way to fit visible geometry into the current Artboard with safe padding.
- **Undo** reverses a Reframe, ratio choice, drag, or other completed action. **Redo** restores it.

Example: begin in `1:1`, switch to `21:9`, inspect the crop, then choose **Reframe visible content** only if you want the artwork repositioned for that wide layout. Use **Undo** if you prefer the original coordinate placement.

## Add visual material

Every added layer is selected and placed frontmost automatically.

- **Glow** creates a broad soft light field.
- **Band** creates a directional sweep or wave.
- **Arc** creates a solid curved band or ring fragment.
- **Orb** creates a concentrated highlight with bloom.
- The expandable **2D shapes** section offers rounded rectangle, ellipse, triangle, polygon, star, ribbon, and blob.
- The expandable **3D-style silhouettes** section offers Cube, Sphere, Cylinder, Cone, Pyramid, and Prism as flat 2D shapes.

Example: add **Glow**, move it to the upper right, then add **Orb**. The Orb appears above the Glow immediately, giving a quick highlight-over-field composition.

## Arrange and select layers

The **Layers** panel is front-to-back: the top row is visually in front.

- Select a row with its circular select button or by clicking its row.
- Use **Hide**/**Show**, **Move layer up**, **Move layer down**, **Copy**, and **Remove** to arrange the stack.
- Drag a visible selected layer directly on the canvas to move it. A drag becomes one undoable action.
- Use **Position X**, **Position Y**, **Scale**, and **Rotation** in **Layer inspector** for precise changes.
- Alt/Option-click an overlapping area on the canvas to cycle through visible layers under the pointer. Repeated Alt/Option-clicks continue downward through obscured layers.

Example: after adding an Orb over a Glow, select **Glow** from **Layers**, then select **Orb** and Alt/Option-click the overlap to get back to the Glow without hiding the Orb.

## Color, softness, and blend behavior

The selected layer’s **Material** controls define how it contributes to the composition.

- **Fill color** sets a local color for just that material.
- **Fill quick colors** includes pinned **White**. Choosing **Use White #FFFFFF** is a local fill, so it does not consume or change a palette swatch.
- **Use palette color** links a material to a named palette swatch.
- **Opacity** controls material strength.
- **Edge fade** softens from the solid Boundary outward toward transparency.
- **Bloom** adds a soft luminous halo.
- **Surface grain** can be **None**, **Grain**, **Paper**, or **Film**; **Grain amount** and **Grain scale** tune it.

**Interaction mode** controls overlap behavior:

| Mode              | Use case                                                           |
| ----------------- | ------------------------------------------------------------------ |
| **Paint**         | Ordinary translucent colored paint.                                |
| **Glow**          | A screen-like brightening field or highlight.                      |
| **Shade**         | A multiply-like shadow field.                                      |
| **Texture**       | A restrained soft-light surface effect.                            |
| **Keep base hue** | Add lightness while keeping the hue below recognizable.            |
| **Colorize**      | Apply the new hue/saturation while retaining underlying lightness. |

Example — red texture over green: set the canvas or lower field to green, add a red Band or Boundary, choose **Keep base hue**, then tune **Opacity** and **Edge fade**. The overlap keeps a green reading more reliably than normal **Paint**. Use **Texture** for an even subtler effect, or **Colorize** when you want the red to take over.

## Canvas and palette

The **Canvas & palette** panel controls the opaque base and reusable scene swatches.

- **Canvas color** and its quick colors set the background behind all layers.
- Edit a named palette color to update every material linked to that swatch.
- **Remix palette** changes the scene’s linked palette colors together in one undoable action. It does not change the Canvas color or any local **Fill color** overrides.

Example: choose **Sea glass**, press **Remix palette**, then set one foreground material to **White**. The palette-linked fields change together while the white highlight remains fixed.

## Draw and edit a Boundary

**Draw Boundary** is a point-to-point straight-line tool, similar to placing route-measurement points.

1. Choose **Draw Boundary**.
2. Click to place corners. The current line previews toward the pointer.
3. After at least three points, close the body by clicking near the highlighted first point, pressing `Enter` while the canvas is focused, or double-clicking the final valid point.
4. Use **Remove last point**, **Cancel Boundary**, or `Escape` while the canvas is focused to abandon a draft.
5. The completed Boundary is added frontmost and selected.

To refine a completed Boundary, select its layer and press **Edit Boundary**.

- Drag a corner handle to move it.
- Click a `+` midpoint handle to insert a corner.
- Select a corner, then choose **Remove selected Boundary point**.
- Choose **Finish Boundary editing** or press `Escape` from a Boundary control to leave edit mode.

Boundaries are always one simple filled body: they use 3–64 points, close implicitly to the first point, and reject repeated points, zero-area shapes, and non-adjacent crossing or touching segments. A rejected edit leaves the last valid scene unchanged and explains why in the status message.

Example: draw a three-corner wedge across the lower left of **Aurora wave**, close it with `Enter`, choose **Use White #FFFFFF**, set **Interaction mode** to **Glow**, then choose **Edit Boundary** to insert one extra corner and turn the wedge into a gentle diagonal accent.

## Export, import, and use on a website

Use **Export** in the header to focus the **Portable export** panel without losing the canvas view.

| Control                                       | What it does                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Download scene JSON**                       | Saves the complete editable v0.3 scene.                                                 |
| **Download SVG**                              | Saves a standalone scalable vector drawing.                                             |
| **Download CSS**                              | Saves a responsive `.texture-lab-scene` CSS rule with an embedded vector source.        |
| **Copy CSS**                                  | Copies that responsive rule for quick site integration.                                 |
| **Load scene JSON** / **Import scene JSON**   | Validates and replaces the current scene. Invalid files leave the current scene intact. |
| **View responsive CSS** / **View scene JSON** | Lets you inspect the generated portable source before download.                         |

Example — website hero: choose `21:9`, set **Framing** to **Cover**, build with a starter plus a Glow and Band, then use **Download CSS**. Apply the exported `.texture-lab-scene` rule to the website container. Keep **Download scene JSON** beside the project so the art direction remains editable.

## v0.3 limits

V0.3 deliberately does not include raster PNG/JPEG export, freehand curves, multi-body or self-intersecting paths, boolean geometry, animation, shader/WebGL effects, liquid distortion, or true 3D rotation. Cube, Sphere, Cylinder, Cone, Pyramid, and Prism are editable 2D silhouettes. These boundaries keep textures fast to author, easy to understand, and portable across screen sizes.
