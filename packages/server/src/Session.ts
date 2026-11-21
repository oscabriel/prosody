import { Device } from "@prosody/domain/Device.context";
import { Session, SignedOut } from "@prosody/domain/Session.middleware";
import { Effect, Layer, Option } from "effect";
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/http";

import { Tailscale } from "./Tailscale.ts";

export const PEER_HEADER = "x-prosody-peer";

export const DEVICE_HEADER = "x-prosody-device";

const noStore = { "cache-control": "no-store" };

const hostOf = (origin: string): string =>
	URL.canParse(origin) ? new URL(origin).host : "";

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

const refuse = (peer: string, reason: string) =>
	Effect.as(
		Effect.logInfo("refused", { peer, reason }),
		HttpServerResponse.text("Prosody admits only your own devices.", {
			status: 403,
			headers: noStore,
		})
	);

export const authFetch = Effect.map(Effect.service(Tailscale), (tailscale) =>
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const peer = request.headers[PEER_HEADER] ?? "";

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

export const deviceOf = (headers: Headers.Headers): Option.Option<string> =>
	Headers.get(headers, DEVICE_HEADER);

export const SessionLive = Layer.succeed(Session, (effect, { headers }) =>
	Option.match(deviceOf(headers), {
		onNone: () => Effect.fail(new SignedOut()),
		onSome: (device) => Effect.provideService(effect, Device, device),
	})
);

export const signedOut = HttpServerResponse.text("Signed out", {
	status: 401,
	headers: noStore,
});
