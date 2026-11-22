import { ReaderId } from "@prosody/domain/Reader.id";
import { Option } from "effect";

import { AuthState } from "../src/Model.ts";
import type { AuthUser } from "../src/Model.ts";

export const ADA = ReaderId.make("u-ada");

export const BEA = ReaderId.make("u-bea");

export const adminAda: AuthUser = {
	id: ADA,
	username: "ada",
	displayName: "Ada",
	role: "admin",
	createdAt: 1000,
};

export const readerBea: AuthUser = {
	id: BEA,
	username: "bea",
	displayName: "Bea",
	role: "reader",
	createdAt: 2000,
};

export const signedInAs = (user: AuthUser) => ({
	auth: AuthState.SignedIn({ user, session: Option.none() }),
	placesReader: Option.some(user.id),
});
