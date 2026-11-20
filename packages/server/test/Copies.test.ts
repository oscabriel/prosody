import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { rangeOf } from "../src/Copies.ts";

describe("a byte range", () => {
	it("is read in the three forms a media element asks for", () => {
		expect(rangeOf("bytes=0-99", 1000)).toStrictEqual(
			Option.some({ offset: 0, length: 100 })
		);
		expect(rangeOf("bytes=900-", 1000)).toStrictEqual(
			Option.some({ offset: 900, length: 100 })
		);
		expect(rangeOf("bytes=-100", 1000)).toStrictEqual(
			Option.some({ offset: 900, length: 100 })
		);
	});

	it("stops at the end of the file", () => {
		expect(rangeOf("bytes=900-5000", 1000)).toStrictEqual(
			Option.some({ offset: 900, length: 100 })
		);
	});

	it("is none when there is no header, or it asks for nothing in the file", () => {
		expect(rangeOf(undefined, 1000)).toStrictEqual(Option.none());
		expect(rangeOf("bytes=2000-", 1000)).toStrictEqual(Option.none());
		expect(rangeOf("bytes=0-1,5-9", 1000)).toStrictEqual(Option.none());
	});
});
