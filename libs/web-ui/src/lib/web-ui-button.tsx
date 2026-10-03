import { cloneElement, ReactElement, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@nestled-template/shared/utils'

function getButtonStyles(
  buttonType:
    | 'Primary'
    | 'Secondary'
    | 'SecondaryDark'
    | 'Soft'
    | 'Transparent'
    | 'TransparentLight',
  disabled: boolean,
): string {
  const disabledClass = 'opacity-50 cursor-not-allowed'
  const styles: Record<string, string> = {
    Primary: cn(
      'bg-orange-500 text-white',
      disabled ? disabledClass : 'hover:bg-orange-400 focus-visible:outline-orange-500',
    ),
    Secondary: cn(
      'ring-1 ring-inset ring-zinc-300 bg-white text-zinc-900',
      disabled ? disabledClass : 'hover:bg-zinc-50',
    ),
    SecondaryDark: cn('bg-white/10 text-white', disabled ? disabledClass : 'hover:bg-white/20'),
    Soft: cn('bg-sky-50 text-sky-600', disabled ? disabledClass : 'hover:bg-sky-100'),
    Transparent: cn('bg-transparent text-zinc-900', disabled ? disabledClass : 'hover:bg-gray-100'),
    TransparentLight: cn(
      'bg-transparent text-white',
      disabled ? disabledClass : 'hover:bg-gray-100',
    ),
  }
  return styles[buttonType]
}

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

  const buttonStyles = getButtonStyles(buttonType, disabled)

  const roundedStyles = rounded ? 'rounded-full' : 'rounded-md'

  const iconClass = iconLocation === 'left' ? '-ml-2 h-6 w-6' : '-mr-0.5 h-6 w-6'
  const iconComponent = icon && cloneElement(icon, { className: iconClass })

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
