# When building, tag the image with your project name, e.g.:
# docker build -f .dev/Dockerfile -t your-scope .

FROM node:22-slim

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.8.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm build

CMD ["pnpm", "start"]
