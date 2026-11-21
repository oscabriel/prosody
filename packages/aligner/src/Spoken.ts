const ONES = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
];

const TENS = [
	"",
	"",
	"twenty",
	"thirty",
	"forty",
	"fifty",
	"sixty",
	"seventy",
	"eighty",
	"ninety",
];

const SCALES: ReadonlyArray<readonly [number, string]> = [
	[1_000_000_000, "billion"],
	[1_000_000, "million"],
	[1000, "thousand"],
];

export const cardinal = (n: number): Array<string> => {
	if (n < 20) {
		return [ONES[n] ?? ""];
	}

	if (n < 100) {
		const tens = TENS[Math.floor(n / 10)] ?? "";

		return n % 10 === 0 ? [tens] : [tens, ONES[n % 10] ?? ""];
	}

	if (n < 1000) {
		const words = [ONES[Math.floor(n / 100)] ?? "", "hundred"];
		const rest = n % 100;

		if (rest !== 0) {
			words.push(...cardinal(rest));
		}

		return words;
	}

	for (const [size, name] of SCALES) {
		if (n >= size) {
			const words = [...cardinal(Math.floor(n / size)), name];
			const rest = n % size;

			if (rest !== 0) {
				words.push(...cardinal(rest));
			}

			return words;
		}
	}

	return [];
};

const ORDINAL_ENDINGS = new Map([
	["one", "first"],
	["two", "second"],
	["three", "third"],
	["five", "fifth"],
	["eight", "eighth"],
	["nine", "ninth"],
	["twelve", "twelfth"],
]);

export const ordinal = (n: number): Array<string> => {
	const words = cardinal(n);
	const last = words.at(-1) ?? "";

	const ending =
		ORDINAL_ENDINGS.get(last) ??
		(last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);

	return [...words.slice(0, -1), ending];
};

export const year = (n: number): Array<string> => {
	if (n >= 2000 && n < 2010) {
		return cardinal(n);
	}

	const high = Math.floor(n / 100);
	const low = n % 100;
	const words = [...cardinal(high)];

	if (low === 0) {
		words.push("hundred");

		return words;
	}

	if (low < 10) {
		words.push("oh");
	}

	words.push(...cardinal(low));

	return words;
};

const ABBREVIATIONS = new Map([
	["mr", "mister"],
	["mrs", "missus"],
	["ms", "miz"],
	["dr", "doctor"],
	["prof", "professor"],
	["st", "saint"],
	["jr", "junior"],
	["sr", "senior"],
	["vs", "versus"],
	["etc", "et cetera"],
	["e.g", "for example"],
	["i.e", "that is"],
	["approx", "approximately"],
]);

const SYMBOLS = new Map([
	["&", " and "],
	["%", " percent "],
	["+", " plus "],
	["=", " equals "],
	["@", " at "],
	["#", " number "],
]);

const oneByOne = (digits: string): Array<string> => {
	const words: Array<string> = [];

	for (const digit of digits) {
		words.push(...cardinal(Number(digit)));
	}

	return words;
};

const decade = (digits: string): Array<string> => {
	const words = year(Number(digits));
	const last = words.at(-1) ?? "";

	return [
		...words.slice(0, -1),
		last.endsWith("y") ? `${last.slice(0, -1)}ies` : `${last}s`,
	];
};

const clock = (hours: string, minutes: string): Array<string> => {
	const words = [...cardinal(Number(hours))];
	const past = Number(minutes);

	if (past === 0) {
		return words;
	}

	if (past < 10) {
		words.push("oh");
	}

	words.push(...cardinal(past));

	return words;
};

const number = (digits: string): Array<string> => {
	const n = Number(digits);

	if (digits.length > 1 && digits.startsWith("0")) {
		return oneByOne(digits);
	}

	if (digits.length === 4 && n >= 1100 && n < 2100) {
		return year(n);
	}

	if (n < 1_000_000_000_000) {
		return cardinal(n);
	}

	return oneByOne(digits);
};

const sayNumber = (bare: string): Array<string> | undefined => {
	const decadeMatch = /^(?<digits>\d{4})'?s$/u.exec(bare);

	if (decadeMatch) {
		return decade(decadeMatch.groups?.digits ?? "");
	}

	const shortDecade = /^(?<digits>\d0)'?s$/u.exec(bare);

	if (shortDecade) {
		const [tens = ""] = cardinal(Number(shortDecade.groups?.digits));

		return [`${tens.slice(0, -1)}ies`];
	}

	const nth = /^(?<digits>\d+)(?:st|nd|rd|th)$/u.exec(bare);

	if (nth) {
		return ordinal(Number(nth.groups?.digits));
	}

	const time = /^(?<hours>\d{1,2}):(?<minutes>\d{2})$/u.exec(bare);

	if (time) {
		return clock(time.groups?.hours ?? "", time.groups?.minutes ?? "");
	}

	const decimal = /^(?<whole>\d+)\.(?<fraction>\d+)$/u.exec(bare);

	if (decimal) {
		return [
			...cardinal(Number(decimal.groups?.whole)),
			"point",
			...oneByOne(decimal.groups?.fraction ?? ""),
		];
	}

	if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(bare)) {
		return sayNumber(bare.replaceAll(",", ""));
	}

	if (/^\d+$/u.test(bare)) {
		return number(bare);
	}

	return undefined;
};

const sayMixed = (bare: string): Array<string> =>
	(bare.match(/\d+|[a-z']+/gu) ?? [])
		.flatMap((part) =>
			/^\d+$/u.test(part)
				? cardinal(Number(part))
				: [part.replaceAll(/^'+|'+$/gu, "")]
		)
		.filter((word) => /[a-z]/u.test(word));

const say = (token: string): Array<string> => {
	const bare = token.replaceAll(/^'+|'+$/gu, "");

	if (bare === "") {
		return [];
	}

	const abbreviation = ABBREVIATIONS.get(bare.replace(/\.$/u, ""));

	if (abbreviation !== undefined && token.endsWith(".")) {
		return abbreviation.split(" ");
	}

	return sayNumber(bare) ?? sayMixed(bare);
};

const currency = (sign: string): string => {
	if (sign === "$") {
		return "dollars";
	}

	if (sign === "£") {
		return "pounds";
	}

	return "euros";
};

const SPEECH_EDGE = /(?<=[”"])\s+|\s+(?=[“"])/u;

export const phrases = (text: string): Array<Array<string>> =>
	text
		.split(SPEECH_EDGE)
		.map(spoken)
		.filter((words) => words.length > 0);

export const phraseStarts = (
	parts: ReadonlyArray<ReadonlyArray<string>>
): Array<number> => {
	const starts: Array<number> = [];
	let at = 0;

	for (const part of parts.slice(0, -1)) {
		at += part.length;
		starts.push(at);
	}

	return starts;
};

export const spoken = (text: string): Array<string> => {
	let plain = text
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[‘’ʼ`´]/gu, "'")
		.replaceAll(/[-‐‑‒–—―/\\_⁄]/gu, " ");

	for (const [symbol, word] of SYMBOLS) {
		plain = plain.replaceAll(symbol, word);
	}

	plain = plain.replaceAll(
		/(?<sign>[$£€])(?<amount>\d[\d,.]*)/gu,
		(_, sign: string, amount: string) => `${amount} ${currency(sign)}`
	);

	return plain
		.split(/\s+/u)
		.map((token) =>
			token.replaceAll(/[^a-z0-9'.:,]/gu, "").replace(/[,:]+$/u, "")
		)
		.map((token) =>
			ABBREVIATIONS.has(token.replace(/\.$/u, "")) || /^\d+\.\d+$/u.test(token)
				? token
				: token.replace(/\.+$/u, "")
		)
		.flatMap(say)
		.filter((word) => word !== "");
};
