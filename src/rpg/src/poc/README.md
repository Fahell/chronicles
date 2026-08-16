# Background-removal POC (RMBG-1.4 + outline)

Validates the client-side background-removal + black-outline pipeline with
REAL Perchance plugin outputs (the two JPEGs in this folder, copied from
`templates/` — different background colors).

Serve it with the app's dev server and open `/poc-bg-removal.html`:

```bash
pnpm dev   # then http://127.0.0.1:4173/poc-bg-removal.html
```

What it shows per sample: original → removed (RMBG-1.4 via
`services/bg-removal.ts`) → outline (`scene/sprite-outline.ts`), plus
model-load and per-image timings. The model (~45 MB, q8) downloads once and
is cached by the browser.

Dev-only: the page is not part of the app entry and never ships to
Perchance. The images are imported from `src/poc/` so they stay out of the
production bundle.
