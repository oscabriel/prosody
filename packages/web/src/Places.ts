import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import type { PlaceAt } from "@prosody/domain/Reading/Sentence";
import { Duration, Effect, Option, Schema } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message, Places } from "./Model.ts";
import type { DevicePlace, Model, Room } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import type { Commands, Return, Spot } from "./Steps.ts";

/** How often a place is kept while the audio plays. A pause keeps it at once. */
const KEEP_EVERY = 15_000;

/**
 * How long an open book waits for the model's word on your place before it goes to the device's
 * own: the model may be out of reach while the browser still thinks it is online.
 */
const PLACE_WAIT = Duration.seconds(3);

/** Where the device keeps your places between visits. */
const STORE = "prosody:places";

const PlacesJson = Schema.fromJsonString(Places);

/** The places an earlier visit kept on this device. Anything unreadable is forgotten. */
export const savedPlaces = Effect.sync(() =>
	Option.getOrElse(
		Schema.decodeOption(PlacesJson)(localStorage.getItem(STORE) ?? "{}"),
		(): Places => ({})
	)
);

/** Keep your places on the device, so a place kept offline is sent even after a reload. */
const SavePlaces = Command.define("SavePlaces", {
	args: { places: Places },
	messages: [Message.SavedPlaces],
	execute: ({ places }) =>
		Effect.sync(() => {
			const json = Schema.encodeOption(PlacesJson)(places);

			if (Option.isSome(json)) {
				localStorage.setItem(STORE, json.value);
			}

			return Message.SavedPlaces();
		}),
});

/** A place this device knows, as a device sends it. */
const placeAtOf = ({ sentence, time, page, at }: DevicePlace): PlaceAt => ({
	sentence,
	time,
	page,
	at,
});

/** Send a place to the model. Which device sent it, the Session says. */
const send = (work: string, commandId: string, place: PlaceAt) =>
	Command.mapMessage(
		Prosody.KeepPlace({ target: WorkId.make(work), input: place, commandId }),
		(result) => Message.ReceivedResult({ result })
	);

/**
 * Send every place still waiting for an answer, each under the command id it was first sent with,
 * so one that did arrive before the connection dropped is not recorded twice.
 */
export const sendWaiting = (model: Model): Commands =>
	Object.entries(model.places).flatMap(([work, place]) =>
		place.commandId === null
			? []
			: [send(work, place.commandId, placeAtOf(place))]
	);

/** The model with your places changed, and the change kept on the device. */
const withPlaces = (
	model: Model,
	places: Places
): readonly [Model, Commands] => [
	modifyFields(model, { places: () => places }),
	[SavePlaces({ places })],
];

/**
 * Keep your place: on the device at once, and in the model under a new command id, now if it can
 * be reached and otherwise when it can.
 */
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

	return [
		saved,
		{ ...room, kept: Option.some(place) },
		model.isOnline
			? [...saves, send(room.work, allocation.commandId, place)]
			: saves,
	];
};

/** What an update of the room does when it also keeps your place. */
export type Kept = readonly [Room, Spot, number, Commands];

/** Change the open room and keep the place it ends on, at the time given. */
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

/** Whether it is time to keep the place again while the audio plays. */
export const isDue = (room: Room, at: number): boolean =>
	room.isPlaying &&
	Option.match(room.kept, {
		onNone: () => true,
		onSome: (kept) => at - kept.at >= KEEP_EVERY,
	});

/**
 * The model answered the command carrying a place, kept or refused: either way it waits no longer.
 * A place refused as stale is replaced by the newer one the Place view brings.
 */
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

/** Wait a moment for the model's word on your place in an open book. */
export const WaitForPlace = Command.define("WaitForPlace", {
	args: { work: Schema.String },
	messages: [Message.WaitedForPlace],
	execute: ({ work }) =>
		Effect.sleep(PLACE_WAIT).pipe(Effect.as(Message.WaitedForPlace({ work }))),
});

/** Your place in a work on this device, if it has one. */
export const placeOn = (model: Model, work: string): Option.Option<PlaceAt> =>
	Option.map(Option.fromUndefinedOr(model.places[work]), placeAtOf);

/**
 * Take a place the model told this device of when it is newer than the device's own. One still waiting to be
 * sent is older, and the model will refuse it.
 */
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
