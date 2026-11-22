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

- An offline banner appears at the top of each screen. Inside a reading room, it confirms that your place is saved on the device and will be sent when you reconnect.
- The shelf shows only the books kept on that device. Clicking **Show all titles** reveals the rest of the library, labelled `Not on this device`, until you are back online.
- The desk disables its form and action buttons until the connection returns.
- Every place you reach while offline is stored in local browser storage and sent to the host as soon as the connection returns.

## Keeping a book on a device

To read or listen offline, open a book while online and click **Keep on this device** in the book menu (**···**), or **Keep** in the full player. Prosody downloads the book's entire reading copy into browser cache storage: its text, timeline, cover, rendered PDF pages and audio (fetched in 8 MB pieces).

While downloading, the book menu displays progress and a **Stop** button, and the top bar on the shelf and desk tracks progress as well. Once stored, the book shows `Kept` on the shelf, and the **On this device** filter chip shows how many books are kept and how much space they occupy.

| Edition type | Typical size on device |
|---|---|
| Synced book or audio alone | Roughly the size of its `.m4b` file |
| Text alone (EPUB) | A few megabytes |
| Printed pages (PDF) | Depends on page count; each page is stored as a 1600 px JPEG |

To free space, open the book menu, click **Remove** and confirm. Removing a kept copy deletes only the browser cache on that device; your reading place and the copy on your host are untouched.

## Limits to keep in mind

- **Phone audio is lightly tested.** Background playback, lock-screen controls and offline playback have only been verified on an iPhone in short runs of one to four minutes. Long sessions, interruptions (calls, other apps, Bluetooth) and Android playback are untested.
- **Browser storage eviction.** Prosody requests persistent storage when keeping a book, but a mobile browser may still evict site caches when the device runs low on space. If that happens, keep the book again when you are back online.
- **Native app.** There is no native mobile app yet; a native iOS app is planned next.
