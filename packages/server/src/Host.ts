import { ALCHEMY_PHASE } from "alchemy";
import { Config, Effect, Option } from "effect";

/**
 * A fact about the machine the stack is deployed to, read from `.env` or the shell where the deploy
 * is planned. One with no `otherwise` must be set: without it the plan stops and names it.
 *
 * A service's container runs its own settings again as it starts, with no `.env` beside it. There
 * an unset one is "", which nothing reads: the deploy made the mounts already.
 */
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

/**
 * The library on the host: the folder that holds `ebooks/` and `audiobooks/`, each with a folder
 * for every author and, inside it, one for every title. The press is its one writer.
 */
export const libraryOnHost = onHost("PROSODY_LIBRARY");

/**
 * Where qBittorrent's category for books saves, as the host sees it. The press mounts it read-only
 * and copies each payload out of it.
 */
export const downloadsOnHost = onHost("PROSODY_DOWNLOADS");

/** The reading copies on the host, on a local disk. Make the folder once, owned by `PROSODY_UID`. */
export const copiesOnHost = onHost("PROSODY_COPIES", "/srv/prosody/copies");

/**
 * The user the press runs as: whoever owns the library and the reading copies on the host, so what
 * the press writes there is theirs.
 */
export const pressUser = onHost("PROSODY_UID", "1000");

/**
 * Where the relay listens on the host: a loopback address, so only the host's own Caddy reaches
 * it. The dev server calls it too.
 */
export const relayOnHost = onHost("PROSODY_RELAY", "127.0.0.1:3023");
