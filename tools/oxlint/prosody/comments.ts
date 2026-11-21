import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

interface Comment {
	readonly file: string;
	readonly line: number;
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

const SKIPPED = [
	/^tools\/oxlint\/anti-slop\//u,
	/(^|\/)pnpm-lock\.yaml$/u,
	/(^|\/)\.env\.example$/u,
];

const KEYWORDS_BEFORE_REGEX = new Set([
	"return",
	"typeof",
	"case",
	"of",
	"in",
	"void",
	"delete",
	"throw",
	"new",
	"else",
	"do",
	"yield",
	"await",
	"instanceof",
]);

const lineOf = (source: string, offset: number): number => {
	let line = 1;

	for (let i = 0; i < offset; i += 1) {
		if (source[i] === "\n") {
			line += 1;
		}
	}

	return line;
};

const scriptComments = (file: string, source: string): Array<Comment> => {
	const found: Array<Comment> = [];
	const templates: Array<number> = [];
	let depth = 0;
	let before = "";
	let i = 0;

	const push = (start: number, end: number) => {
		found.push({
			file,
			line: lineOf(source, start),
			start,
			end,
			text: source.slice(start, end),
		});
	};

	const quoted = (quote: string) => {
		i += 1;

		while (i < source.length && source[i] !== quote && source[i] !== "\n") {
			i += source[i] === "\\" ? 2 : 1;
		}

		i += 1;
	};

	const template = () => {
		while (i < source.length && source[i] !== "`") {
			if (source[i] === "\\") {
				i += 2;
			} else if (source[i] === "$" && source[i + 1] === "{") {
				templates.push(depth);
				depth += 1;
				i += 2;

				return;
			} else {
				i += 1;
			}
		}

		i += 1;
		before = "x";
	};

	const regex = () => {
		let inClass = false;
		i += 1;

		while (i < source.length && source[i] !== "\n") {
			const c = source[i];

			if (c === "\\") {
				i += 2;
			} else {
				if (c === "[") {
					inClass = true;
				} else if (c === "]") {
					inClass = false;
				} else if (c === "/" && !inClass) {
					break;
				}

				i += 1;
			}
		}

		i += 1;

		while (/[a-z]/u.test(source[i] ?? "")) {
			i += 1;
		}
	};

	while (i < source.length) {
		const c = source[i] ?? "";
		const next = source[i + 1] ?? "";

		if (c === "#" && next === "!" && i === 0) {
			const end = source.indexOf("\n");
			push(0, end === -1 ? source.length : end);
			i = end === -1 ? source.length : end;
		} else if (c === "/" && next === "/") {
			const newline = source.indexOf("\n", i);
			const end = newline === -1 ? source.length : newline;
			push(i, end);
			i = end;
		} else if (c === "/" && next === "*") {
			const close = source.indexOf("*/", i + 2);
			const end = close === -1 ? source.length : close + 2;
			push(i, end);
			i = end;
		} else if (c === '"' || c === "'") {
			quoted(c);
			before = "x";
		} else if (c === "`") {
			i += 1;
			template();
		} else if (c === "{") {
			depth += 1;
			before = c;
			i += 1;
		} else if (c === "}") {
			depth -= 1;
			i += 1;

			if (templates.at(-1) === depth) {
				templates.pop();
				template();
			} else {
				before = c;
			}
		} else if (c === "/") {
			const value =
				/[\w$)\]}]/u.test(before.at(-1) ?? "") &&
				!KEYWORDS_BEFORE_REGEX.has(before);

			if (value) {
				before = c;
				i += 1;
			} else {
				regex();
				before = "x";
			}
		} else if (/[\w$]/u.test(c)) {
			const start = i;

			while (/[\w$]/u.test(source[i] ?? "")) {
				i += 1;
			}

			before = source.slice(start, i);
		} else {
			if (!/\s/u.test(c)) {
				before = c;
			}

			i += 1;
		}
	}

	return found;
};

const between = (
	file: string,
	source: string,
	open: string,
	close: string
): Array<Comment> => {
	const found: Array<Comment> = [];
	let from = source.indexOf(open);

	while (from !== -1) {
		const closed = source.indexOf(close, from + open.length);
		const end = closed === -1 ? source.length : closed + close.length;

		found.push({
			file,
			line: lineOf(source, from),
			start: from,
			end,
			text: source.slice(from, end),
		});
		from = source.indexOf(open, end);
	}

	return found;
};

const hashLines = (file: string, source: string): Array<Comment> => {
	const found: Array<Comment> = [];
	let offset = 0;

	for (const [index, line] of source.split("\n").entries()) {
		if (/^\s*#/u.test(line)) {
			found.push({
				file,
				line: index + 1,
				start: offset,
				end: offset + line.length,
				text: line.trim(),
			});
		}

		offset += line.length + 1;
	}

	return found;
};

const commentsOf = (file: string, source: string): Array<Comment> => {
	if (/\.[cm]?[jt]sx?$/u.test(file)) {
		return scriptComments(file, source);
	}

	if (file.endsWith(".css")) {
		return between(file, source, "/*", "*/");
	}

	if (file.endsWith(".html")) {
		return between(file, source, "<!--", "-->");
	}

	if (/(?:^|\/)Dockerfile$|\.ya?ml$|\.dockerignore$/u.test(file)) {
		return hashLines(file, source);
	}

	return [];
};

const strip = (source: string, comments: ReadonlyArray<Comment>): string => {
	let out = source;

	for (const comment of comments.toReversed()) {
		const lineStart = out.lastIndexOf("\n", comment.start - 1) + 1;
		const newline = out.indexOf("\n", comment.end);
		const lineEnd = newline === -1 ? out.length : newline;
		const alone =
			out.slice(lineStart, comment.start).trim() === "" &&
			out.slice(comment.end, lineEnd).trim() === "";

		out = alone
			? out.slice(0, lineStart) +
				out.slice(newline === -1 ? out.length : lineEnd + 1)
			: out.slice(0, comment.start).replace(/[ \t]+$/u, "") +
				out.slice(comment.end);
	}

	return out;
};

const linesOf = (comment: Comment): number => comment.text.split("\n").length;

const [mode = "list", ...paths] = process.argv.slice(2);

const files = execFileSync("git", ["ls-files", "--", ...paths], {
	encoding: "utf8",
})
	.split("\n")
	.filter((file) => file !== "" && !SKIPPED.some((skip) => skip.test(file)));

let total = 0;
let shed = 0;

for (const file of files) {
	let source: string;

	try {
		source = readFileSync(file, "utf8");
	} catch {
		continue;
	}

	if (source.includes("\u0000")) {
		continue;
	}

	const comments = commentsOf(file, source);

	for (const comment of comments) {
		total += linesOf(comment);
	}

	if (mode === "check") {
		for (const comment of comments) {
			console.log(`${file}:${comment.line}: comment`);
		}
	} else if (mode === "list") {
		for (const comment of comments) {
			const text = comment.text
				.replace(/^\/\*+|\*+\/$|^\/\/+|^<!--|-->$|^#+/gu, "")
				.split("\n")
				.map((line) => line.replace(/^\s*\*?\s?/u, "").trim())
				.filter((line) => line !== "")
				.join(" ");

			console.log(`${file}:${comment.line}\t${text}`);
		}
	} else if (mode === "strip" && comments.length > 0) {
		const stripped = strip(source, comments);

		shed += source.split("\n").length - stripped.split("\n").length;
		writeFileSync(file, stripped);
	}
}

if (mode === "check" && total > 0) {
	console.log(
		`${total} lines of comments. Code carries no comments: put a decision in docs/adr, a hack in docs/issues, a word in GLOSSARY.md.`
	);
	process.exitCode = 1;
} else if (mode === "count") {
	console.log(`${total} lines of comments in ${files.length} files`);
} else if (mode === "strip") {
	console.log(
		`${shed} lines removed; run the formatter, then the checks, before counting again`
	);
}
