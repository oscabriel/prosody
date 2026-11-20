import { Schema } from "effect";

/**
 * A grab's identity: its work's id and its number among the work's grabs, such as
 * `w-c0ffee000001.2`. qBittorrent carries it as the torrent's tag.
 */
export const GrabId = Schema.String.check(
	Schema.isPattern(/^w-[a-z0-9]+\.[1-9][0-9]*$/u)
).pipe(Schema.brand("GrabId"));

export type GrabId = typeof GrabId.Type;

/** Where a grab stands: `none` until its download starts. */
export const GrabStatus = Schema.Literals([
	"none",
	"downloading",
	"stalled",
	"abandoned",
	"arrived",
	"released",
]);
