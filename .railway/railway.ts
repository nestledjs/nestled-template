import { defineRailway, github, group, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Redis = redis("Redis", { region: "us-east4-eqdc4a" });
  const Postgres = postgres("Postgres", { region: "us-east4-eqdc4a" });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const api = service("api", {
    source: github("nestledjs/nestled-template", { branch: "develop", checkSuites: false }),
    build: "npm run build:api",
    start: "npm run start:api",
    healthcheck: "/api/uptime",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { preDeployCommand: ["pnpm prisma:deploy"] },
    domains: ["template-api.nestledjs.com"],
    env: { ALLOWED_ORIGINS: preserve(), API_COOKIE_DOMAIN: preserve(), APP_ADMIN_EMAILS: preserve(), APP_EMAIL: preserve(), APP_NAME: preserve(), APP_SUPPORT_EMAIL: preserve(), APP_URL: preserve(), COUNT_PRISMA_QUERIES: preserve(), DATABASE_URL: preserve(), EMAIL_PROVIDER: preserve(), HOST: preserve(), JWT_SECRET: preserve(), LOG_PRISMA_QUERIES: preserve(), LOG_QUERY_COMPLEXITY: preserve(), LOG_QUERY_COMPLEXITY_THRESHOLD: preserve(), NODE_ENV: preserve(), PGBOUNCER_ENABLED: preserve(), QUERY_COMPLEXITY_LIMIT: preserve(), QUERY_COMPLEXITY_VERBOSE_ERRORS: preserve(), REDIS_PASSWORD: preserve(), REDIS_URL: preserve(), SITE_URL: preserve(), VITE_COOKIE_NAME: preserve() },
  });
  const web = service("web", {
    source: github("nestledjs/nestled-template", { branch: "develop", checkSuites: false }),
    build: "npm run build:web",
    start: "npm run start:web",
    replicas: { "us-east4-eqdc4a": 1 },
    domains: [{ domain: "template.nestledjs.com", port: 3000 }],
    env: { PORT: preserve(), VITE_API_URL: preserve(), VITE_COOKIE_NAME: preserve() },
  });
  const NestledJsSetupTemplate = group("Nestled.js Setup Template", [Redis, api, Postgres, web]);

  return project("nestled-template", {
    resources: [postgresVolume, redisVolume, NestledJsSetupTemplate],
  });
});
