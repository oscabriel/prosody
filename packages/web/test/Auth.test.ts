import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { assert, describe, expect, it } from "@effect/vitest";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { readingOf } from "@prosody/domain/Reading/Reading.id";
import { Sentence } from "@prosody/domain/Reading/Sentence";
import { SignedOut } from "@prosody/domain/Session.middleware";
import { Effect, Fiber, Option, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { TestClock } from "effect/testing";
import { Scene } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { fromString } from "foldkit/url";

import { DEFAULT_APPEARANCE } from "../src/Appearance.ts";
import { loginView } from "../src/Auth.ts";
import { ANSWER_WITHIN, fetchMe, reasonOf } from "../src/AuthApi.ts";
import { deskView } from "../src/Desk.ts";
import { canWatchWanted, isWatching, update } from "../src/Main.ts";
import {
	AuthState,
	Book,
	DEFAULT_DESK_UI,
	DEFAULT_SHELF_UI,
	EMPTY_ACCOUNT,
	Message,
	Model,
} from "../src/Model.ts";
import type { AuthUser, Me, Places } from "../src/Model.ts";
import { bookMenuView } from "../src/Moves.ts";
import { sendMove } from "../src/Nightstand.ts";
import { placesStoreOf, sendWaiting } from "../src/Places.ts";
import { Prosody } from "../src/Prosody.ts";
import { AppRoute, loginQueryOf, urlToAppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";
import type { Commands } from "../src/Steps.ts";
import { ADA, BEA, adminAda, readerBea, signedInAs } from "./Readers.ts";

const urlOf = (path: string) =>
	Option.getOrThrow(fromString(`https://example.com${path}`));

const routeOf = (path: string) => urlToAppRoute(urlOf(path));

const base = Model.make({
	route: AppRoute.Shelf(),
	commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
	isOnline: true,
	places: {},
	copies: {},
	copying: Option.none(),
	shelf: Option.none(),
	hasAnswered: false,
	error: Option.none(),
	nightstand: Option.none(),
	room: Option.none(),
	wanted: Option.none(),
	desk: {
		title: "",
		author: "",
		correcting: Option.none(),
		problem: Option.none(),
	},
	appearance: DEFAULT_APPEARANCE,
	systemDark: false,
	toast: Option.none(),
	confirm: Option.none(),
	announcement: "",
	shelfUi: DEFAULT_SHELF_UI,
	deskUi: DEFAULT_DESK_UI,
});

const as = (user: AuthUser, change: Partial<Model> = {}) =>
	Model.make({ ...base, ...signedInAs(user), ...change });

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

const Targeted = Schema.Struct({ target: Schema.String });

const targetsOf = (commands: Commands) =>
	commands.map((command) =>
		Option.getOrUndefined(Schema.decodeUnknownOption(Targeted)(command.args))
	);

const openCarl = {
	...roomOf("w-carl", false),
	book: Book.Open({
		contents: {
			audio: "audio.m4b",
			sections: [],
			chapters: [],
			cover: null,
			pictures: [],
			headings: [],
		},
		timeline: [],
	}),
};

const carlMenuView = (model: Model, h: Parameters<typeof bookMenuView>[2]) =>
	bookMenuView(model, openCarl, h);

const COVER_MOUNT = { name: "HideBrokenCover" };

const waiting: Places = {
	"w-carl": {
		sentence: Sentence.make("OEBPS/ch1.xhtml#ps-2"),
		time: null,
		page: null,
		at: 2000,
		commandId: "s:1",
	},
};

const Denied = Schema.TaggedStruct("Denied", { error: Schema.Any });

const deniedKeep = Message.ReceivedResult({
	result: Prosody.Message.FailedKeepPlace({
		commandId: "s:1",
		failure: Denied.make({ error: new SignedOut() }),
	}),
});

const signedInMe = (user: AuthUser) =>
	Message.ReceivedMe({ me: meFor(Option.some(user)) });

const hanging = HttpClient.make(() => Effect.never).pipe(
	HttpClient.mapRequest(HttpClientRequest.prependUrl("https://example.com"))
);

const meFor = (user: Option.Option<AuthUser>): Me => ({
	user,
	session: Option.none(),
	setupRequired: false,
	localAuth: true,
	oidc: Option.none(),
});

describe("the sign-in routes", () => {
	it("read the login page, its way back and a failed sign-on", () => {
		expect(routeOf("/login?redirect=%2Fdesk&error=sso")).toStrictEqual(
			AppRoute.Login()
		);

		expect(
			loginQueryOf(urlOf("/login?redirect=%2Fdesk&error=sso"))
		).toStrictEqual({ redirect: "/desk", ssoFailed: true });
	});

	it.each([
		"%2F%2Fevil.test",
		"%2F%5Cevil.test",
		"javascript%3Aalert(1)",
		"https%3A%2F%2Fevil.test",
		"%2F%09%2Fevil.test",
		"%2F%0A%2Fevil.test",
	])("go home instead of following the way back %s", (redirect) => {
		expect(loginQueryOf(urlOf(`/login?redirect=${redirect}`))).toStrictEqual({
			redirect: "/",
			ssoFailed: false,
		});
	});

	it("leave the app for single sign-on instead of routing to it", () => {
		const { commands } = update(
			base,
			Message.ClickedLink({
				request: UrlRequest.Internal({
					url: urlOf("/auth/oidc/start?redirect=%2Fdesk"),
				}),
			})
		);

		expect(names(commands ?? [])).toStrictEqual(["Leave"]);
	});

	it("read setup, an invite and the account page", () => {
		expect(routeOf("/setup")).toStrictEqual(AppRoute.Setup());
		expect(routeOf("/invite/abc_123")).toStrictEqual(
			AppRoute.Invite({ token: "abc_123" })
		);
		expect(routeOf("/account")).toStrictEqual(AppRoute.Account());
	});
});

describe("what a reader may see and do", () => {
	it("watch the desk only as an admin", () => {
		const route = AppRoute.Desk();

		expect(canWatchWanted(as(adminAda, { route }))).toBeTruthy();
		expect(canWatchWanted(as(readerBea, { route }))).toBeFalsy();
	});

	it("watch nothing until someone is signed in", () => {
		expect(isWatching(base)).toBeFalsy();
		expect(isWatching(as(readerBea))).toBeTruthy();
	});

	it("tell a reader the desk is for admins", () => {
		expect(() => {
			Scene.scene(
				{ update, view: deskView },
				Scene.given(as(readerBea, { route: AppRoute.Desk() })),
				Scene.expect(Scene.text("The desk is for admins")).toExist(),
				Scene.expect(Scene.text("Want it")).toBeAbsent()
			);
		}).not.toThrow();
	});

	it("show an admin the desk itself", () => {
		expect(() => {
			Scene.scene(
				{ update, view: deskView },
				Scene.given(as(adminAda, { route: AppRoute.Desk() })),
				Scene.expect(Scene.text("Want it")).toExist(),
				Scene.expect(Scene.text("The desk is for admins")).toBeAbsent()
			);
		}).not.toThrow();
	});

	it.each([
		["while Prosody is still being asked", base],
		["offline with no saved reader", Model.make({ ...base, isOnline: false })],
	])("keep the desk closed %s", (_situation, model) => {
		expect(() => {
			Scene.scene(
				{ update, view: deskView },
				Scene.given(Model.make({ ...model, route: AppRoute.Desk() })),
				Scene.expect(Scene.text("The desk is for admins")).toExist(),
				Scene.expect(Scene.text("Want it")).toBeAbsent()
			);
		}).not.toThrow();
	});

	it("offer to align a book again only to an admin", () => {
		expect(() => {
			Scene.scene(
				{ update, view: carlMenuView },
				Scene.given(as(readerBea, { room: Option.some(openCarl) })),
				Scene.Mount.resolve(COVER_MOUNT, Message.CompletedCover()),
				Scene.expect(Scene.text("Synced")).toExist(),
				Scene.expect(Scene.text("Align it again…")).toBeAbsent()
			);
		}).not.toThrow();

		expect(() => {
			Scene.scene(
				{ update, view: carlMenuView },
				Scene.given(as(adminAda, { room: Option.some(openCarl) })),
				Scene.Mount.resolve(COVER_MOUNT, Message.CompletedCover()),
				Scene.expect(Scene.text("Align it again…")).toExist()
			);
		}).not.toThrow();
	});
});

describe("each reader's own readings", () => {
	it("keep a waiting place under the reader who is signed in", () => {
		const model = as(readerBea, {
			places: {
				"w-carl": {
					sentence: Sentence.make("OEBPS/ch1.xhtml#ps-2"),
					time: null,
					page: null,
					at: 2000,
					commandId: "s:1",
				},
			},
		});

		const commands = sendWaiting(model);

		expect(names(commands)).toStrictEqual(["KeepPlace"]);
		expect(targetsOf(commands)).toStrictEqual([
			{ target: readingOf(BEA, WorkId.make("w-carl")) },
		]);
	});

	it("send no place that belongs to another reader", () => {
		const model = Model.make({
			...as(readerBea),
			placesReader: Option.some(ADA),
			places: {
				"w-carl": {
					sentence: Sentence.make("OEBPS/ch1.xhtml#ps-2"),
					time: null,
					page: null,
					at: 2000,
					commandId: "s:1",
				},
			},
		});

		expect(sendWaiting(model)).toStrictEqual([]);
	});

	it.each(["open", "finish", "setAside"] as const)(
		"%s the reader's own reading",
		(move) => {
			const sent = sendMove(as(adminAda), "w-carl", move, 1000);

			expect(targetsOf(sent.commands ?? [])).toStrictEqual([
				{ target: readingOf(ADA, WorkId.make("w-carl")) },
			]);
		}
	);

	it("send no move when nobody is signed in", () => {
		expect(sendMove(base, "w-carl", "finish", 1000).commands).toBeUndefined();
	});

	it("store each reader's places under their own key", () => {
		expect(placesStoreOf(ADA)).toBe("prosody:places:u-ada");
		expect(placesStoreOf(BEA)).not.toBe(placesStoreOf(ADA));
	});

	it("load the signed-in reader's places before sending any", () => {
		const { model, commands } = update(base, signedInMe(readerBea));

		expect(AuthState.guards.SignedIn(model.auth)).toBeTruthy();
		expect(names(commands ?? [])).toStrictEqual(["SaveReader", "LoadPlaces"]);

		const loaded = update(
			model,
			Message.LoadedPlaces({ reader: BEA, places: waiting })
		);

		expect(loaded.model.placesReader).toStrictEqual(Option.some(BEA));
		expect(names(loaded.commands ?? [])).toStrictEqual(["KeepPlace"]);
	});
});

describe("another reader signing in elsewhere", () => {
	it("reload the page as the new reader when the saved places are someone else's", () => {
		const { model, commands } = update(
			Model.make({ ...base, placesReader: Option.some(ADA), places: waiting }),
			signedInMe(readerBea)
		);

		expect(model.auth).toStrictEqual(AuthState.Checking());
		expect(model.placesReader).toStrictEqual(Option.some(ADA));
		expect(names(commands ?? [])).toStrictEqual(["Reload"]);
		expect(commands?.[0]?.args).toStrictEqual({ user: readerBea, href: "/" });
	});

	it("reload the page as the new reader when the page was running as another", () => {
		const { commands } = update(
			as(adminAda, { places: waiting, route: AppRoute.Desk() }),
			signedInMe(readerBea)
		);

		expect(names(commands ?? [])).toStrictEqual(["Reload"]);
		expect(commands?.[0]?.args).toStrictEqual({
			user: readerBea,
			href: "/desk",
		});
	});
});

describe("a socket that no longer counts as signed in", () => {
	it("reload instead of resending places when a kept place is denied", () => {
		const denied = update(as(readerBea, { places: waiting }), deniedKeep);

		expect(denied.model.socketStale).toBeTruthy();
		expect(names(denied.commands ?? [])).toStrictEqual(["FetchMe"]);

		const { commands } = update(denied.model, signedInMe(readerBea));

		expect(names(commands ?? [])).toStrictEqual(["Reload"]);
	});

	it.each([
		Message.FailedWatchShelf({ reason: "SignedOut" }),
		Message.FailedWatchNightstand({ reason: "SignedOut" }),
		Message.FailedWatchPlace({ reason: "SignedOut" }),
		Message.FailedWatchWanted({ reason: "SignedOut" }),
	])(
		"reload after $_tag says signed out but Prosody says signed in",
		(failure) => {
			const failed = update(as(readerBea, { places: waiting }), failure);

			expect(failed.model.socketStale).toBeTruthy();
			expect(failed.model.isOnline).toBeTruthy();
			expect(names(failed.commands ?? [])).toContain("FetchMe");

			const { commands } = update(failed.model, signedInMe(readerBea));

			expect(names(commands ?? [])).toStrictEqual(["Reload"]);
		}
	);

	it("send the reader to sign in when Prosody agrees they are signed out", () => {
		const failed = update(
			as(readerBea),
			Message.FailedWatchShelf({ reason: "SignedOut" })
		);

		const { model, commands } = update(
			failed.model,
			Message.ReceivedMe({ me: meFor(Option.none()) })
		);

		expect(AuthState.guards.SignedOut(model.auth)).toBeTruthy();
		expect(names(commands ?? [])).toStrictEqual(["ForgetReader", "Redirect"]);
	});
});

describe("opening a book before Prosody says who is signed in", () => {
	it("stamp the book open once the reader is known", () => {
		const cold = Model.make({
			...base,
			route: AppRoute.Room({ work: "w-carl" }),
			room: Option.some(roomOf("w-carl", false)),
		});

		const opened = update(
			cold,
			Message.OpenedCopy({
				work: "w-carl",
				contents: openCarl.book.contents,
				timeline: [],
			})
		);

		const stamped = update(
			opened.model,
			Message.Stamped({ work: "w-carl", move: "open", at: 1000 })
		);

		expect(stamped.commands ?? []).toStrictEqual([]);
		expect(
			Option.exists(stamped.model.room, (room) => room.hasOpened)
		).toBeFalsy();

		const { commands } = update(stamped.model, signedInMe(readerBea));

		const stamps = (commands ?? []).filter(
			(command) => command.name === "Stamp"
		);

		expect(stamps.map((command) => command.args)).toStrictEqual([
			{ work: "w-carl", move: "open" },
		]);
	});
});

describe("asking Prosody who is signed in", () => {
	it.effect("give up after a while when Prosody never answers", () =>
		Effect.gen(function* () {
			const fiber = yield* fetchMe.pipe(
				Effect.provideService(HttpClient.HttpClient, hanging),
				Effect.flip,
				Effect.forkChild
			);

			yield* TestClock.adjust(ANSWER_WITHIN);

			const error = yield* Fiber.join(fiber);

			assert.strictEqual(error._tag, "TimeoutError");
			assert.strictEqual(
				reasonOf(error),
				"Can't reach Prosody. Check your connection and try again."
			);
		})
	);

	it("read kept copies as the saved reader once the check gives up", () => {
		const { model } = update(
			Model.make({
				...base,
				route: AppRoute.Room({ work: "w-carl" }),
				savedReader: Option.some(readerBea),
				placesReader: Option.some(BEA),
				copies: { "w-carl": { title: "Carl", author: "Matt", bytes: 10 } },
			}),
			Message.FailedMe({ reason: "Can't reach Prosody." })
		);

		expect(model.isOnline).toBeFalsy();
		expect(model.auth).toStrictEqual(
			AuthState.SignedIn({ user: readerBea, session: Option.none() })
		);
	});
});

describe("coming back online on the account page", () => {
	it("keep a new invite link and an edited device name", () => {
		const created = Option.some("https://example.com/invite/abc");
		const deviceName = Option.some("Kitchen tablet");

		const { model, commands } = update(
			as(adminAda, {
				route: AppRoute.Account(),
				account: { ...EMPTY_ACCOUNT, created, deviceName },
			}),
			signedInMe(adminAda)
		);

		expect(model.account.created).toStrictEqual(created);
		expect(model.account.deviceName).toStrictEqual(deviceName);
		expect(names(commands ?? [])).toContain("FetchSessions");
	});
});

describe("signing in with single sign-on", () => {
	const options = {
		localAuth: true,
		oidc: Option.some({ displayName: "Pocket ID" }),
	};

	const signInView = (model: Model, h: Parameters<typeof loginView>[3]) =>
		loginView(model, options, "/desk", h);

	it("link to single sign-on with the way back", () => {
		expect(() => {
			Scene.scene(
				{ update, view: signInView },
				Scene.given(base),
				Scene.expect(
					Scene.role("link", { name: "Sign in with Pocket ID" })
				).toHaveAttr("href", "/auth/oidc/start?redirect=%2Fdesk")
			);
		}).not.toThrow();
	});

	it("offer no single sign-on link while offline", () => {
		expect(() => {
			Scene.scene(
				{ update, view: signInView },
				Scene.given(Model.make({ ...base, isOnline: false })),
				Scene.expect(
					Scene.role("button", { name: "Sign in with Pocket ID" })
				).toBeDisabled(),
				Scene.expect(
					Scene.role("link", { name: "Sign in with Pocket ID" })
				).toBeAbsent()
			);
		}).not.toThrow();
	});

	it("come back to the same page after a password as after single sign-on", () => {
		const { commands } = update(
			Model.make({
				...base,
				route: AppRoute.Room({ work: "w-carl" }),
				auth: AuthState.SignedOut({
					setupRequired: false,
					localAuth: true,
					oidc: Option.none(),
				}),
				authForm: {
					displayName: "",
					username: "bea",
					password: "a long password",
					isSubmitting: false,
					problem: Option.none(),
				},
			}),
			Message.SubmittedLogin()
		);

		expect(commands?.[0]?.args).toStrictEqual({
			username: "bea",
			password: "a long password",
			redirect: "/read/w-carl",
		});
	});
});

describe("signing out", () => {
	it("check who is signed in when a watch says signed out", () => {
		const { model, commands } = update(
			as(readerBea),
			Message.FailedWatchShelf({ reason: "SignedOut" })
		);

		expect(model.isOnline).toBeTruthy();
		expect(names(commands ?? [])).toStrictEqual(["FetchMe"]);
	});

	it("still count a dropped watch as a lost connection", () => {
		const { model, commands } = update(
			as(readerBea),
			Message.FailedWatchNightstand({ reason: "The connection failed" })
		);

		expect(model.isOnline).toBeFalsy();
		expect(names(commands ?? [])).toStrictEqual(["TryAgain"]);
	});

	it("ask again who is signed in when a reader may not watch the desk", () => {
		const { model, commands } = update(
			as(readerBea, { route: AppRoute.Desk() }),
			Message.FailedWatchWanted({ reason: "Forbidden" })
		);

		expect(model.isOnline).toBeTruthy();
		expect(model.socketStale).toBeFalsy();
		expect(model.wanted).toStrictEqual(Option.none());
		expect(names(commands ?? [])).toStrictEqual(["FetchMe"]);
	});

	it("turn a demoted admin's desk into the notice without reloading", () => {
		const forbidden = update(
			as(adminAda, { route: AppRoute.Desk() }),
			Message.FailedWatchWanted({ reason: "Forbidden" })
		);

		const { model, commands } = update(
			forbidden.model,
			signedInMe({ ...adminAda, role: "reader" })
		);

		expect(names(commands ?? [])).not.toContain("Reload");
		expect(canWatchWanted(model)).toBeFalsy();
		expect(() => {
			Scene.scene(
				{ update, view: deskView },
				Scene.given(model),
				Scene.expect(Scene.text("The desk is for admins")).toExist()
			);
		}).not.toThrow();
	});

	it("send a signed-out reader to sign in, coming back after", () => {
		const { model, commands } = update(
			as(readerBea, { route: AppRoute.Desk() }),
			Message.ReceivedMe({ me: meFor(Option.none()) })
		);

		expect(AuthState.guards.SignedOut(model.auth)).toBeTruthy();
		expect(model.places).toStrictEqual({});
		expect(names(commands ?? [])).toStrictEqual(["ForgetReader", "Redirect"]);
		expect(commands?.[1]?.args).toStrictEqual({
			url: "/login?redirect=%2Fdesk",
		});
	});

	it("fall back to the saved reader when Prosody does not answer", () => {
		const { model } = update(
			Model.make({ ...base, savedReader: Option.some(readerBea) }),
			Message.FailedMe({ reason: "unreachable" })
		);

		expect(model.isOnline).toBeFalsy();
		expect(model.auth).toStrictEqual(
			AuthState.SignedIn({ user: readerBea, session: Option.none() })
		);
	});
});
