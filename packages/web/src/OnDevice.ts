// Where a work's reading copy is kept on the device. The page and the service worker both read it,
// so it imports nothing.

/** How much of the audio one kept piece holds: 8 MiB, small enough to fetch again after a drop. */
export const PIECE = 8 * 1024 * 1024;

/** The device's cache that holds one work's copy. Removing the copy removes the cache. */
export const cacheOf = (work: string): string => `copy-${work}`;

/** The work a cache holds the copy of, when it holds one. */
export const workOfCache = (name: string): string | undefined =>
	name.startsWith("copy-") ? name.slice("copy-".length) : undefined;

/** A kept copy's record, for the page: written last, so a copy without one is not whole. */
export const recordOf = (work: string): string => `/copies/${work}/kept.json`;

/**
 * One piece of a kept copy's audio, kept as the Api sent it: its `content-range` names the whole
 * file's size, and its `content-type` the audio's.
 */
export const pieceOf = (audio: string, index: number): string =>
	`${audio}?piece=${index}`;

/**
 * How much room a copy takes, as a reader would say it: 369 MB, or 1.2 GB. A no-break space keeps
 * the number and its unit on one line.
 */
export const sizeIn = (bytes: number): string =>
	bytes >= 1e9
		? `${(bytes / 1e9).toFixed(1)}\u00A0GB`
		: `${Math.max(1, Math.round(bytes / 1e6))}\u00A0MB`;

/** The first and last byte a `Range` header asks for, or the whole file's. */
export const rangeOf = (
	header: string | null,
	size: number
): readonly [number, number] => {
	const match = /^bytes=(?<from>\d*)-(?<to>\d*)$/u.exec(header ?? "");
	const from = match?.groups?.from ?? "";
	const to = match?.groups?.to ?? "";

	if (from === "" && to === "") {
		return [0, size - 1];
	}

	if (from === "") {
		return [Math.max(0, size - Number(to)), size - 1];
	}

	return [Number(from), to === "" ? size - 1 : Math.min(Number(to), size - 1)];
};
