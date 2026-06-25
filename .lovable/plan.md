## Problem

`index.html` is corrupted in two ways:

1. The file starts with a stray literal `html` token before `<!DOCTYPE html>`.
2. It hard-codes `<script type="module" src="/src/main.tsx"></script>`.

This is a TanStack Start project. There is no `src/main.tsx` — entry wiring is handled by the TanStack Start Vite plugin (`src/start.ts` / `src/router.tsx` / `src/routes/__root.tsx` provide the real shell). The hard-coded script tag points at a non-existent file, so the deployed build serves the HTML fallback for `/src/main.tsx`, which the browser refuses with the MIME-type error you're seeing.

Preview "mostly works" because dev serves the SSR shell from `__root.tsx` and the broken `<script>` is silently 404'd; production is stricter and breaks the bundle graph.

## Fix

Rewrite `index.html` to the minimal TanStack Start renderer template — no stray `html` token, no manual entry script:

```html
<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Simfly Analytics</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

The TanStack Start plugin will inject the correct client entry at build time, and `src/routes/__root.tsx` continues to own real `<head>` content (title, meta, fonts) per route.

## Verification

- Re-run `build:dev`; confirm no "Failed to resolve /src/main.tsx" warning in the build log.
- Republish, load the public page, confirm no MIME-type error in the console and the app boots.

No source/route/business-logic files change.