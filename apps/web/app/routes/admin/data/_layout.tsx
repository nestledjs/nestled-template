import * as Sdk from '@nestled-template/shared/sdk'
import { DATABASE_MODELS } from '@nestled-template/shared/sdk'
import { AdminDataProvider, AdminDataLayout } from '@nestledjs/data-browser'
import { formTheme } from '@nestled-template/shared/styles'
import { probeConnectivity } from '../../../api-availability'

// The admin error boundary checks the API with the app shell's own probe (GET /api/uptime, then a
// HEAD on the web app's origin) and revalidates the route once it answers. The probe's `reason`
// tells the panel whether to say "You're offline" or "We're having trouble reaching our servers",
// by the same rule as the app shell's screen. An app with i18n also passes `unavailableCopy`.
const probeAdminApi = () => probeConnectivity()

export default function DataLayoutRoute() {
  return (
    <AdminDataProvider
      sdk={Sdk}
      databaseModels={DATABASE_MODELS}
      basePath="/admin/data"
      formTheme={formTheme}
      probe={probeAdminApi}
    >
      <AdminDataLayout />
    </AdminDataProvider>
  )
}
