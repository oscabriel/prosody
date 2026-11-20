import { describe, expect, it } from "@effect/vitest";
import { Option, Result } from "effect";

import type { Peer } from "../src/Tailscale.ts";
import { admission } from "../src/Tailscale.ts";

const OWNER = 1;

const machine = (
	name: string,
	user: number,
	tags: Array<string> | null = null
): Peer => ({ Node: { ComputedName: name, User: user, Tags: tags } });

describe("who is let in", () => {
	it("is a machine of the host's owner, known by its name", () => {
		expect(
			admission(OWNER, Option.some(machine("iphone", OWNER)))
		).toStrictEqual(Result.succeed("iphone"));
	});

	it("is not someone else's machine, a tagged one, or an address outside the tailnet", () => {
		expect(
			Result.isFailure(admission(OWNER, Option.some(machine("laptop", 2))))
		).toBeTruthy();
		expect(
			Result.isFailure(
				admission(OWNER, Option.some(machine("server", OWNER, ["tag:server"])))
			)
		).toBeTruthy();
		expect(Result.isFailure(admission(OWNER, Option.none()))).toBeTruthy();
	});
});
