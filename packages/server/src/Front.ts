import * as Docker from "@alchemy.run/docker";

/**
 * The network the services meet on. The cluster's own network admits only the cluster, and Caddy
 * (host networking) can join no swarm network, so the relay and the press reach the Api here.
 */
export const Front = Docker.Network("Front", {
	driver: "overlay",
	attachable: true,
});

/** The Api's name on the Front network. */
export const API_ALIAS = "prosody-api";

/** The press's name on the cluster's network, where the runner asks it to align a pair. */
export const PRESS_ALIAS = "prosody-press";
