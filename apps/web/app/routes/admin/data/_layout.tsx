import * as Sdk from '@nestled-template/shared/sdk'
import { DATABASE_MODELS } from '@nestled-template/shared/sdk'
import { AdminDataProvider, AdminDataLayout } from '@nestledjs/data-browser'
import { formTheme } from '@nestled-template/shared/styles'

export default function DataLayoutRoute() {
  return (
    <AdminDataProvider
      sdk={Sdk}
      databaseModels={DATABASE_MODELS}
      basePath="/admin/data"
      formTheme={formTheme}
    >
      <AdminDataLayout />
    </AdminDataProvider>
  )
}
