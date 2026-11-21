# Place watch uses a dummy work id when no room is open

**Where:** `NO_ROOM` and `subscriptions.place` in `packages/web/src/Main.ts`

## What is wrong

`Prosody.Place.watch` (from `@alchemy.run/domain/Foldkit`) requires `key` to always return a `WorkId`, even when `isEnabled` returns `false`. Although `subscriptions.place` disables the stream when no room is open (`isEnabled: (model: Model) => model.isOnline && Option.isSome(model.room)`), `modelToDependencies` still evaluates `key(model)` unconditionally, so `Main.ts` supplies the sentinel `NO_ROOM` (`WorkId.make("w-none")`).

## What it costs

A fake `WorkId` (`"w-none"`) exists in application code solely to satisfy `watch`'s type signature. If `isEnabled` were ever omitted or misconfigured, the client would subscribe to a non-existent work.

## How to fix

Either update `@alchemy.run/domain/Foldkit`'s `watch` helper to accept `key: (model: Model) => Option.Option<ReadKey<V>>` (disabling the stream on `Option.none()`), or replace `Prosody.Place.watch` in `packages/web/src/Main.ts` with a direct `Subscription.make` entry keyed on `Schema.Option(WorkId)` (like `copying` in the same file).
