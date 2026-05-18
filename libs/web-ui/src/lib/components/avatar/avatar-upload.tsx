import React, { useEffect, useState, useRef } from 'react'
import { CameraIcon, TrashIcon } from '@heroicons/react/24/outline'

interface AvatarUploadProps {
  readonly currentImageUrl?: string
  readonly fallbackText: string
  readonly onUpload: (file: File) => Promise<void>
  readonly onRemove?: () => Promise<void>
  readonly size?: 'sm' | 'md' | 'lg' | 'xl'
  readonly disabled?: boolean
  readonly className?: string
}

const sizeClasses = {
  sm: 'w-12 h-12 text-sm',
  md: 'w-16 h-16 text-lg',
  lg: 'w-24 h-24 text-2xl',
  xl: 'w-32 h-32 text-3xl',
}

const buttonSizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
}

const iconSizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
  xl: 'w-5 h-5',
}

export function AvatarUpload({
  currentImageUrl,
  fallbackText,
  onUpload,
  onRemove,
  size = 'lg',
  disabled = false,
  className = '',
}: AvatarUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (currentImageUrl) {
      setPreviewUrl(null)
    }
  }, [currentImageUrl])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result
      setPreviewUrl(typeof result === 'string' ? result : null)
    }
    reader.readAsDataURL(file)

    handleUpload(file)
  }

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      await onUpload(file)
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Upload failed:', error)
      alert('Upload failed. Please try again.')
      setPreviewUrl(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = async () => {
    if (!onRemove) return

    setIsUploading(true)
    try {
      await onRemove()
      setPreviewUrl(null)
    } catch (error) {
      console.error('Remove failed:', error)
      alert('Failed to remove avatar. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const displayUrl = previewUrl || currentImageUrl
  const displayText = fallbackText
    .split(' ')
    .map(word => word[0]?.toUpperCase())
    .join('')
    .slice(0, 2)

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Avatar Display */}
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden relative group`}>
        {displayUrl ? (
          <img src={displayUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white font-bold">
            {displayText}
          </div>
        )}

        {/* Loading overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <CameraIcon className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Upload Button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isUploading}
        className={`absolute -bottom-1 -right-1 ${buttonSizeClasses[size]} bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-600 rounded-full flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <CameraIcon className={`${iconSizeClasses[size]} text-zinc-600 dark:text-zinc-400`} />
      </button>

      {/* Remove Button (if image exists and onRemove is provided) */}
      {displayUrl && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled || isUploading}
          className={`absolute -top-1 -right-1 ${buttonSizeClasses[size]} bg-red-500 hover:bg-red-600 border-2 border-white dark:border-zinc-800 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <TrashIcon className={`${iconSizeClasses[size]} text-white`} />
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />
    </div>
  )
}

// Simpler display-only Avatar component
interface AvatarProps {
  readonly imageUrl?: string
  readonly fallbackText: string
  readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  readonly className?: string
}

const displaySizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-xl',
}

export function Avatar({ imageUrl, fallbackText, size = 'md', className = '' }: AvatarProps) {
  const displayText = fallbackText
    .split(' ')
    .map(word => word[0]?.toUpperCase())
    .join('')
    .slice(0, 2)

  return (
    <div className={`${displaySizeClasses[size]} rounded-full overflow-hidden ${className}`}>
      {imageUrl ? (
        <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white font-bold">
          {displayText}
        </div>
      )}
    </div>
  )
}
