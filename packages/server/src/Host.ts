import { ALCHEMY_PHASE } from "alchemy";
import { Config, Effect, Option } from "effect";

const onHost = Effect.fnUntraced(function* (name: string, otherwise?: string) {
	const set = yield* Effect.orDie(Config.option(Config.String(name)));

	if (Option.isSome(set) && set.value !== "") {
		return set.value;
	}

	if (otherwise !== undefined) {
		return otherwise;
	}

	if ((yield* ALCHEMY_PHASE) === "runtime") {
		return "";
	}

	return yield* Effect.die(
		new Error(`${name} is not set. Copy .env.example to .env and fill it in.`)
	);
});

export const libraryOnHost = onHost("PROSODY_LIBRARY");

export const downloadsOnHost = onHost("PROSODY_DOWNLOADS", "");

export const copiesOnHost = onHost("PROSODY_COPIES", "/srv/prosody/copies");

export const pressUser = onHost("PROSODY_UID", "1000");

export const relayOnHost = onHost("PROSODY_RELAY", "127.0.0.1:3023");
