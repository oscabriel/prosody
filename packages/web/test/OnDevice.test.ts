import { describe, expect, it } from "@effect/vitest";

import { rangeOf, sizeIn, workOfCache } from "../src/OnDevice.ts";

describe("a copy on the device", () => {
	it("answers each range a media element asks for", () => {
		expect(rangeOf("bytes=0-", 100)).toStrictEqual([0, 99]);
		expect(rangeOf("bytes=10-19", 100)).toStrictEqual([10, 19]);
		expect(rangeOf("bytes=90-200", 100)).toStrictEqual([90, 99]);
		expect(rangeOf("bytes=-10", 100)).toStrictEqual([90, 99]);
		expect(rangeOf(null, 100)).toStrictEqual([0, 99]);
	});

	it("is found by its cache, and said in megabytes or gigabytes", () => {
		expect(workOfCache("copy-w-1c7eeddd853b")).toBe("w-1c7eeddd853b");
		expect(workOfCache("app")).toBeUndefined();
		expect(sizeIn(390_000_000)).toBe("390\u00A0MB");
		expect(sizeIn(1_199_024_443)).toBe("1.2\u00A0GB");
		expect(sizeIn(20_000)).toBe("1\u00A0MB");
	});
});
