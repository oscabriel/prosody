import * as Docker from "@alchemy.run/docker";

export const Front = Docker.Network("Front", {
	driver: "overlay",
	attachable: true,
});

export const API_ALIAS = "prosody-api";

export const PRESS_ALIAS = "prosody-press";
