import { Device } from "@prosody/domain/Device.context";
import { Session, SignedOut } from "@prosody/domain/Session.middleware";
import { Effect, Layer, Option } from "effect";
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/http";

import { Tailscale } from "./Tailscale.ts";

/** The header Caddy puts on its question: the address the request came from. */
export const PEER_HEADER = "x-prosody-peer";

/** The header the answer carries, and Caddy copies onto every request it lets through. */
export const DEVICE_HEADER = "x-prosody-device";

const noStore = { "cache-control": "no-store" };

/** The host a page's origin names, or nothing for an origin that names none, such as `null`. */
const hostOf = (origin: string): string =>
	URL.canParse(origin) ? new URL(origin).host : "";

/**
 * Whether a request was made by a page of another site. The tailnet vouches for the machine, not
 * for the page, so without this any site open on one of your devices could read and keep places as
 * that device. Prosody's own page names its own host as its origin; from anywhere else, only a link
 * followed to a page is let through.
 */
export const isCrossSite = (headers: Headers.Headers): boolean => {
	const { origin, host } = headers;

	if (origin !== undefined && hostOf(origin) !== host) {
		return true;
	}

	const site = headers["sec-fetch-site"];

	const isPageLoad =
		headers["sec-fetch-mode"] === "navigate" &&
		headers["sec-fetch-dest"] === "document";

	return (site === "cross-site" || site === "same-site") && !isPageLoad;
};

/** A 403 that says nothing more; why goes to the log. */
const refuse = (peer: string, reason: string) =>
	Effect.as(
		Effect.logInfo("refused", { peer, reason }),
		HttpServerResponse.text("Prosody admits only your own devices.", {
			status: 403,
			headers: noStore,
		})
	);

/**
 * `GET /auth`, the question Caddy asks before every request (its `forward_auth`): may this address
 * in? Yes is a 200 naming your machine; no is a 403. Caddy asks with the request's own headers.
 */
export const authFetch = Effect.map(Effect.service(Tailscale), (tailscale) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const peer = request.headers[PEER_HEADER] ?? "";

		// A request sent in TLS early data has no address Caddy can trust yet. 425 asks the browser to
		// send it again once the handshake is done.
		if (peer === "" && request.headers["early-data"] === "1") {
			return HttpServerResponse.text("Too early", {
				status: 425,
				headers: noStore,
			});
		}

		if (isCrossSite(request.headers)) {
			return yield* refuse(
				peer,
				`asked by a page of ${request.headers.origin ?? "another site"}`
			);
		}

		return yield* tailscale.admit(peer).pipe(
			Effect.map((device) =>
				HttpServerResponse.empty({
					status: 200,
					headers: { ...noStore, [DEVICE_HEADER]: device },
				})
			),
			Effect.catchTag("Refused", ({ reason }) => refuse(peer, reason))
		);
	})
);

/**
 * The device Caddy named on a request, after asking `/auth` about it. Only Caddy reaches the relay
 * from outside the host, and it replaces any name a browser sends with its own.
 */
export const deviceOf = (headers: Headers.Headers): Option.Option<string> =>
	Headers.get(headers, DEVICE_HEADER);

/** The Session on the reader's Api: the device Caddy named, or SignedOut. */
export const SessionLive = Layer.succeed(Session, (effect, { headers }) =>
	Option.match(deviceOf(headers), {
		onNone: () => Effect.fail(new SignedOut()),
		onSome: (device) => Effect.provideService(effect, Device, device),
	})
);

/** A request that did not come through Caddy. */
export const signedOut = HttpServerResponse.text("Signed out", {
	status: 401,
	headers: noStore,
});
