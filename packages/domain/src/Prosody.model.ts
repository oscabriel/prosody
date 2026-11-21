import * as Domain from "@alchemy.run/domain";
import { Layer } from "effect";

import {
	Downloading,
	DownloadingLive,
} from "./Acquisition/Downloading.policy.ts";
import { Grab } from "./Acquisition/Grab.aggregate.ts";
import { Grabbing, GrabbingLive } from "./Acquisition/Grabbing.policy.ts";
import {
	ReleaseSearch,
	ReleaseSearchLive,
} from "./Acquisition/ReleaseSearch.policy.ts";
import { Releasing, ReleasingLive } from "./Acquisition/Releasing.policy.ts";
import { Want } from "./Acquisition/Want.aggregate.ts";
import { Wanted, WantedLive } from "./Acquisition/Wanted.view.ts";
import { Cataloguing, CataloguingLive } from "./Library/Cataloguing.policy.ts";
import { Shelf, ShelfLive } from "./Library/Shelf.view.ts";
import { ShelfmarkClaim } from "./Library/ShelfmarkClaim.aggregate.ts";
import { Shelving, ShelvingLive } from "./Library/Shelving.policy.ts";
import { Work } from "./Library/Work.aggregate.ts";
import { Alignment, AlignmentLive } from "./Narration/Alignment.policy.ts";
import { Narration } from "./Narration/Narration.aggregate.ts";
import { Copy } from "./Reading/Copy.aggregate.ts";
import { Nightstand, NightstandLive } from "./Reading/Nightstand.view.ts";
import { Place, PlaceLive } from "./Reading/Place.view.ts";
import { Reading } from "./Reading/Reading.aggregate.ts";
import { ReadingCopy, ReadingCopyLive } from "./Reading/ReadingCopy.policy.ts";

export class Prosody extends Domain.Model("Prosody", {
	aggregates: [Want, Grab, Work, ShelfmarkClaim, Narration, Copy, Reading],
	views: [Wanted, Shelf, Place, Nightstand],
	policies: [
		ReleaseSearch,
		Grabbing,
		Downloading,
		Releasing,
		Cataloguing,
		Shelving,
		Alignment,
		ReadingCopy,
	],
}) {}

export const ProsodyHandlers = Layer.mergeAll(
	ReleaseSearchLive,
	GrabbingLive,
	DownloadingLive,
	ReleasingLive,
	CataloguingLive,
	ShelvingLive,
	AlignmentLive,
	ReadingCopyLive,
	WantedLive,
	ShelfLive,
	PlaceLive,
	NightstandLive
);
