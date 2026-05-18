import { useEffect, useState } from 'react'
import { Dialog, DialogPanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  BuildingOfficeIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  HomeIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router'

interface WebUiHeaderNavProps {
  name: string
  href: string
}
interface WebUiHeaderProps {
  navigation: WebUiHeaderNavProps[]
  logo: string
  icon: string
  siteName: string
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userAvatarUrl?: string | null
  isSuperAdmin?: boolean
  canViewBilling?: boolean
  customHeaderContent?: React.ReactNode
}

interface AccountLink {
  name: string
  href: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  billingOnly?: boolean
}

const accountLinks = [
  { name: 'Dashboard', href: '/members/dashboard', icon: HomeIcon },
  { name: 'My Account', href: '/settings/profile', icon: UserCircleIcon },
  { name: 'Organization Settings', href: '/settings/organization', icon: BuildingOfficeIcon },
  { name: 'Billing', href: '/settings/billing', icon: CreditCardIcon, billingOnly: true },
] satisfies AccountLink[]

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || 'User'
  const words = source.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function getAccountLinks(canViewBilling?: boolean, isSuperAdmin?: boolean) {
  const visibleAccountLinks = accountLinks.filter(item => !item.billingOnly || canViewBilling)
  if (!isSuperAdmin) return visibleAccountLinks

  return [...visibleAccountLinks, { name: 'Admin Console', href: '/admin', icon: Cog6ToothIcon }]
}

function getThemeIcon(theme: 'light' | 'dark') {
  return theme === 'dark' ? '☀️' : '🌙'
}

function getThemeActionLabel(theme: 'light' | 'dark') {
  return theme === 'dark' ? 'Light' : 'Dark'
}

interface AccountAvatarProps {
  className?: string
  initials: string
  userAvatarUrl?: string | null
}

function AccountAvatar({ className = '', initials, userAvatarUrl }: Readonly<AccountAvatarProps>) {
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 ${className}`}
    >
      {userAvatarUrl ? (
        <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

interface DesktopAccountMenuProps {
  accountInitials: string
  accountMenuLinks: AccountLink[]
  theme: 'light' | 'dark'
  toggleTheme: () => void
  userAvatarUrl?: string | null
  userEmail?: string | null
  userName?: string | null
}

function DesktopAccountMenu({
  accountInitials,
  accountMenuLinks,
  theme,
  toggleTheme,
  userAvatarUrl,
  userEmail,
  userName,
}: Readonly<DesktopAccountMenuProps>) {
  return (
    <Menu as="div" className="relative hidden lg:block">
      <MenuButton
        aria-label="Open account menu"
        className="inline-flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950"
      >
        <AccountAvatar initials={accountInitials} userAvatarUrl={userAvatarUrl} />
      </MenuButton>
      <MenuItems className="absolute right-0 z-50 mt-3 w-72 origin-top-right rounded-xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 focus:outline-none dark:border-white/10 dark:bg-zinc-900 dark:shadow-black/40">
        <div className="px-3 py-2">
          <div className="text-sm font-semibold text-zinc-900 dark:text-white">
            {userName || 'Account'}
          </div>
          {userEmail && (
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{userEmail}</div>
          )}
        </div>
        <div className="my-1 border-t border-zinc-200 dark:border-white/10" />
        {accountMenuLinks.map(item => (
          <MenuItem key={item.name}>
            <Link
              to={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"
            >
              <item.icon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              {item.name}
            </Link>
          </MenuItem>
        ))}
        <div className="my-1 border-t border-zinc-200 dark:border-white/10" />
        <MenuItem>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center">
              {getThemeIcon(theme)}
            </span>
            Switch to {getThemeActionLabel(theme)} Mode
          </button>
        </MenuItem>
        <MenuItem>
          <Link
            to="/logout"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            Logout
          </Link>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}

export function WebUiHeader(props: Readonly<WebUiHeaderProps>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [themeLoaded, setThemeLoaded] = useState(false)

  useEffect(() => {
    const saved = globalThis.localStorage?.getItem('theme') as 'light' | 'dark' | null
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved)
    }
    setThemeLoaded(true)
  }, [])

  useEffect(() => {
    if (!themeLoaded) return
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // Save to localStorage for persistence
    globalThis.localStorage.setItem('theme', theme)
    // Save to cookie for SSR
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`
  }, [theme, themeLoaded])

  const siteName = props.siteName || 'Nova Kit'
  const navigation = props?.navigation?.length
    ? props.navigation
    : [
        { name: 'Features', href: '/features' },
        { name: 'Pricing', href: '/pricing' },
        { name: 'Blog', href: '/blog' },
      ]
  const accountInitials = getInitials(props.userName, props.userEmail)

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  const accountMenuLinks = getAccountLinks(props.canViewBilling, props.isSuperAdmin)

  return (
    <header className="bg-white dark:bg-zinc-950">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between gap-x-6 p-6 lg:px-8"
        aria-label="Global"
      >
        <div className="flex lg:flex-1 items-center">
          <Link to="/" className="-m-1.5 p-1.5">
            <span className="sr-only">{siteName}</span>
            <span className="inline-flex items-center gap-2">
              {props?.icon && <img className="h-8 w-auto" src={props.icon} alt={siteName} />}
              <span className="hidden sm:inline text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {siteName}
              </span>
            </span>
          </Link>
        </div>
        {!props.isAuthenticated && (
          <div className="hidden lg:flex lg:gap-x-12">
            {navigation.map(item => (
              <Link
                key={item.name}
                to={item.href}
                className="leading-5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition"
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}
        <div className="flex flex-1 items-center justify-end gap-x-3 lg:gap-x-6">
          {props.customHeaderContent}
          {props?.isAuthenticated ? (
            <DesktopAccountMenu
              accountInitials={accountInitials}
              accountMenuLinks={accountMenuLinks}
              theme={theme}
              toggleTheme={toggleTheme}
              userAvatarUrl={props.userAvatarUrl}
              userEmail={props.userEmail}
              userName={props.userName}
            />
          ) : (
            <>
              <button
                type="button"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleTheme}
                className="hidden lg:inline-flex items-center justify-center rounded-md border border-white/15 bg-white/50 px-3 py-2 text-sm text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                {theme === 'dark' ? (
                  <span aria-hidden="true">☀️</span>
                ) : (
                  <span aria-hidden="true">🌙</span>
                )}
              </button>
              <Link
                to="/login"
                className="hidden lg:block rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-md shadow-emerald-500/10 transition hover:bg-emerald-400"
              >
                Login
              </Link>
            </>
          )}
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </nav>
      <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
        <div className="fixed inset-0 z-10" />
        <DialogPanel className="transition-transform duration-300 ease-out fixed inset-y-0 right-0 z-10 w-full overflow-y-auto bg-white px-6 py-6 dark:bg-zinc-900 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10 dark:sm:ring-white/10">
          <div className="flex items-center justify-between">
            <Link to="/" className="-m-1.5 p-1.5">
              <span className="sr-only">{siteName}</span>
              <span className="inline-flex items-center gap-2">
                {props.icon && <img className="h-8 w-auto" src={props.icon} alt="" />}
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {siteName}
                </span>
              </span>
            </Link>

            <button
              type="button"
              className="-m-2.5 rounded-md p-2.5 text-gray-700"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10">
              {props.isAuthenticated ? (
                <div className="space-y-2 py-6">
                  <div className="mb-3 flex items-center gap-3">
                    <AccountAvatar initials={accountInitials} userAvatarUrl={props.userAvatarUrl} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {props.userName || 'Account'}
                      </div>
                      {props.userEmail && (
                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {props.userEmail}
                        </div>
                      )}
                    </div>
                  </div>
                  {accountMenuLinks.map(item => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2 text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                      {item.name}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      toggleTheme()
                      setMobileMenuOpen(false)
                    }}
                    className="-mx-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center">
                      {getThemeIcon(theme)}
                    </span>
                    Switch to {getThemeActionLabel(theme)} Mode
                  </button>
                  <Link
                    to="/logout"
                    onClick={() => setMobileMenuOpen(false)}
                    className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-2 text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    <ArrowRightStartOnRectangleIcon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                    Logout
                  </Link>
                </div>
              ) : (
                <>
                  <div className="space-y-2 pt-6 pb-2">
                    {navigation.map(item => (
                      <Link
                        key={item.name}
                        to={item.href}
                        className="-mx-3 block rounded-lg px-3 py-2 text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                  <div className={'py-6'}>
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-ml-1 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-md shadow-emerald-500/10 transition hover:bg-emerald-400"
                    >
                      Get Started
                    </Link>
                  </div>
                  <div className="py-6">
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="-mx-3 mt-3 block rounded-lg px-3 py-2.5 text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                    >
                      Login
                    </Link>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="mt-4 -mx-3 block rounded-lg px-3 py-2.5 text-left text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                    >
                      Switch to {getThemeActionLabel(theme)} Mode
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  )
}
