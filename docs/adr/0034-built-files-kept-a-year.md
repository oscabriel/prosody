# Built files are kept for a year and the app's pages never

Vite names each built file by its content, so the Api tells browsers to keep those for a year. `index.html`, the service worker, the manifest and the icons are never kept, so a deploy reaches the next visit. A built file's path may hold no folders, so nothing outside the build can be asked for.
