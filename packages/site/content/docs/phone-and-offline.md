---
title: On your phone, and offline
summary: Installing Prosody to a phone home screen, lock-screen playback, offline reading and keeping books on a device.
order: 8
---

Prosody is a web app that installs directly from your browser. Once installed, it opens full screen, shows playback controls on the lock screen and works without a network connection.

## Installing on a phone

There is no app store listing. Make sure Tailscale is running on your phone, open your Prosody address in the browser and add it to the home screen:

- **iPhone or iPad (Safari):** Tap Share, then **Add to Home Screen**.
- **Android (Chrome):** Open the browser menu, then tap **Add to Home screen** or **Install app**.

## Lock-screen playback

While audio is playing, Prosody publishes the book's title, author, current chapter and cover to the system media controls, along with play, pause, skip back 15 seconds, skip forward 30 seconds and scrub controls.

## Reading without a network

A service worker caches the app shell so Prosody opens even when your device is offline. When it cannot reach your host:

- The side panel displays **Offline**: `Your place is kept on this device, and sent when you are back.`
- The shelf shows the books you have kept on that device under `Can't reach the shelf. These are the books kept on this device.`
- Every place you reach while offline is stored in local browser storage and sent to the host as soon as the connection returns.

## Keeping a book on a device

To read or listen offline, open a book while online and click **Keep on this device** in its side panel. Prosody downloads the book's entire reading copy into browser cache storage: its text, timeline, cover, rendered PDF pages and audio (fetched in 8 MB pieces).

While downloading, the side panel shows progress and a **Stop** button. Once stored, the shelf displays the total space used (`Kept on this device: <n> books, <size>.`).

| Edition type | Typical size on device |
|---|---|
| Synced book or audio alone | Roughly the size of its `.m4b` file |
| Text alone (EPUB) | A few megabytes |
| Printed pages (PDF) | Depends on page count; each page is stored as a 1600 px JPEG |

To free space, open the book and click **Remove it**. Removing a kept copy deletes only the browser cache on that device; your reading place and the copy on your host are untouched.

## Limits to keep in mind

- **Phone audio is lightly tested.** Background playback, lock-screen controls and offline playback have only been verified on an iPhone in short runs of one to four minutes. Long sessions, interruptions (calls, other apps, Bluetooth) and Android playback are untested.
- **Browser storage eviction.** Prosody requests persistent storage when keeping a book, but a mobile browser may still evict site caches when the device runs low on space. If that happens, keep the book again when you are back online.
- **Native app.** There is no native mobile app yet; a native iOS app is planned next.
