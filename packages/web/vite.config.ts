import { foldkit } from "@foldkit/vite-plugin";
import type { Plugin, ServerOptions } from "vite";
import { build, defineConfig, loadEnv } from "vite";

/** The relay, on the host's loopback address. */
const API = "http://127.0.0.1:3023";

/**
 * Build the service worker once the page is built, as `dist/worker.js`, with the paths of the page,
 * the lock screen's icon and every built file written into it, so it can keep them all when it installs. A new build
 * changes the list, so browsers install the new worker. It is built apart from the page, with
 * none of the page's plugins: it runs alone, with no Foldkit.
 */
const worker = (): Plugin => {
	let shell: Array<string> = [];

	return {
		name: "prosody-worker",
		apply: "build",
		generateBundle(_options, bundle) {
			shell = [
				"/",
				// The lock screen shows it while a book plays from the device.
				"/icon-512.png",
				...Object.keys(bundle)
					.filter((name) => name.startsWith("assets/"))
					.map((name) => `/${name}`),
			];
		},
		async closeBundle() {
			await build({
				configFile: false,
				root: import.meta.dirname,
				logLevel: "warn",
				define: { SHELL: JSON.stringify(shell) },
				build: {
					emptyOutDir: false,
					copyPublicDir: false,
					lib: {
						entry: "src/Worker.ts",
						formats: ["iife"],
						name: "worker",
						fileName: () => "worker.js",
					},
				},
			});
		},
	};
};

export default defineConfig(({ mode }) => {
	const server: ServerOptions = {
		host: "127.0.0.1",
		port: 3022,
		strictPort: true,
		// The app calls its own origin at /api, so the browser needs no cross-origin allowances.
		// `ws` carries the live reads, which are WebSockets. /copies is the reading copies.
		proxy: { "/api": { target: API, ws: true }, "/copies": API },
	};

	// The private address Caddy serves this dev server at. It lives in the gitignored .env, so a
	// checkout without one still runs on localhost.
	const host = loadEnv(mode, import.meta.dirname, "").CADDY_DEV_HOST ?? "";

	if (host !== "") {
		server.allowedHosts = ["localhost", "127.0.0.1", host];
		server.hmr = { clientPort: 443, host, protocol: "wss" };
	}

	return {
		plugins: [foldkit(), worker()],
		optimizeDeps: {
			entries: ["src/entry.ts"],
			// The foldkit plugin keeps foldkit out of pre-bundling, so Vite never sees its imports of
			// Effect. Pre-bundle them here, or dev loads a second copy of Effect next to the app's.
			include: ["effect", "effect/Function", "effect/http"],
		},
		server,
	};
});
