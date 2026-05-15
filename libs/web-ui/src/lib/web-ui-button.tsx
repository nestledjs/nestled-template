import { cloneElement, ReactElement, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@nestled-template/shared/utils'

interface WebUiButtonProps {
  buttonType?:
    | 'Primary'
    | 'Secondary'
    | 'SecondaryDark'
    | 'Soft'
    | 'Transparent'
    | 'TransparentLight'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  rounded?: boolean
  icon?: ReactElement<any> | null
  iconLocation?: 'left' | 'right'
  linkTo?: string
  children: ReactNode
  onClick?: () => void
  center?: boolean
  disabled?: boolean
  className?: string
}
export const WebUiButton = ({
  buttonType = 'Primary',
  size = 'lg',
  rounded = false,
  icon,
  iconLocation = 'left',
  linkTo,
  onClick,
  children,
  center = false,
  disabled = false,
  className = '',
}: WebUiButtonProps) => {
  const sizeStyles = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-3 py-2 text-lg',
    lg: 'px-3.5 py-2.5 text-lg',
    xl: 'px-4 py-6 text-lg',
  }[size]

  const buttonStyles = {
    Primary: cn(
      'bg-orange-500 text-white',
      disabled
        ? 'opacity-50 cursor-not-allowed'
        : 'hover:bg-orange-400 focus-visible:outline-orange-500',
    ),
    Secondary: cn(
      'ring-1 ring-inset ring-zinc-300 bg-white text-zinc-900',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-50',
    ),
    SecondaryDark: cn(
      'bg-white/10 text-white',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/20',
    ),
    Soft: cn(
      'bg-sky-50 text-sky-600',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-sky-100',
    ),
    Transparent: cn(
      'bg-transparent text-zinc-900',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100',
    ),
    TransparentLight: cn(
      'bg-transparent text-white',
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100',
    ),
  }[buttonType]

  const roundedStyles = rounded ? 'rounded-full' : 'rounded-md'

  const iconComponent =
    icon &&
    cloneElement(icon, {
      className: `${iconLocation === 'left' ? '-ml-2' : '-mr-0.5'} h-6 w-6`,
    })

  return linkTo ? (
    <Link
      to={linkTo}
      onClick={disabled ? undefined : onClick}
      type="button"
      aria-disabled={disabled}
      className={cn(
        'inline-flex justify-center no-underline items-center gap-x-1.5',
        roundedStyles,
        sizeStyles,
        'shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2',
        buttonStyles,
        center ? 'mx-auto' : '',
        className,
      )}
    >
      {iconLocation === 'left' && iconComponent}
      {children}
      {iconLocation === 'right' && iconComponent}
    </Link>
  ) : (
    <button
      onClick={onClick}
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex justify-center items-center gap-x-1.5',
        roundedStyles,
        sizeStyles,
        'shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2',
        buttonStyles,
        center ? 'mx-auto' : '',
        className,
      )}
    >
      {iconLocation === 'left' && iconComponent}
      {children}
      {iconLocation === 'right' && iconComponent}
    </button>
  )
}
