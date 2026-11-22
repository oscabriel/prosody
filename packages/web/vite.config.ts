import { foldkit } from "@foldkit/vite-plugin";
import type { Plugin, ServerOptions } from "vite";
import { build, defineConfig, loadEnv } from "vite";

const RELAY = "127.0.0.1:3023";

const worker = (): Plugin => {
	let shell: Array<string> = [];

	return {
		name: "prosody-worker",
		apply: "build",
		generateBundle(_options, bundle) {
			shell = [
				"/",
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

const themeBoot = (): Plugin => ({
	name: "prosody-theme-boot",
	async transformIndexHtml() {
		const built = await build({
			configFile: false,
			root: import.meta.dirname,
			logLevel: "warn",
			build: {
				write: false,
				lib: {
					entry: "src/ThemeBoot.ts",
					formats: ["iife"],
					name: "themeBoot",
					fileName: () => "theme-boot.js",
				},
			},
		});

		const outputs = Array.isArray(built) ? built : [built];

		const scripts = outputs.flatMap((result) =>
			"output" in result
				? result.output.flatMap((chunk) =>
						chunk.type === "chunk" ? [chunk.code] : []
					)
				: []
		);

		return scripts.map((children) => ({
			tag: "script",
			children,
			injectTo: "head" as const,
		}));
	},
});

export default defineConfig(({ mode }) => {
	const root = `${import.meta.dirname}/../..`;
	const relay = loadEnv(mode, root, "PROSODY_").PROSODY_RELAY ?? "";
	const api = `http://${relay === "" ? RELAY : relay}`;

	const server: ServerOptions = {
		host: "127.0.0.1",
		port: 3022,
		strictPort: true,
		proxy: {
			"/api": { target: api, ws: true },
			"/auth": api,
			"/copies": api,
		},
	};

	const host = loadEnv(mode, import.meta.dirname, "").CADDY_DEV_HOST ?? "";

	if (host !== "") {
		server.allowedHosts = ["localhost", "127.0.0.1", host];
		server.hmr = { clientPort: 443, host, protocol: "wss" };
	}

	return {
		plugins: [foldkit(), themeBoot(), worker()],
		optimizeDeps: { entries: ["src/entry.ts"] },
		server,
	};
});
