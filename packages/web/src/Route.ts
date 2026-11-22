import { WorkId } from "@prosody/domain/Library/Work.id";
import { Effect, Option, Schema, pipe } from "effect";
import { Route } from "foldkit";
import {
	defineRouteUnion,
	literal,
	param,
	ParseError,
	slash,
	string,
} from "foldkit/route";
import type { Url } from "foldkit/url";

export const AppRoute = defineRouteUnion({
	Shelf: {},
	Room: { work: Schema.String },
	Desk: {},
	Login: {},
	Setup: {},
	Invite: { token: Schema.String },
	Account: {},
	NotFound: { path: Schema.String },
});

export type AppRoute = typeof AppRoute.Type;

export const shelfRouter = pipe(Route.root, Route.mapTo(AppRoute.Shelf));

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

export const loginRouter = pipe(literal("login"), Route.mapTo(AppRoute.Login));

export const setupRouter = pipe(literal("setup"), Route.mapTo(AppRoute.Setup));

export const inviteRouter = pipe(
	literal("invite"),
	slash(string("token")),
	Route.mapTo(AppRoute.Invite)
);

export const accountRouter = pipe(
	literal("account"),
	Route.mapTo(AppRoute.Account)
);

export const urlToAppRoute = Route.parseUrlWithFallback(
	Route.oneOf(
		roomRouter,
		deskRouter,
		loginRouter,
		setupRouter,
		inviteRouter,
		accountRouter,
		shelfRouter
	),
	AppRoute.NotFound
);

export const isSafePath = (path: string): boolean =>
	path.startsWith("/") &&
	!path.startsWith("//") &&
	!path.includes("\\") &&
	/^[ -~]*$/u.test(path);

export const loginQueryOf = (url: Url) => {
	const params = new URLSearchParams(Option.getOrElse(url.search, () => ""));
	const redirect = params.get("redirect") ?? "/";

	return {
		redirect: isSafePath(redirect) ? redirect : "/",
		ssoFailed: params.get("error") === "sso",
	};
};

export const pathOf = (route: AppRoute): string =>
	AppRoute.match(route, {
		Shelf: () => shelfRouter(),
		Room: ({ work }) => roomRouter({ work }),
		Desk: () => deskRouter(),
		Login: () => loginRouter(),
		Setup: () => setupRouter(),
		Invite: ({ token }) => inviteRouter({ token }),
		Account: () => accountRouter(),
		NotFound: ({ path }) => path,
	});

export const loginPathFor = (redirect: string): string =>
	redirect === "/"
		? loginRouter()
		: `${loginRouter()}?${new URLSearchParams({ redirect }).toString()}`;
