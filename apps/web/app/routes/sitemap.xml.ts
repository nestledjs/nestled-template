import { generateRemixSitemap } from '@forge42/seo-tools/remix/sitemap'
import type { Route } from './+types/sitemap.xml'
import { href } from 'react-router'

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { routes } = await import('virtual:react-router/server-build')
  const { origin } = new URL(request.url)

  const sitemap = await generateRemixSitemap({
    domain: origin,
    // @ts-expect-error Doesn't properly handle * routes
    ignore: [href('/admin*'), href('/members*')],
    routes,
  })

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
