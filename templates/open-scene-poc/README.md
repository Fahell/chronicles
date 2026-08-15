# Chronicles open-scene proof of concept

This is an isolated, one-shot HTML proof of concept for the **open variant of scene type C** (hybrid three.js + plugin images). It is not connected to the application and does not establish the final project stack.

> **Status: ✅ APPROVED by the owner.** This POC validated the hybrid scene
> idea in practice, and **type C was approved as the primary scene format**
> (`vn-rpg-spec.md` §3.8). Type A (pure image) remains a usable fallback for
> selected moments but still carries open floor/scale challenges (§3.6).

## Composition

The prototype tests a two-layer scene:

1. `pixel_art_Pixel-art_ground_tex.jpeg` is mapped to a horizontal Three.js plane as the walkable ground.
2. `pixel_art_Wide_frontal_backgro.jpeg` is mapped to a distant vertical backdrop plane.
3. Placeholder actors are rendered as camera-facing planes so their apparent scale can be compared at different depths.

The background and ground are intentionally separate. The purpose is to inspect whether a real 3D floor can provide more reliable character scale while the generated image supplies the distant landscape.

## Controls

- Move `PLAYER` with `WASD` or the arrow keys.
- Adjust camera height and view pitch to inspect the floor/background junction.
- Adjust backdrop depth and height to align the landscape base with the 3D ground.
- Adjust backdrop scale to change the framing and apparent horizon position.
- Adjust ground depth and scale to test the usable area and texture projection.
- Adjust field of view to compare perspective compression and character scale.
- Toggle debug guides to show the floor grid and backdrop guide.
- Hide or show the placeholder actors.
- Minimize the diagnostics panel when it obstructs the scene.
- Use `Reset` to restore the preferred initial test arrangement.

## Local asset mapping

The HTML references the generated assets from the parent `templates/` directory:

- `../pixel_art_Pixel-art_ground_tex.jpeg`
- `../pixel_art_Wide_frontal_backgro.jpeg`

Keep the files in that location when serving this folder locally.

## Preferred initial configuration

The initial values are based on the first visual test that produced the most useful composition:

- Camera height: `2.0`
- View pitch: `2.0`
- Backdrop depth: `-10.0`
- Ground scale: `0.70`
- Backdrop height: `6.3`
- Backdrop scale: `1.00`
- Ground depth: `-2.2`
- Field of view: `52`

These values are a diagnostic preset, not a final scene specification.

## Known limitations

- The generated ground image is a composition with rocks and a dark border, not a truly seamless tile texture. This prototype maps it once so the projection can be evaluated before deciding whether to regenerate or preprocess the asset.
- The generated background also contains a strip of foreground terrain. The diagnostic controls make the resulting overlap visible; a later iteration may crop, mask, or regenerate the lower edge.
- The actor sprites are procedural placeholders and are not production assets.
- Three.js `0.185.0` is loaded as an ES module from jsDelivr only for this isolated prototype. No application dependency has been selected.
- The prototype uses a fixed frontal camera; it does not yet validate free camera movement or a closed scene.

## Scene categories (type C variants)

- **Open variant (APPROVED)** — open sky, visible horizon, distant landscape, and a separate 3D ground plane. This prototype validated this variant and the diagnostic controls used to tune the floor/backdrop junction.
- **Closed variant (FUTURE WORK)** — interior or enclosed environment with different floor, wall, ceiling, occlusion, and camera requirements. Needs its own validation before type C can be considered complete.

## Related documentation

- Scene type C definition and approval: `vn-rpg-spec.md` §3.8
- Scene type A challenges (why it is a fallback, not the baseline): `vn-rpg-spec.md` §3.6
- Renderer strategy (three.js primary + PixiJS overlays): `tech-spec.md` §2.1
