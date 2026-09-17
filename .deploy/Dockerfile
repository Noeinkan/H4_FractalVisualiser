# fractal — the demo server image.
# Derived from hetzner-site's Dockerfile.node, minus the install and build
# steps: demo/server.mjs uses Node built-ins only, so there is nothing to
# install and nothing to compile. Node 22.13+ for node:sqlite without a flag.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node repo/ /app/
# The session database lives on a named volume mounted here. Creating the
# directory in the image, owned by node, is what gives a fresh volume the
# right owner: an empty named volume copies it on first mount.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "demo/server.mjs"]
