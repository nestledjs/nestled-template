import { CurrencyDollarIcon } from '@heroicons/react/24/outline'

export function appColor(color: string) {
  switch (color) {
    case 'biz':
      return {
        text: 'text-green-700',
        bg: 'bg-green-100',
        color: '#388e3c',
        icon: <CurrencyDollarIcon />,
      }
    case 'referrals':
    case 'referrals-in':
    case 'referrals-out':
      return {
        text: 'text-sky-700',
        bg: 'bg-sky-50',
        color: '#0369a1',
      }
    case 'power-hours':
      return {
        text: 'text-purple-700',
        bg: 'bg-purple-50',
        color: '#7e22ce',
      }
    case 'attendance':
      return {
        text: 'text-rose-700',
        bg: 'bg-rose-50',
        color: '#be123c',
      }
    default:
      return {
        text: 'text-zinc-700',
        bg: 'bg-zinc-50',
        color: '#3f3f46',
      }
  }
}
