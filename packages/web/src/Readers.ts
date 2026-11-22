import type { ReaderId } from "@prosody/domain/Reader.id";
import { Option } from "effect";

import { AuthState } from "./Model.ts";
import type { AuthUser, Model } from "./Model.ts";

export const NO_READER_ID = "u-none";

export const userOf = (model: Model): Option.Option<AuthUser> =>
	AuthState.guards.SignedIn(model.auth)
		? Option.some(model.auth.user)
		: Option.none();

export const readerIn = (model: Model): Option.Option<ReaderId> =>
	Option.map(userOf(model), (user) => user.id);

export const isSignedIn = (model: Model): boolean =>
	AuthState.guards.SignedIn(model.auth);

export const isAdmin = (model: Model): boolean =>
	Option.exists(userOf(model), (user) => user.role === "admin");

export const placesReaderIn = (model: Model): Option.Option<ReaderId> =>
	Option.filter(readerIn(model), (reader) =>
		Option.exists(model.placesReader, (owner) => owner === reader)
	);
