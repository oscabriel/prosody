import { foldkit } from "@foldkit/vite-plugin";
import type { ServerOptions } from "vite";
import { defineConfig, loadEnv } from "vite";

/** The relay, on the host's loopback address. */
const API = "http://127.0.0.1:3023";

export default defineConfig(({ mode }) => {
	const server: ServerOptions = {
		host: "127.0.0.1",
		port: 3022,
		strictPort: true,
		// The app calls its own origin at /api, so the browser needs no cross-origin allowances.
		// `ws` carries the live reads, which are WebSockets.
		proxy: { "/api": { target: API, ws: true } },
	};

	// The private address Caddy serves this dev server at. It lives in the gitignored .env, so a
	// checkout without one still runs on localhost.
	const host = loadEnv(mode, import.meta.dirname, "").CADDY_DEV_HOST ?? "";

	if (host !== "") {
		server.allowedHosts = ["localhost", "127.0.0.1", host];
		server.hmr = { clientPort: 443, host, protocol: "wss" };
	}

	return {
		plugins: [foldkit()],
		optimizeDeps: {
			entries: ["src/entry.ts"],
			// The foldkit plugin keeps foldkit out of pre-bundling, so Vite never sees its imports of
			// Effect. Pre-bundle them here, or dev loads a second copy of Effect next to the app's.
			include: ["effect", "effect/Function", "effect/http"],
		},
		server,
	};
});
