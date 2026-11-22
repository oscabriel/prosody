import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { ReaderId } from "@prosody/domain/Reader.id";
import { readingOf } from "@prosody/domain/Reading/Reading.id";
import type { PlaceAt } from "@prosody/domain/Reading/Sentence";
import { Duration, Effect, Option, Schema } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message, Places } from "./Model.ts";
import type { DevicePlace, Model, Room } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import { placesReaderIn } from "./Readers.ts";
import type { Commands, Return, Spot } from "./Steps.ts";

const KEEP_EVERY = 15_000;

const PLACE_WAIT = Duration.seconds(3);

export const placesStoreOf = (reader: ReaderId): string =>
	`prosody:places:${reader}`;

const PlacesJson = Schema.fromJsonString(Places);

export const savedPlaces = (reader: Option.Option<ReaderId>) =>
	Effect.sync(() =>
		Option.match(reader, {
			onNone: (): Places => ({}),
			onSome: (owner) =>
				Option.getOrElse(
					Schema.decodeOption(PlacesJson)(
						localStorage.getItem(placesStoreOf(owner)) ?? "{}"
					),
					(): Places => ({})
				),
		})
	);

const SavePlaces = Command.define("SavePlaces", {
	args: { reader: ReaderId, places: Places },
	messages: [Message.SavedPlaces],
	execute: ({ reader, places }) =>
		Effect.sync(() => {
			const json = Schema.encodeOption(PlacesJson)(places);

			if (Option.isSome(json)) {
				localStorage.setItem(placesStoreOf(reader), json.value);
			}

			return Message.SavedPlaces();
		}),
});

export const LoadPlaces = Command.define("LoadPlaces", {
	args: { reader: ReaderId },
	messages: [Message.LoadedPlaces],
	execute: ({ reader }) =>
		Effect.map(savedPlaces(Option.some(reader)), (places) =>
			Message.LoadedPlaces({ reader, places })
		),
});

const placeAtOf = ({ sentence, time, page, at }: DevicePlace): PlaceAt => ({
	sentence,
	time,
	page,
	at,
});

const send = (
	reader: ReaderId,
	work: string,
	commandId: string,
	place: PlaceAt
) =>
	Command.mapMessage(
		Prosody.KeepPlace({
			target: readingOf(reader, WorkId.make(work)),
			input: place,
			commandId,
		}),
		(result) => Message.ReceivedResult({ result })
	);

export const sendWaiting = (model: Model): Commands =>
	Option.match(placesReaderIn(model), {
		onNone: () => [],
		onSome: (reader) =>
			Object.entries(model.places).flatMap(([work, place]) =>
				place.commandId === null
					? []
					: [send(reader, work, place.commandId, placeAtOf(place))]
			),
	});

const withPlaces = (
	model: Model,
	places: Places
): readonly [Model, Commands] => [
	modifyFields(model, { places: () => places }),
	Option.match(model.placesReader, {
		onNone: () => [],
		onSome: (reader) => [SavePlaces({ reader, places })],
	}),
];

const keep = (
	model: Model,
	room: Room,
	spot: Spot,
	at: number
): readonly [Model, Room, Commands] => {
	const allocation = DomainFoldkit.next(model.commandIds);
	const place: PlaceAt = { ...spot, at };

	const [saved, saves] = withPlaces(
		modifyFields(model, { commandIds: () => allocation.commandIds }),
		{
			...model.places,
			[room.work]: { ...place, commandId: allocation.commandId },
		}
	);

	const sends = Option.match(
		Option.filter(placesReaderIn(model), () => model.isOnline),
		{
			onNone: () => [],
			onSome: (reader) => [
				send(reader, room.work, allocation.commandId, place),
			],
		}
	);

	return [saved, { ...room, kept: Option.some(place) }, [...saves, ...sends]];
};

export type Kept = readonly [Room, Spot, number, Commands];

export const keepIn = (
	model: Model,
	change: (room: Room) => Option.Option<Kept>
): Return =>
	Option.match(
		Option.flatMap(model.room, (room) =>
			Option.map(change(room), ([next, spot, at, commands]) => {
				const [kept, room2, sends] = keep(model, next, spot, at);

				return { kept, room: room2, commands: [...sends, ...commands] };
			})
		),
		{
			onNone: () => ({ model }),
			onSome: ({ kept, room, commands }) => ({
				model: modifyFields(kept, { room: () => Option.some(room) }),
				commands,
			}),
		}
	);

export const isDue = (room: Room, at: number): boolean =>
	room.isPlaying &&
	Option.match(room.kept, {
		onNone: () => true,
		onSome: (kept) => at - kept.at >= KEEP_EVERY,
	});

export const answered = (model: Model, commandId: string): Return => {
	const found = Object.entries(model.places).find(
		([, place]) => place.commandId === commandId
	);

	if (found === undefined) {
		return { model };
	}

	const [work, place] = found;

	const [next, commands] = withPlaces(model, {
		...model.places,
		[work]: { ...place, commandId: null },
	});

	return { model: next, commands };
};

export const WaitForPlace = Command.define("WaitForPlace", {
	args: { work: Schema.String },
	messages: [Message.WaitedForPlace],
	execute: ({ work }) =>
		Effect.sleep(PLACE_WAIT).pipe(Effect.as(Message.WaitedForPlace({ work }))),
});

export const placeOn = (model: Model, work: string): Option.Option<PlaceAt> =>
	Option.map(Option.fromUndefinedOr(model.places[work]), placeAtOf);

export const learnPlace = (
	model: Model,
	work: string,
	place: PlaceAt
): readonly [Model, Commands] => {
	const own = model.places[work];

	if (own !== undefined && own.at >= place.at) {
		return [model, []];
	}

	return withPlaces(model, {
		...model.places,
		[work]: {
			sentence: place.sentence,
			time: place.time,
			page: place.page,
			at: place.at,
			commandId: null,
		},
	});
};
