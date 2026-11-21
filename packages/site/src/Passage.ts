export interface Spoken {
	readonly text: string;
	readonly start: number;
	readonly end: number;
}

export const AUDIO = "/demo/loomings.m4a";

export const LENGTH = 77.9;

export const PASSAGE: ReadonlyArray<Spoken> = [
	{ text: "Call me Ishmael.", start: 0.38, end: 1.65 },
	{
		text: "Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.",
		start: 2.23,
		end: 15.67,
	},
	{
		text: "It is a way I have of driving off the spleen and regulating the circulation.",
		start: 16.38,
		end: 20.93,
	},
	{
		text: "Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people’s hats off—then, I account it high time to get to sea as soon as I can.",
		start: 21.74,
		end: 54.99,
	},
	{
		text: "This is my substitute for pistol and ball.",
		start: 55.66,
		end: 58.91,
	},
	{
		text: "With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship.",
		start: 59.26,
		end: 65.53,
	},
	{
		text: "There is nothing surprising in this.",
		start: 66.53,
		end: 68.32,
	},
	{
		text: "If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.",
		start: 69.01,
		end: 77.38,
	},
];

export const sentenceAt = (time: number): number | null => {
	const index = PASSAGE.findLastIndex((spoken) => spoken.start <= time);

	return index === -1 ? null : index;
};
