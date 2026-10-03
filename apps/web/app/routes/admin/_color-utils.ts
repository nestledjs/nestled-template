export interface AdminColorClasses {
  iconBg: string
  iconText: string
  badgeBg: string
}

const COLOR_MAP: Record<string, AdminColorClasses> = {
  emerald: {
    iconBg: 'bg-emerald-100 dark:bg-emerald-500/20',
    iconText: 'text-emerald-600 dark:text-emerald-400',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    iconBg: 'bg-amber-100 dark:bg-amber-500/20',
    iconText: 'text-amber-600 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  },
  blue: {
    iconBg: 'bg-blue-100 dark:bg-blue-500/20',
    iconText: 'text-blue-600 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  },
  red: {
    iconBg: 'bg-red-100 dark:bg-red-500/20',
    iconText: 'text-red-600 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  },
  purple: {
    iconBg: 'bg-purple-100 dark:bg-purple-500/20',
    iconText: 'text-purple-600 dark:text-purple-400',
    badgeBg: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
  },
  zinc: {
    iconBg: 'bg-zinc-200 dark:bg-zinc-700',
    iconText: 'text-zinc-600 dark:text-zinc-400',
    badgeBg: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300',
  },
}

export function getColorClasses(color: string): AdminColorClasses {
  return COLOR_MAP[color] ?? COLOR_MAP.zinc
}
