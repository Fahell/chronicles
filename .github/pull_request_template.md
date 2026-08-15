## What does this change?

<!-- One or two sentences: what the PR does and why. -->

## Spec references

<!-- Link the specs/decisions this implements (e.g. `tech-spec.md` §12.4). -->

## Validation

Check all that apply — run in `rpg/` before opening the PR:

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test` (unit + integration)
- [ ] `pnpm build` — required when the change affects the bundle or shipping
- [ ] `pnpm test:e2e` — when the change touches boot/rendering/UI flows
- [ ] `rpg/build/` regenerated when the shipped bundle changed

## Notes

<!-- Anything a reviewer needs to know: open items, follow-ups, platform-only behavior. -->
