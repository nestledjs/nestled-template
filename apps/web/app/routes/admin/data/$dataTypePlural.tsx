import { AdminDataErrorBoundary, AdminDataListPage } from '@nestledjs/data-browser'

export default function DataListRoute() {
  return <AdminDataListPage />
}

export function ErrorBoundary({ error }: Readonly<{ error: Error }>) {
  return <AdminDataErrorBoundary error={error} />
}
