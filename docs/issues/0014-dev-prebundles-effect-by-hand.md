# The dev server pre-bundles Effect by hand to avoid a second copy

**Where**: `optimizeDeps` in `packages/web/vite.config.ts`

The Foldkit plugin keeps Foldkit out of Vite's pre-bundling, so Vite never sees its imports of Effect and dev would load a second copy beside the app's. The config lists those entries by hand.

**To fix**: Check newer releases of the plugin; when it handles this itself, remove the list.
