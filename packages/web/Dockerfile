# The Api's base image: Bun, and the web app's build. Alchemy builds the Api on top of it.
FROM oven/bun:1

COPY dist /page

# The Api holds tailscaled's socket. tailscaled lets root, and you as its operator, change its
# settings through it; anyone else may only ask who is who, which is all the Api does.
USER nobody
