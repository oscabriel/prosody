---
title: When something is wrong
summary: How to check logs and resolve common problems with deploying, signing in, library discovery, syncing and reading.
order: 10
---

## Check the press logs first

Most library and syncing issues are explained in the press service's logs:

```sh
docker service ls | grep -i press
docker service logs --follow <press-service-name>
```

Every library walk logs how many works it found and any folders it could not read, and every alignment logs its start, result or refusal reason.

## Installing and deploying

| Problem | Cause and fix |
|---|---|
| Deploy fails with `PROSODY_LIBRARY is not set. Copy .env.example to .env and fill it in.` | `.env` is missing from the repository root, or `PROSODY_LIBRARY` is blank or commented out. |
| `pnpm deploy` behaves unexpectedly | `pnpm deploy` is a built-in pnpm command. Always run `pnpm run deploy --yes`. |
| First deploy appears to hang | Docker is building the press image and downloading the Parakeet and Whisper ONNX models. Wait several minutes for the build to complete. |

## Signing in

| Problem | Cause and fix |
|---|---|
| Redirected to `/login?error=sso` | Single sign-on failed. Check the Api logs (`docker service logs`) for `"single sign-on failed"` and confirm `PROSODY_PUBLIC_URL`, the registered callback URL (`<PROSODY_PUBLIC_URL>/auth/oidc/callback`) and `OIDC_CLIENT_SECRET`. Set `OIDC_INTERNAL_URL` if container DNS cannot reach the issuer directly. |
| `403` `"Prosody refuses requests from other sites"` | A mutating request arrived from another origin or a cross-site subrequest. Open Prosody directly at its own address. |
| `401` `"Signed out"` | Your session expired or was revoked from another device. Sign in again at `/login`. |

## The shelf

| Problem | Cause and fix |
|---|---|
| The shelf says `Nothing on the shelf yet` | Either the press cannot read `PROSODY_LIBRARY` (check `PROSODY_UID` permissions and the press logs) or folders are not nested as `ebooks/<Author>/<Title>/` and `audiobooks/<Author>/<Title>/`. |
| A specific book is missing | Its folder is not two levels deep under `ebooks/` or `audiobooks/`, or it contains no `.epub`, `.pdf` or `.m4b` file. |
| A book appears twice, once as text and once as audio | The `<Author>` or `<Title>` folder name differs between `ebooks/` and `audiobooks/`. Rename one so they match character for character; the next walk pairs them. |
| A network share dropped out | The press logs the unreadable folders and the shelf keeps its existing entries. Once the share returns, the next walk (every five minutes) catches up. |
| A book shows a plain initial instead of a cover | Neither the EPUB nor the audiobook contained a cover image that `ffmpeg` could extract. |

## Syncing

| Problem | Cause and fix |
|---|---|
| A book stays `Syncing…` for an hour | Normal for a long audiobook on CPU. Check the press logs to confirm it is progressing; each attempt has a six-hour timeout. |
| A book is marked `Not synced` | Open the book, read the reason under **Technical details**, and look it up in [Syncing a book](/docs/syncing-a-book). Once the cause is fixed, click **Align it again**. |
| Many sentences are never highlighted | Expected in technical books where code listings, tables and captions are skipped by the narrator. |
| The highlight drifts from the voice | Open an issue on the repository noting the book and where the drift starts. |

## Reading

| Problem | Cause and fix |
|---|---|
| The app shows `Offline` while you have internet | The app lost contact with your host (for example during a deploy or when your VPN disconnected). It checks again every five seconds and reconnects automatically. |
| A book opens at an older place | Another device read further while offline and has not synced yet. Open Prosody on that device while online so it sends its saved place. |
| Opening a book shows `Align it again` or `Make it now` | Its reading copy is missing, failed to build or predates the reading room format. Click the button; the room opens automatically when the press finishes. |

## Reporting a bug

Open an issue on the repository with what you did, what you saw and the relevant lines from the press logs. Leave out your domain name and local paths if you prefer not to share them.
