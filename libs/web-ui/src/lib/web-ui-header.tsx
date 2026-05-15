import { useEffect, useState } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
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
  customHeaderContent?: React.ReactNode
}
export function WebUiHeader(props: Readonly<WebUiHeaderProps>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    const saved = window.localStorage.getItem('theme') as 'light' | 'dark' | null
    return saved ?? 'dark'
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // Save to localStorage for persistence
    window.localStorage.setItem('theme', theme)
    // Save to cookie for SSR
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`
  }, [theme])

  const siteName = props.siteName || 'Nova Kit'
  const navigation = props?.navigation?.length
      ? props.navigation
      : [
          { name: 'Features', href: '/features' },
          { name: 'Pricing', href: '/pricing' },
          { name: 'Blog', href: '/public/blog' },
        ]


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
        <div className="flex flex-1 items-center justify-end gap-x-3 lg:gap-x-6">
          {props.customHeaderContent}
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            className="hidden lg:inline-flex items-center justify-center rounded-md border border-white/15 bg-white/50 px-3 py-2 text-sm text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            {theme === 'dark' ? <span aria-hidden="true">☀️</span> : <span aria-hidden="true">🌙</span>}
          </button>
          {props?.isAuthenticated ? (
            <Link
              to="/members/dashboard"
              className="hidden lg:block rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-md shadow-emerald-500/10 transition hover:bg-emerald-400"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/login"
              className="hidden lg:block rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-md shadow-emerald-500/10 transition hover:bg-emerald-400"
            >
              Login
            </Link>
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
                {props?.isAuthenticated ? (
                  <Link
                    to="/members/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="-ml-1 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-md shadow-emerald-500/10 transition hover:bg-emerald-400"
                  >
                    Dashboard
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="-ml-1 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 shadow-md shadow-emerald-500/10 transition hover:bg-emerald-400"
                  >
                    Get Started
                  </Link>
                )}
              </div>
              <div className="py-6">
                {!props?.isAuthenticated ? (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="-mx-3 mt-3 block rounded-lg px-3 py-2.5 text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    Login
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
                  className="mt-4 -mx-3 block rounded-lg px-3 py-2.5 text-left text-base text-zinc-700 hover:bg-gray-50 dark:text-zinc-300 dark:hover:bg-white/5"
                >
                  Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
                </button>
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  )
}
