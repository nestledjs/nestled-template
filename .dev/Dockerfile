# When building, tag the image with your project name, e.g.:
# docker build -f .dev/Dockerfile -t your-scope .

FROM node:22-slim

WORKDIR /workspace

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

CMD ["pnpm", "start"]


