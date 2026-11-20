import { describe, expect, it } from "@effect/vitest";

import { isPage } from "../src/Page.ts";

describe("the web app's paths", () => {
	it("are the shelf, every reading room, and the built files", () => {
		expect(isPage("/")).toBeTruthy();
		expect(isPage("/read/w-1c7eeddd853b")).toBeTruthy();
		expect(isPage("/read/anything/at/all")).toBeTruthy();
		expect(isPage("/assets/index-Cja7xpds.js")).toBeTruthy();
	});

	it("leave the Api's own paths alone", () => {
		expect(isPage("/Shelf/main")).toBeFalsy();
		expect(isPage("/openapi.json")).toBeFalsy();
		expect(isPage("/reading")).toBeFalsy();
		expect(isPage("/assets/fonts/x.woff2")).toBeFalsy();
	});
});
