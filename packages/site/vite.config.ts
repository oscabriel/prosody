import { markdown } from "@foldkit/markdown/vite";
import { foldkit } from "@foldkit/vite-plugin";
import type { ServerOptions } from "vite";
import { defineConfig, loadEnv } from "vite";

import { Frontmatter } from "./src/Frontmatter.ts";

export default defineConfig(({ mode }) => {
	const root = `${import.meta.dirname}/../..`;
	const domain = loadEnv(mode, root, "PROSODY_").PROSODY_SITE_DOMAIN ?? "";

	const host = loadEnv(mode, import.meta.dirname, "").CADDY_DEV_HOST ?? "";

	const server: ServerOptions = {
		host: "127.0.0.1",
		port: 3034,
		strictPort: true,
	};

	if (host !== "") {
		server.allowedHosts = ["localhost", "127.0.0.1", host];
		server.hmr = { clientPort: 443, host, protocol: "wss" };
	}

	return {
		plugins: [
			foldkit({
				ssr: {
					serverEntry: "/src/entry.server.ts",
					clientEntry: "/src/entry.ts",
					build: {
						prerender: {
							origin: `https://${domain === "" ? "prosody.example.com" : domain}`,
						},
					},
				},
			}),
			markdown({ frontmatter: Frontmatter }),
		],
		server,
	};
});
