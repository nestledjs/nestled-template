# When building, tag the image with your project name, e.g.:
# docker build -f .dev/Dockerfile -t your-scope .
#
# To run it against the development services in .dev/docker-compose.yml, join the compose network
# and use the service names as hosts (`postgres`, `postgres-test`, `redis`, `mailhog`) with the
# container ports (5432, 6379, 1025), not `localhost` or `host.docker.internal`:
# docker run --network <compose project name>_default \
#   -e DATABASE_URL=postgresql://<user>:<password>@postgres:5432/<database> \
#   -e REDIS_URL=redis://redis:6379 your-scope
# The compose project name is the `name:` at the top of .dev/docker-compose.yml. The services are
# published on 127.0.0.1 only, so `host.docker.internal` reaches them with Docker Desktop but not
# on Linux, where it is the bridge's address rather than the host's loopback.

FROM node:22.23.4-slim

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm build

CMD ["pnpm", "start"]
