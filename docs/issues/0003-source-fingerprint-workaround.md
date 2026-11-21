# `PROSODY_SOURCE` works around the platform missing code-only changes

**Where**: `sourceFingerprint` in `packages/server/src/Source.ts`, and the Api's and the press's settings

Alchemy 2.0.0-beta.87 does not redeploy a service whose code alone changed when its settings depend on other resources, so every service carries a hash of the source as a setting. Every new service must remember to do the same.

**To fix**: Check each Alchemy release; when a code-only change is picked up on its own, remove the fingerprint and the setting.
