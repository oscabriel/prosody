import { closeSync, openSync, readSync, statSync, writeSync } from "node:fs";

import { render } from "dom-serializer";
import { Element, isTag } from "domhandler";
import type { AnyNode } from "domhandler";
import { Schema } from "effect";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { parseDocument } from "htmlparser2";

import { relative } from "./Epub.ts";
import type { Book } from "./Epub.ts";

export interface Entry {
	readonly sentence: string;
	readonly state: "aligned" | "unaligned";
	readonly start?: number;
	readonly end?: number;
}

export interface Track {
	readonly file: string;
	readonly seconds: number;
}

export const clock = (seconds: number): string => {
	const ms = Math.round(seconds * 1000);
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = (ms % 60_000) / 1000;

	return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
};

const elements = (nodes: ReadonlyArray<AnyNode>): Array<Element> =>
	nodes.flatMap((node) =>
		isTag(node) ? [node, ...elements(node.children)] : []
	);

const local = (element: Element) =>
	element.name.toLowerCase().replace(/^.*:/u, "");

const MEDIA_TYPES = new Map([
	["m4b", "audio/mp4"],
	["m4a", "audio/mp4"],
	["mp4", "audio/mp4"],
	["mp3", "audio/mpeg"],
]);

const MOST_BYTES = 2 ** 32 - 2 ** 26;

export class TooLargeError extends Schema.TaggedError<TooLargeError>()(
	"TooLargeError",
	{ message: Schema.String }
) {}

const AUDIO_PIECE = 4 * 2 ** 20;

interface Pars {
	readonly section: string;
	readonly smil: string;
	readonly id: string;
	readonly pars: Array<{
		id: string;
		track: number;
		begin: number;
		end: number;
	}>;
	seconds: number;
}

interface Layout {
	readonly inFolder: (path: string) => string;
	readonly audioPaths: ReadonlyArray<string>;
	readonly offsets: ReadonlyArray<number>;
}

const layoutOf = (book: Book, tracks: ReadonlyArray<Track>): Layout => {
	const folder = book.packagePath.split("/").slice(0, -1).join("/");

	const inFolder = (path: string) =>
		folder === "" ? path : `${folder}/${path}`;

	const offsets: Array<number> = [];
	let total = 0;

	for (const track of tracks) {
		offsets.push(total);
		total += track.seconds;
	}

	const audioPaths = tracks.map((track, index) =>
		inFolder(
			`Audio/${String(index + 1).padStart(2, "0")}-${track.file.split("/").at(-1) ?? "audio"}`
		)
	);

	return { inFolder, audioPaths, offsets };
};

const parsOf = (
	bySection: Map<string, Pars>,
	section: string,
	inFolder: (path: string) => string
): Pars => {
	const known = bySection.get(section);

	if (known) {
		return known;
	}

	const name =
		section
			.split("/")
			.at(-1)
			?.replace(/\.x?html?$/u, "") ?? "page";

	const taken = new Set([...bySection.values()].map((other) => other.smil));
	const plain = inFolder(`MediaOverlays/${name}.smil`);

	const pars: Pars = {
		section,
		smil: taken.has(plain)
			? inFolder(`MediaOverlays/${name}-${bySection.size + 1}.smil`)
			: plain,
		id: `mo-${bySection.size + 1}`,
		pars: [],
		seconds: 0,
	};

	bySection.set(section, pars);

	return pars;
};

const trackAt = (offsets: ReadonlyArray<number>, seconds: number): number => {
	let track = 0;

	while (track + 1 < offsets.length && (offsets[track + 1] ?? 0) <= seconds) {
		track += 1;
	}

	return track;
};

const bySectionOf = (
	entries: ReadonlyArray<Entry>,
	tracks: ReadonlyArray<Track>,
	layout: Layout
): Map<string, Pars> => {
	const bySection = new Map<string, Pars>();

	for (const entry of entries) {
		if (
			entry.state !== "aligned" ||
			entry.start === undefined ||
			entry.end === undefined
		) {
			continue;
		}

		const [section = "", id = ""] = entry.sentence.split("#");
		const pars = parsOf(bySection, section, layout.inFolder);
		const track = trackAt(layout.offsets, entry.start);
		const begin = entry.start - (layout.offsets[track] ?? 0);

		const end = Math.min(
			entry.end - (layout.offsets[track] ?? 0),
			tracks[track]?.seconds ?? entry.end
		);

		pars.pars.push({ id, track, begin, end });
		pars.seconds += end - begin;
	}

	return bySection;
};

const append = (parent: Element | undefined, child: Element) => {
	if (parent) {
		child.parent = parent;
		parent.children.push(child);
	}
};

const meta = (property: string, value: string, refines?: string) => {
	const element = new Element(
		"meta",
		refines === undefined ? { property } : { property, refines: `#${refines}` },
		[]
	);

	const [text] = parseDocument(value, { xmlMode: true }).children;

	if (text) {
		text.parent = element;
		element.children.push(text);
	}

	return element;
};

const packageOf = (
	book: Book,
	bySection: ReadonlyMap<string, Pars>,
	layout: Layout
) => {
	const opf = parseDocument(book.packageXml, {
		xmlMode: true,
		decodeEntities: false,
	});

	const all = elements(opf.children);
	const pkg = all.find((element) => local(element) === "package");
	const metadata = all.find((element) => local(element) === "metadata");
	const manifest = all.find((element) => local(element) === "manifest");

	if (pkg) {
		pkg.attribs.version = "3.0";
	}

	for (const [index, path] of layout.audioPaths.entries()) {
		const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
		append(
			manifest,
			new Element("item", {
				id: `audio-${index + 1}`,
				href: relative(book.packagePath, path),
				"media-type": MEDIA_TYPES.get(extension) ?? "audio/mp4",
			})
		);
	}

	for (const pars of bySection.values()) {
		append(
			manifest,
			new Element("item", {
				id: pars.id,
				href: relative(book.packagePath, pars.smil),
				"media-type": "application/smil+xml",
			})
		);
		append(metadata, meta("media:duration", clock(pars.seconds), pars.id));
	}

	const sectionItems = all.filter(
		(element) =>
			local(element) === "item" &&
			bySection.has(
				book.sections.find((section) => section.id === element.attribs.id)
					?.path ?? ""
			)
	);

	for (const item of sectionItems) {
		const path =
			book.sections.find((section) => section.id === item.attribs.id)?.path ??
			"";

		const pars = bySection.get(path);

		if (pars) {
			item.attribs["media-overlay"] = pars.id;
		}
	}

	const spoken = [...bySection.values()].reduce(
		(n, pars) => n + pars.seconds,
		0
	);

	append(metadata, meta("media:duration", clock(spoken)));
	append(metadata, meta("media:active-class", "-epub-media-overlay-active"));

	if (!all.some((element) => element.attribs.property === "dcterms:modified")) {
		append(
			metadata,
			meta("dcterms:modified", `${new Date().toISOString().slice(0, 19)}Z`)
		);
	}

	return opf;
};

const smilOf = (pars: Pars, audioPaths: ReadonlyArray<string>) => {
	const textref = relative(pars.smil, pars.section);

	const body = pars.pars
		.map(
			(par, index) =>
				`<par id="par-${index + 1}"><text src="${textref}#${par.id}"/>` +
				`<audio src="${relative(pars.smil, audioPaths[par.track] ?? "")}" clipBegin="${par.begin.toFixed(3)}s" clipEnd="${par.end.toFixed(3)}s"/></par>`
		)
		.join("\n");

	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		'<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">\n' +
		`<body><seq id="seq-1" epub:textref="${textref}">\n${body}\n</seq></body></smil>\n`
	);
};

const addAudio = (zip: Zip, path: string, source: string) => {
	const file = new ZipPassThrough(path);
	zip.add(file);
	const fd = openSync(source, "r");
	const piece = new Uint8Array(AUDIO_PIECE);

	try {
		for (;;) {
			const read = readSync(fd, piece, 0, piece.length, null);

			if (read === 0) {
				break;
			}

			file.push(piece.subarray(0, read));
		}

		file.push(new Uint8Array(0), true);
	} finally {
		closeSync(fd);
	}
};

export const writeReadingCopy = (
	book: Book,
	marked: ReadonlyMap<string, string>,
	entries: ReadonlyArray<Entry>,
	tracks: ReadonlyArray<Track>,
	out: string
): void => {
	const bytes = tracks.reduce((n, track) => n + statSync(track.file).size, 0);

	if (bytes > MOST_BYTES) {
		throw new TooLargeError({
			message: `the audio is ${(bytes / 2 ** 30).toFixed(1)} GB, and the archive holds 4`,
		});
	}

	const layout = layoutOf(book, tracks);
	const bySection = bySectionOf(entries, tracks, layout);
	const opf = packageOf(book, bySection, layout);

	const fd = openSync(out, "w");
	const failures: Array<Error> = [];

	const zip = new Zip((error, chunk) => {
		if (error) {
			failures.push(error);

			return;
		}

		writeSync(fd, chunk);
	});

	const add = (path: string, data: Uint8Array, stored: boolean) => {
		const file = stored
			? new ZipPassThrough(path)
			: new ZipDeflate(path, { level: 6 });

		zip.add(file);
		file.push(data, true);
	};

	try {
		add("mimetype", strToU8("application/epub+zip"), true);

		for (const [path, data] of book.files) {
			if (path === "mimetype" || path === book.packagePath) {
				continue;
			}

			const section = marked.get(path);
			add(path, section === undefined ? data : strToU8(section), false);
		}

		add(
			book.packagePath,
			strToU8(render(opf, { xmlMode: true, decodeEntities: false })),
			false
		);

		for (const pars of bySection.values()) {
			add(pars.smil, strToU8(smilOf(pars, layout.audioPaths)), false);
		}

		for (const [index, track] of tracks.entries()) {
			addAudio(zip, layout.audioPaths[index] ?? "", track.file);
		}

		zip.end();
	} finally {
		closeSync(fd);
	}

	const failure = failures.at(-1);

	if (failure) {
		throw failure;
	}
};
