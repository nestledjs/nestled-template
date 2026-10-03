export interface UploadResult {
  id: string
  provider: string
  providerFileId: string
  url: string
  publicUrl?: string
  filename: string
  mimeType: string
  size: number
  folder?: string
  width?: number
  height?: number
  metadata?: Record<string, any>
}
