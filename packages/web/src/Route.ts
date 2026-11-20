import { Schema, pipe } from "effect";
import { Route } from "foldkit";
import { defineRouteUnion, literal, slash, string } from "foldkit/route";

/** The app's pages: the shelf, a work's reading room, and anything else. */
export const AppRoute = defineRouteUnion({
	Shelf: {},
	Room: { work: Schema.String },
	NotFound: { path: Schema.String },
});

export type AppRoute = typeof AppRoute.Type;

export const shelfRouter = pipe(Route.root, Route.mapTo(AppRoute.Shelf));

export const roomRouter = pipe(
	literal("read"),
	slash(string("work")),
	Route.mapTo(AppRoute.Room)
);

export const urlToAppRoute = Route.parseUrlWithFallback(
	Route.oneOf(roomRouter, shelfRouter),
	AppRoute.NotFound
);
