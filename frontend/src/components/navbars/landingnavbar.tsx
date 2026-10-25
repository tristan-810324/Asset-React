import { useEffect, useRef, useState } from 'react'
import LandingPageFooter from '../footer'
import { landingNavigationItems, type LandingSectionId } from '../../landing/navigation'

export type LandingPageName = 'Home' | 'About' | 'FAQ' | 'Contact'
type LandingNavbarVariant = 'hero' | 'light'

const sectionByPage: Record<LandingPageName, LandingSectionId> = {
  Home: 'home',
  About: 'about',
  FAQ: 'faq',
  Contact: 'contact',
}

export function LandingNavbar({
  activePage,
  variant = 'light',
}: {
  activePage: LandingPageName
  variant?: LandingNavbarVariant
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<LandingSectionId>(sectionByPage[activePage])
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const isHero = variant === 'hero'

  const closeMenu = () => setIsMenuOpen(false)

  useEffect(() => {
    const updateActiveSection = () => {
      let currentSection: LandingSectionId = 'home'

      for (const item of landingNavigationItems) {
        const section = document.getElementById(item.section)
        if (section && section.getBoundingClientRect().top <= 150) currentSection = item.section
      }

      setActiveSection((current) => current === currentSection ? current : currentSection)
    }

    updateActiveSection()
    window.addEventListener('scroll', updateActiveSection, { passive: true })
    window.addEventListener('resize', updateActiveSection)
    return () => {
      window.removeEventListener('scroll', updateActiveSection)
      window.removeEventListener('resize', updateActiveSection)
    }
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen])

  const linkClass = (active: boolean) => {
    if (isHero) {
      return active
        ? 'bg-white/12 text-white'
        : 'text-slate-200 hover:bg-white/10 hover:text-white'
    }
    return active
      ? 'bg-blue-50 text-blue-800'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
  }

  const handleNavigationClick = (section: LandingSectionId) => {
    setActiveSection(section)
    closeMenu()
  }

  return (
    <header
      className={
        isHero
          ? 'fixed inset-x-0 top-0 z-100 px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8'
          : 'fixed inset-x-0 top-0 z-100 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm shadow-slate-900/3 backdrop-blur-xl sm:px-6 lg:px-8'
      }
    >
      <nav
        aria-label="Main navigation"
        className={`mx-auto max-w-7xl ${
          isHero
            ? 'rounded-3xl border border-white/15 bg-slate-950/85 px-4 py-3 shadow-xl shadow-blue-950/25 backdrop-blur-xl sm:px-6 lg:px-7'
            : 'px-0'
        }`}
      >
        <div className="flex min-h-12 items-center justify-between gap-3">
          <a
            href={isHero ? '#home' : '/#home'}
            onClick={() => handleNavigationClick('home')}
            className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label="A.SSET home"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80 sm:h-11 sm:w-11">
              <img src="/dyci_img/A.sset.webp" alt="" className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-sm font-black tracking-[0.18em] sm:text-base ${isHero ? 'text-white' : 'text-slate-950'}`}>
                A.SSET
              </span>
              <span className={`mt-0.5 hidden text-[0.58rem] font-bold uppercase tracking-[0.12em] sm:block ${isHero ? 'text-blue-100/80' : 'text-slate-500'}`}>
                DYCI equipment tracking
              </span>
            </span>
          </a>

          <div className={`hidden items-center gap-0.5 rounded-full p-1 lg:flex ${isHero ? 'border border-white/10 bg-white/5' : 'border border-slate-200/80 bg-slate-50/80'}`}>
            {landingNavigationItems.map((item) => {
              const active = item.section === activeSection

              return (
                <a
                  key={item.section}
                  href={isHero ? `#${item.section}` : `/#${item.section}`}
                  aria-current={active ? 'location' : undefined}
                  onClick={() => handleNavigationClick(item.section)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-2.5 text-[0.68rem] font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 xl:px-3 xl:text-xs ${linkClass(active)}`}
                >
                  {item.label}
                </a>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href="/login"
              className={`hidden min-h-10 items-center justify-center rounded-full px-4 py-2.5 text-[0.65rem] font-extrabold uppercase tracking-widest shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:inline-flex ${
                isHero
                  ? 'bg-blue-600 text-white shadow-blue-950/20 hover:bg-blue-500 focus-visible:ring-offset-slate-950'
                  : 'bg-slate-950 text-white hover:bg-blue-700 focus-visible:ring-offset-white'
              }`}
            >
              Login portal
            </a>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMenuOpen}
              aria-controls="landing-mobile-navigation"
              onClick={() => setIsMenuOpen((open) => !open)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:hidden ${
                isHero
                  ? 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="sr-only">Toggle menu</span>
              <span className="flex w-4 flex-col gap-1.5" aria-hidden="true">
                <span className={`h-0.5 w-full rounded-full bg-current transition ${isMenuOpen ? 'translate-y-2 rotate-45' : ''}`} />
                <span className={`h-0.5 w-full rounded-full bg-current transition ${isMenuOpen ? 'opacity-0' : ''}`} />
                <span className={`h-0.5 w-full rounded-full bg-current transition ${isMenuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
              </span>
            </button>
          </div>
        </div>

        <div
          id="landing-mobile-navigation"
          hidden={!isMenuOpen}
          className={`mt-3 border-t pt-3 lg:hidden ${isHero ? 'border-white/10' : 'border-slate-100'}`}
        >
          <div className="flex flex-col gap-1">
            {landingNavigationItems.map((item) => {
              const active = item.section === activeSection

              return (
                <a
                  key={item.section}
                  href={isHero ? `#${item.section}` : `/#${item.section}`}
                  aria-current={active ? 'location' : undefined}
                  onClick={() => handleNavigationClick(item.section)}
                  className={`rounded-xl px-4 py-3 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${linkClass(active)}`}
                >
                  {item.label}
                </a>
              )
            })}
            <a
              href="/login"
              onClick={closeMenu}
              className="mt-1 rounded-xl bg-blue-600 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-[0.12em] text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Login portal
            </a>
          </div>
        </div>
      </nav>
    </header>
  )
}

export function LandingFooter() {
  return <LandingPageFooter />
}
