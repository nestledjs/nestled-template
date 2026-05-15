import { AdminDataCreateErrorBoundary, AdminDataCreatePage } from '@nestledjs/data-browser'

export default function CreateDataRoute() {
  return <AdminDataCreatePage />
}

export function ErrorBoundary({ error }: Readonly<{ error: Error }>) {
  return <AdminDataCreateErrorBoundary error={error} />
}
