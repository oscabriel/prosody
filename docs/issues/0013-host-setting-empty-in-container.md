# A host setting reads as empty inside a container

**Where**: `onHost` in `packages/server/src/Host.ts`

Alchemy runs a service's settings again as its container starts, where there is no `.env`. So a required setting that is missing stops a plan but silently becomes an empty string at run time, on the argument that nothing reads it there.

**To fix**: Read host settings only while planning, or pass the resolved values into the container, so a setting can never be empty where code could use it.
