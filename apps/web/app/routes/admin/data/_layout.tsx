import * as Sdk from '@nestled-template/shared/sdk'
import { DATABASE_MODELS } from '@nestled-template/shared/sdk'
import { AdminDataProvider, AdminDataLayout } from '@nestledjs/data-browser'
import { formTheme } from '@nestled-template/shared/styles'
import { probeApi } from '../../../api-availability'

// The admin error boundary checks the API with the app's own probe (GET /api/uptime) and
// revalidates the route once it answers, so "Can't reach the server" clears by itself.
const probeAdminApi = () => probeApi()

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
