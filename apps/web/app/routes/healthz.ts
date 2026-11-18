/**
 * `GET /healthz`: the web service's own health check (Railway's web health check path).
 *
 * It answers 200 `ok` from this process alone: no API call, no cookie or session work, no Apollo
 * client. It is a resource route (a loader and no component) registered outside every layout, so
 * React Router runs this loader only, not the root, signed-in or public layout loaders. The web
 * health check then says whether this server is up, and stays green while the API is down (the
 * API has its own check on `/api/uptime`).
 */
export function loader(): Response {
  return new Response('ok', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
