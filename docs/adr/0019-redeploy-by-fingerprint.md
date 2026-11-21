# A service is redeployed by a fingerprint of what it is built from

The Api and the press carry `PROSODY_SOURCE`, a hash of the source folders they are bundled from, because the platform misses a change to a service's code alone. The Api's base image is tagged with a hash of the web build and its Dockerfile, so a change to either moves the Api. The press's base image is slow to build, so its tag is bumped by hand when its Dockerfile changes, with a tag of its own for a user other than 1000.
