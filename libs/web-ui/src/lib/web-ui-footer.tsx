import { WebUiContainer } from './web-ui-container'
import { Link } from 'react-router'

export function WebUiFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
      <WebUiContainer center>
        <div className="flex w-full flex-col items-center justify-between gap-3 py-6 text-center sm:flex-row sm:text-left">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            © {year}{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Your Company</span>.
            All rights reserved.
          </p>
          <nav className="flex items-center gap-4">
            <Link
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
              to="/privacy-policy"
            >
              Privacy Policy
            </Link>
            <Link
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
              to="/public/about"
            >
              About
            </Link>
            <a
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white transition"
              href="mailto:hello@example.com"
            >
              Contact
            </a>
          </nav>
        </div>
      </WebUiContainer>
    </footer>
  )
}
