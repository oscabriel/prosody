import { describe, expect, it } from "@effect/vitest";
import { Headers } from "effect/http";

import { isCrossSite } from "../src/Session.ts";

const READ = { host: "read.example.com" };

const asked = (headers: Record<string, string>) =>
	isCrossSite(Headers.fromInput({ ...READ, ...headers }));

describe("a request from another site", () => {
	it("is not one Prosody's own page makes, a link followed to it, or curl", () => {
		expect(
			asked({
				origin: "https://read.example.com",
				"sec-fetch-site": "same-origin",
			})
		).toBeFalsy();
		expect(
			isCrossSite(
				Headers.fromInput({
					host: "prosody.example.com",
					origin: "https://prosody.example.com",
				})
			)
		).toBeFalsy();
		expect(
			asked({
				"sec-fetch-site": "cross-site",
				"sec-fetch-mode": "navigate",
				"sec-fetch-dest": "document",
			})
		).toBeFalsy();
		expect(asked({})).toBeFalsy();
	});

	it("is a WebSocket or POST from another page, a frame, or a sister site's fetch", () => {
		expect(asked({ origin: "https://evil.example" })).toBeTruthy();
		expect(asked({ origin: "https://other.example.com" })).toBeTruthy();
		expect(asked({ origin: "null" })).toBeTruthy();
		expect(
			asked({
				"sec-fetch-site": "cross-site",
				"sec-fetch-mode": "navigate",
				"sec-fetch-dest": "iframe",
			})
		).toBeTruthy();
		expect(
			asked({
				"sec-fetch-site": "same-site",
				"sec-fetch-mode": "no-cors",
				"sec-fetch-dest": "audio",
			})
		).toBeTruthy();
	});
});
