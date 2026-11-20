import { WorkId } from "@prosody/domain/Library/Work.id";
import { Effect, Schema, pipe } from "effect";
import { Route } from "foldkit";
import {
	defineRouteUnion,
	literal,
	param,
	ParseError,
	slash,
} from "foldkit/route";

/** The app's pages: the shelf, a work's reading room, the desk, and anything else. */
export const AppRoute = defineRouteUnion({
	Shelf: {},
	Room: { work: Schema.String },
	Desk: {},
	NotFound: { path: Schema.String },
});

export type AppRoute = typeof AppRoute.Type;

export const shelfRouter = pipe(Route.root, Route.mapTo(AppRoute.Shelf));

/** A work id in an address. Anything else names no work, so the page is not found. */
const workId = param<{ readonly work: string }>(
	"work id",
	(segment) =>
		Schema.is(WorkId)(segment)
			? Effect.succeed({ work: segment })
			: Effect.fail(
					new ParseError({ message: "Expected a work id", actual: segment })
				),
	({ work }) => work
);

export const roomRouter = pipe(
	literal("read"),
	slash(workId),
	Route.mapTo(AppRoute.Room)
);

export const deskRouter = pipe(literal("desk"), Route.mapTo(AppRoute.Desk));

export const urlToAppRoute = Route.parseUrlWithFallback(
	Route.oneOf(roomRouter, deskRouter, shelfRouter),
	AppRoute.NotFound
);
