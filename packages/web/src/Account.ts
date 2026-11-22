import type { Role } from "@prosody/domain/Reader.id";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { deviceNameIn } from "./AccountUpdate.ts";
import { ConfirmAction, Message } from "./Model.ts";
import type { AuthSession, AuthUser, Invite, Model } from "./Model.ts";
import { isAdmin, userOf } from "./Readers.ts";
import { badgeView } from "./Ui.ts";

const dateOf = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

const roleLabel = (role: Role): string =>
	role === "admin" ? "Admin" : "Reader";

const roleBadge = (role: Role, h: HtmlBuilder<Message>): Html =>
	badgeView(roleLabel(role), role === "admin" ? "ink" : "neutral", false, h);

const sectionView = (
	id: string,
	title: string,
	lede: string,
	children: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html => {
	const ledes =
		lede === "" ? [] : [h.p([h.Class("account-section-lede")], [lede])];

	return h.section(
		[h.Class("account-section"), h.AriaLabelledBy(id)],
		[
			h.h2([h.Class("account-section-title"), h.Id(id)], [title]),
			...ledes,
			...children,
		]
	);
};

const loadingView = (label: string, h: HtmlBuilder<Message>): Html =>
	h.p([h.Class("account-quiet"), h.Role("status")], [label]);

const headerView = (
	model: Model,
	user: AuthUser,
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[h.Class("page-header account-header")],
		[
			h.div(
				[h.Class("account-header-text")],
				[
					h.h1([h.Class("page-title")], ["Account"]),
					h.p(
						[h.Class("account-identity")],
						[
							h.span([h.Class("account-identity-name")], [user.displayName]),
							h.span(
								[h.Class("account-identity-handle")],
								[`@${user.username}`]
							),
							roleBadge(user.role, h),
						]
					),
				]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("btn btn-secondary"),
					h.Disabled(!model.isOnline),
					h.OnClick(Message.ClickedSignOut()),
				],
				["Sign out"]
			),
		]
	);

const problemView = (model: Model, h: HtmlBuilder<Message>) =>
	Option.match(model.account.problem, {
		onNone: () => [],
		onSome: (problem) => [
			h.div(
				[h.Class("banner banner-danger"), h.Role("alert")],
				[h.span([], [problem])]
			),
		],
	});

const offlineView = (model: Model, h: HtmlBuilder<Message>) =>
	model.isOnline
		? []
		: [
				h.div(
					[h.Class("banner banner-warn"), h.Role("status")],
					[
						h.div(
							[h.Class("banner-lead")],
							[
								h.span([h.Class("dot"), h.AriaHidden(true)], []),
								h.span(
									[],
									["Offline. Your account can be changed once Prosody answers."]
								),
							]
						),
					]
				),
			];

const deviceView = (model: Model, h: HtmlBuilder<Message>): Html =>
	sectionView(
		"account-device",
		"This device",
		"The name your other devices see in their list.",
		[
			h.form(
				[
					h.Class("account-form"),
					h.Novalidate(true),
					h.AriaLabel("Rename this device"),
					h.OnSubmit(Message.SubmittedDeviceName()),
				],
				[
					h.div(
						[h.Class("field-group")],
						[
							h.label(
								[h.Class("field-label"), h.For("device-name")],
								["Device name"]
							),
							h.input([
								h.Id("device-name"),
								h.Class("input"),
								h.Name("deviceName"),
								h.Value(deviceNameIn(model)),
								h.Maxlength(64),
								h.Autocomplete("off"),
								h.Disabled(!model.isOnline),
								h.OnInput((value) => Message.ChangedDeviceName({ value })),
							]),
						]
					),
					h.button(
						[
							h.Type("submit"),
							h.Class("btn btn-primary"),
							h.Disabled(!model.isOnline),
						],
						["Save"]
					),
				]
			),
		],
		h
	);

const signOutButtonsOf = (
	model: Model,
	session: AuthSession,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	session.current
		? []
		: [
				h.button(
					[
						h.Type("button"),
						h.Class("btn btn-danger-ghost btn-sm"),
						h.Disabled(!model.isOnline),
						h.OnClick(
							Message.RequestedConfirm({
								action: ConfirmAction.RevokeSession({
									id: session.id,
									deviceName: session.deviceName,
								}),
							})
						),
					],
					["Sign out"]
				),
			];

const sessionView = (
	model: Model,
	session: AuthSession,
	h: HtmlBuilder<Message>
): Html => {
	const hereBadge = session.current
		? [badgeView("This device", "ok", true, h)]
		: [];

	const signOutButtons = signOutButtonsOf(model, session, h);

	return h.keyed("li")(
		session.id,
		[h.Class("account-row")],
		[
			h.div(
				[h.Class("account-row-main")],
				[
					h.div(
						[h.Class("account-row-title")],
						[h.span([], [session.deviceName]), ...hereBadge]
					),
					h.p(
						[h.Class("account-row-meta tabular")],
						[
							`Last seen ${dateOf(session.lastSeenAt)} · Signed in ${dateOf(session.createdAt)}`,
						]
					),
				]
			),
			...signOutButtons,
		]
	);
};

const sessionsView = (model: Model, h: HtmlBuilder<Message>): Html =>
	sectionView(
		"account-sessions",
		"Signed-in devices",
		"Sign out of a device you no longer use. Books kept on it stay there.",
		[
			Option.match(model.account.sessions, {
				onNone: () =>
					loadingView(
						model.isOnline
							? "Loading devices…"
							: "Devices show here once Prosody answers.",
						h
					),
				onSome: (sessions) =>
					h.ul(
						[h.Class("account-list")],
						sessions.map((session) => sessionView(model, session, h))
					),
			}),
		],
		h
	);

const roleOptionView = (
	model: Model,
	role: Role,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class("segmented-btn"),
			h.AriaPressed(String(model.account.inviteRole === role)),
			h.OnClick(Message.SelectedInviteRole({ role })),
		],
		[roleLabel(role)]
	);

const createdView = (url: string, h: HtmlBuilder<Message>): Html =>
	h.div(
		[h.Class("invite-link"), h.Role("status")],
		[
			h.label([h.Class("field-label"), h.For("invite-url")], ["Invite link"]),
			h.div(
				[h.Class("invite-link-row")],
				[
					h.input([
						h.Id("invite-url"),
						h.Class("input invite-link-url"),
						h.Value(url),
						h.Readonly(true),
						h.Spellcheck(false),
					]),
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-secondary"),
							h.OnClick(Message.ClickedCopyInvite({ url })),
						],
						["Copy link"]
					),
				]
			),
			h.p(
				[h.Class("field-hint")],
				["Anyone with this link can make one account. Send it privately."]
			),
		]
	);

const inviteFormView = (model: Model, h: HtmlBuilder<Message>): Html =>
	sectionView(
		"account-invite",
		"Invite someone",
		"Readers have their own places and nightstand. Admins can also run the desk and manage accounts.",
		[
			h.form(
				[
					h.Class("account-form invite-form"),
					h.Novalidate(true),
					h.AriaLabel("Create an invite"),
					h.OnSubmit(Message.SubmittedInvite()),
				],
				[
					h.div(
						[h.Class("field-group invite-role")],
						[
							h.span([h.Class("field-label"), h.Id("invite-role")], ["Role"]),
							h.div(
								[
									h.Class("segmented"),
									h.Role("group"),
									h.AriaLabelledBy("invite-role"),
								],
								[
									roleOptionView(model, "reader", h),
									roleOptionView(model, "admin", h),
								]
							),
						]
					),
					h.div(
						[h.Class("field-group")],
						[
							h.label(
								[h.Class("field-label"), h.For("invite-note")],
								["Note (optional)"]
							),
							h.input([
								h.Id("invite-note"),
								h.Class("input"),
								h.Name("note"),
								h.Value(model.account.inviteNote),
								h.Placeholder("e.g. For Sam"),
								h.Maxlength(200),
								h.Autocomplete("off"),
								h.Disabled(!model.isOnline),
								h.OnInput((value) => Message.ChangedInviteNote({ value })),
							]),
						]
					),
					h.button(
						[
							h.Type("submit"),
							h.Class("btn btn-primary"),
							h.Disabled(!model.isOnline || model.account.isCreating),
							h.AriaBusy(model.account.isCreating),
						],
						[model.account.isCreating ? "Creating…" : "Create invite"]
					),
				]
			),
			...Option.match(model.account.created, {
				onNone: () => [],
				onSome: (url) => [createdView(url, h)],
			}),
		],
		h
	);

const inviteRowView = (
	model: Model,
	invite: Invite,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("li")(
		invite.id,
		[h.Class("account-row")],
		[
			h.div(
				[h.Class("account-row-main")],
				[
					h.div(
						[h.Class("account-row-title")],
						[
							roleBadge(invite.role, h),
							h.span(
								[h.Class(invite.note === "" ? "account-quiet" : "")],
								[invite.note === "" ? "No note" : invite.note]
							),
						]
					),
					h.p(
						[h.Class("account-row-meta tabular")],
						[
							`Made ${dateOf(invite.createdAt)} · Expires ${dateOf(invite.expiresAt)}`,
						]
					),
				]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("btn btn-danger-ghost btn-sm"),
					h.Disabled(!model.isOnline),
					h.OnClick(
						Message.RequestedConfirm({
							action: ConfirmAction.RevokeInvite({
								id: invite.id,
								role: invite.role,
							}),
						})
					),
				],
				["Revoke"]
			),
		]
	);

const invitesView = (model: Model, h: HtmlBuilder<Message>): Html =>
	sectionView(
		"account-invites",
		"Pending invites",
		"",
		[
			Option.match(model.account.invites, {
				onNone: () => loadingView("Loading invites…", h),
				onSome: (invites) =>
					invites.length === 0
						? loadingView("No invites are waiting.", h)
						: h.ul(
								[h.Class("account-list")],
								invites.map((invite) => inviteRowView(model, invite, h))
							),
			}),
		],
		h
	);

const removeButtonsOf = (
	model: Model,
	reader: AuthUser,
	isSelf: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	isSelf
		? []
		: [
				h.button(
					[
						h.Type("button"),
						h.Class("btn btn-danger-ghost btn-sm"),
						h.Disabled(!model.isOnline),
						h.OnClick(
							Message.RequestedConfirm({
								action: ConfirmAction.RemoveReader({
									id: reader.id,
									displayName: reader.displayName,
								}),
							})
						),
					],
					["Remove"]
				),
			];

const readerRowView = (
	model: Model,
	reader: AuthUser,
	self: AuthUser,
	h: HtmlBuilder<Message>
): Html => {
	const isSelf = reader.id === self.id;
	const next: Role = reader.role === "admin" ? "reader" : "admin";
	const selfBadge = isSelf ? [badgeView("You", "ok", false, h)] : [];
	const removeButtons = removeButtonsOf(model, reader, isSelf, h);

	return h.keyed("li")(
		reader.id,
		[h.Class("account-row")],
		[
			h.div(
				[h.Class("account-row-main")],
				[
					h.div(
						[h.Class("account-row-title")],
						[
							h.span([], [reader.displayName]),
							roleBadge(reader.role, h),
							...selfBadge,
						]
					),
					h.p(
						[h.Class("account-row-meta")],
						[`@${reader.username} · Joined ${dateOf(reader.createdAt)}`]
					),
				]
			),
			h.div(
				[h.Class("account-row-actions")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-secondary btn-sm"),
							h.Disabled(isSelf || !model.isOnline),
							h.Title(isSelf ? "You cannot change your own role" : ""),
							h.OnClick(
								Message.ClickedChangeRole({ id: reader.id, role: next })
							),
						],
						[next === "admin" ? "Make admin" : "Make reader"]
					),
					...removeButtons,
				]
			),
		]
	);
};

const readersView = (
	model: Model,
	self: AuthUser,
	h: HtmlBuilder<Message>
): Html =>
	sectionView(
		"account-readers",
		"Readers",
		"Everyone who can open this Prosody.",
		[
			Option.match(model.account.users, {
				onNone: () => loadingView("Loading readers…", h),
				onSome: (users) =>
					h.ul(
						[h.Class("account-list")],
						users.map((reader) => readerRowView(model, reader, self, h))
					),
			}),
		],
		h
	);

const adminSectionsOf = (
	model: Model,
	user: AuthUser,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	isAdmin(model)
		? [
				inviteFormView(model, h),
				invitesView(model, h),
				readersView(model, user, h),
			]
		: [];

export const accountView = (
	model: Model,
	h: HtmlBuilder<Message>
): Document => ({
	title: "Account · Prosody",
	body: Option.match(userOf(model), {
		onNone: () => h.div([], []),
		onSome: (user) =>
			h.div(
				[h.Class("account-page")],
				[
					headerView(model, user, h),
					...offlineView(model, h),
					...problemView(model, h),
					deviceView(model, h),
					sessionsView(model, h),
					...adminSectionsOf(model, user, h),
				]
			),
	}),
});
