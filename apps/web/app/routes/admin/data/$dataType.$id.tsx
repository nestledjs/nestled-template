import { AdminDataEditErrorBoundary, AdminDataEditPage } from '@nestledjs/data-browser'

export default function EditDataRoute() {
  return <AdminDataEditPage />
}

export function ErrorBoundary({ error }: Readonly<{ error: Error }>) {
  return <AdminDataEditErrorBoundary error={error} />
}
