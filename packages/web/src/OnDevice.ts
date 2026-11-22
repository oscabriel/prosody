export const PIECE = 8 * 1024 * 1024;

export const cacheOf = (work: string): string => `copy-${work}`;

export const workOfCache = (name: string): string | undefined =>
	name.startsWith("copy-") ? name.slice("copy-".length) : undefined;

export const recordOf = (work: string): string => `/copies/${work}/kept.json`;

export const pieceOf = (audio: string, index: number): string =>
	`${audio}?piece=${index}`;

export const sizeIn = (bytes: number): string =>
	bytes >= 1e9
		? `${(bytes / 1e9).toFixed(1)}\u00A0GB`
		: `${Math.max(1, Math.round(bytes / 1e6))}\u00A0MB`;

export const percentOf = (done: number, of: number): number =>
	of > 0 ? Math.min(100, Math.round((done / of) * 100)) : 0;

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
