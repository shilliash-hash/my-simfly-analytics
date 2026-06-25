## Plan

1. **Restore the TanStack Start entry setup**
   - Update `vite.config.ts` to explicitly use the project server wrapper as the TanStack Start server entry.
   - Keep `wrangler.jsonc` aligned with `src/server.ts`.
   - Leave `index.html` minimal, with no manual `/src/main.tsx` script.

2. **Ensure the client bundle is emitted and injected**
   - Verify the build output includes the app client script instead of only analytics/badge scripts.
   - If the explicit server entry causes the plugin to skip defaults, add only the needed TanStack Start entry option while preserving the default client entry.

3. **Clean stale public metadata while touching the root shell**
   - Remove old Fjord Charters duplicate meta tags from `src/routes/__root.tsx` so the published head is consistent with SimFly Hub.

4. **Validate before publishing**
   - Check the rendered HTML contains an app script and no `/src/main.tsx` reference.
   - Confirm the public route renders app content instead of an empty `#root`.
   - Then publish/update the public site if you approve deployment.