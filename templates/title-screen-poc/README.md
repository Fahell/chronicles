# Chronicles title-screen proof of concept

This folder is an isolated, one-shot HTML template based on the supplied title-screen reference image. It is **not** wired into the application and does not define the final stack or production UI.

## Files

- `index.html` — standalone title-screen markup and lightweight menu interaction.
- `styles.css` — responsive visual treatment, typography, menu states, and accessibility basics.
- `placeholder-art.svg` — original temporary key-art placeholder. Replace this file with the final generated artwork when it is available.

## Visual decisions in this template

- Light paper-to-lavender background with soft atmospheric gradients.
- Large centered serif title over the artwork.
- Fantasy key art anchored to the right side of the composition.
- Three-line menu on the lower-left with a right-pointing Font Awesome hand asset, a slight diagonal alignment, fine horizontal rules, and a restrained reflection on the selected row.
- Small credits at the bottom edge.
- Keyboard navigation with arrow keys, Enter/Space activation, Escape to return, visible focus, and reduced-motion support.

The menu screens are intentionally placeholders. They only demonstrate the visual transition and should be replaced by the eventual title, New Game, Load Game, and Settings flows. The external hand asset is Font Awesome Free's `hand-point-right` icon, used under CC BY 4.0.
