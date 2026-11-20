import { describe, expect, it } from "@effect/vitest";

import { clockOf } from "../src/Listening.ts";

describe("a length of audio", () => {
	it("reads as a clock does", () => {
		expect(clockOf(0)).toBe("0:00");
		expect(clockOf(65.9)).toBe("1:05");
		expect(clockOf(3729)).toBe("1:02:09");
	});
});
