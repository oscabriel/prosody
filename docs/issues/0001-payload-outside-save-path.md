# A payload outside the category's save path is recorded as empty

**Where**: `payloadOf` in `packages/server/src/QBittorrent.ts`

A payload is named by cutting the category's `save_path` off the front of the torrent's `content_path`. When the content is anywhere else, the payload is recorded as an empty string, and shelving then refuses it for good. The comment said only "empty when it is elsewhere".

**To fix**: Report a download whose content is outside the downloads as a stall with that reason, or resolve its path against the downloads folder, so the desk says what is wrong.
