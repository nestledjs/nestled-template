import { cn } from '@nestled-template/shared/utils'
import { useEffect, useState } from 'react'

export interface WebUiAvatarProps {
  shape?: 'rounded' | 'square' | 'circle'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'card' | 'profile'
  notification?: boolean
  notificationColor?: string
  notificationPosition?: 'top' | 'bottom'
  placeholder?: 'icon' | 'initials'
  name?: string
  src?: string | null
}

export function WebUiAvatar({
  shape = 'circle',
  size = 'md',
  notification = false,
  notificationColor = 'bg-red-500',
  notificationPosition = 'bottom',
  placeholder = '',
  name = '',
  src = '',
}) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)

    if (src) {
      const img = new Image()
      img.src = src
      img.onload = () => setLoaded(true)
      img.onerror = () => setLoaded(false)
    }
  }, [src])

  const sizeMapping: any = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    profile: 'h-64 w-64',
    card: 'w-32 h-32 md:w-16 md:h-16 lg:w-48 lg:h-48',
    xxl: 'h-64 w-64',
  }

  const textSizeMapping: any = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-md',
    lg: 'text-lg',
    xl: 'text-xl',
    xxl: 'text-2xl',
    card: 'text-xl',
  }

  const shapeMapping: any = {
    rounded: 'rounded-md',
    square: '',
    circle: 'rounded-full',
  }

  const placeholderInitials = name
    .split(' ')
    .map((n: string) => n[0])
    .join('')

  const notificationPositionClass =
    notificationPosition === 'top' ? 'top-0 right-0' : 'bottom-0 right-0'
  const notificationClasses = notification
    ? `${notificationColor} absolute ${notificationPositionClass} translate-x-1/2 translate-y-1/2 transform rounded-full`
    : ''

  const onLoad = () => {
    setLoaded(true)
  }

  const onError = () => {
    setLoaded(false)
  }

  return (
    <span
      className={`relative inline-block ${sizeMapping[size]} ${shapeMapping[shape]} bg-gray-100`}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
          loaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {placeholder === 'icon' && (
          <svg className="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
        {placeholder === 'initials' && (
          <span className={cn('font-medium leading-none text-zinc-400', textSizeMapping[size])}>
            {placeholderInitials}
          </span>
        )}
      </div>
      {notification && <span className={`h-2 w-2 ${notificationClasses}`} />}
      {src && (
        <img
          src={src}
          alt={name}
          className={cn(
            'object-cover absolute inset-0',
            sizeMapping[size],
            shapeMapping[shape],
            loaded ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-500',
          )}
          onLoad={onLoad}
          onError={onError}
        />
      )}
    </span>
  )
}
