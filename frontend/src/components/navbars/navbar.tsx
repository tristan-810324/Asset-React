import { useState } from 'react'

const navigationItems = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const closeMenu = () => setIsMenuOpen(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-4 sm:px-6 sm:pt-5 lg:px-8 lg:pt-6">
      <nav
        aria-label="Main navigation"
        className="mx-auto max-w-7xl rounded-4xl border border-white/10 bg-slate-950/75 px-4 py-3 shadow-2xl shadow-blue-950/25 backdrop-blur-xl sm:px-6 lg:px-7"
      >
        <div className="flex items-center justify-between gap-4">
          <a
            href="#home"
            onClick={closeMenu}
            className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="A.SSET home"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-300/30 bg-blue-700/40 p-1.5">
              <img
                src="/dyci_img/dyci-logo.webp"
                alt="Dr. Yanga's Colleges and A.SSET logo"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-['Plus_Jakarta_Sans'] text-base font-extrabold tracking-[0.18em] text-white sm:text-lg">
                A.SSET
              </span>
              <span className="hidden text-[0.6rem] font-bold uppercase tracking-[0.12em] text-blue-200 sm:block">
                DYCI equipment tracking
              </span>
            </span>
          </a>

          <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
            {navigationItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-5 py-2.5 font-['Plus_Jakarta_Sans'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {item.label}
              </a>
            ))}
          </div>

          <a
            href="/login"
            className="hidden rounded-full bg-blue-600 px-5 py-3 font-['Plus_Jakarta_Sans'] text-xs font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:inline-flex"
          >
            Login portal
          </a>

          <button
            type="button"
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:hidden"
          >
            <span className="sr-only">Toggle menu</span>
            <span className="flex w-5 flex-col gap-1.5" aria-hidden="true">
              <span className={`h-0.5 w-full rounded-full bg-current transition ${isMenuOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`h-0.5 w-full rounded-full bg-current transition ${isMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 w-full rounded-full bg-current transition ${isMenuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </span>
          </button>
        </div>

        {isMenuOpen && (
          <div className="mt-4 border-t border-white/10 pt-3 md:hidden">
            <div className="flex flex-col gap-1">
              {navigationItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="rounded-xl px-4 py-3 font-['Plus_Jakarta_Sans'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/login"
                onClick={closeMenu}
                className="mt-2 rounded-xl bg-blue-600 px-4 py-3 text-center font-['Plus_Jakarta_Sans'] text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                Login portal
              </a>
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}