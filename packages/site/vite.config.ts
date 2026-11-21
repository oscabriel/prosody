import { markdown } from "@foldkit/markdown/vite";
import { foldkit } from "@foldkit/vite-plugin";
import { defineConfig, loadEnv } from "vite";

import { Frontmatter } from "./src/Frontmatter.ts";

export default defineConfig(({ mode }) => {
	const root = `${import.meta.dirname}/../..`;
	const domain = loadEnv(mode, root, "PROSODY_").PROSODY_SITE_DOMAIN ?? "";

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
		server: { host: "127.0.0.1", port: 3024, strictPort: true },
	};
});
