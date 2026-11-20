import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Release } from "./Release.ts";

/** What a search found, the most seeded first. None is an answer too. */
export class ReleasesOffered extends Domain.Event("ReleasesOffered", {
	releases: Schema.Array(Release),
}) {}

/**
 * Offer what a search found for the book. The ReleaseSearch policy sends it; an answer to a search
 * that is no longer the latest, or for a book no longer wanted, records nothing.
 */
export class OfferReleases extends Domain.Command("OfferReleases", {
	target: WorkId,
	input: { search: Schema.Int, releases: Schema.Array(Release) },
	events: [ReleasesOffered],
}) {}
