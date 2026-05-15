export interface UploadOptions {
  folder?: string
  filename: string
  mimeType: string
  isPublic?: boolean
  userId?: string
  organizationId?: string
  metadata?: Record<string, any>
  width?: number
  height?: number
  quality?: number
  format?: 'jpeg' | 'png' | 'webp' | 'avif'
}
