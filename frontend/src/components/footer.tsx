import { landingNavigationItems } from '../landing/navigation'

/* Layout adapted from Flowbite's free MIT-licensed marketing footer block: https://flowbite.com/blocks/marketing/footer/ */
export default function LandingPageFooter() {
  return (
    <footer className="relative isolate overflow-hidden bg-[#061632] px-4 pb-4 pt-8 text-white sm:px-8 sm:pb-5 sm:pt-14 lg:px-12 lg:pt-16">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-blue-700 via-sky-300 to-blue-600" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_12%_0%,rgba(37,99,235,0.28),transparent_38%),radial-gradient(ellipse_at_90%_78%,rgba(14,165,233,0.18),transparent_34%)]" />

      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 border-b border-white/10 pb-6 sm:gap-10 sm:pb-9 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-14 lg:pb-11">
          <div>
            <a
              href="/#home"
              className="inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061632]"
              aria-label="A.SSET home"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white p-1.5 shadow-lg shadow-blue-950/30 ring-1 ring-white/30">
                <img src="/dyci_img/A.sset.webp" alt="" className="h-full w-full object-contain" loading="lazy" />
              </span>
              <span>
                <span className="block text-sm font-black tracking-[0.16em] text-white">A.SSET</span>
                <span className="mt-1 block text-[0.6rem] font-bold uppercase tracking-[0.13em] text-blue-100/70">Equipment tracking portal</span>
              </span>
            </a>

            <p aria-label="Dr. Yanga's Colleges, Inc." className="mt-5 text-5xl font-black leading-[0.82] tracking-[-0.09em] text-white sm:mt-7 sm:text-8xl lg:text-[8.5rem]">
              DYCI
            </p>
            <p className="mt-3 text-xs font-extrabold tracking-wide text-sky-200 sm:mt-4 sm:text-base">Dr. Yanga&apos;s Colleges, Inc.</p>
            <p className="mt-2.5 max-w-xl text-xs leading-5 text-blue-100/70 sm:mt-3 sm:text-sm sm:leading-6">
              A.SSET helps keep school equipment records and everyday GSO workflows in view.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-5 sm:gap-10">
            <nav aria-label="Footer navigation">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-200">Explore</h2>
              <ul className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                {landingNavigationItems.map((item) => (
                  <li key={item.section}>
                    <a
                      href={`/#${item.section}`}
                      className="inline-flex rounded-sm text-xs font-semibold text-blue-100/75 transition hover:translate-x-0.5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:text-sm"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Portal and support">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-200">Portal &amp; support</h2>
              <ul className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                <li>
                  <a href="/login" className="inline-flex rounded-sm text-xs font-semibold text-blue-100/75 transition hover:translate-x-0.5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:text-sm">
                    Login portal
                  </a>
                </li>
                <li>
                  <a href="/#faq" className="inline-flex rounded-sm text-xs font-semibold text-blue-100/75 transition hover:translate-x-0.5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:text-sm">
                    Common questions
                  </a>
                </li>
                <li>
                  <a href="/#contact" className="inline-flex rounded-sm text-xs font-semibold text-blue-100/75 transition hover:translate-x-0.5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:text-sm">
                    Contact the team
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-4 text-[0.68rem] text-blue-100/55 sm:gap-3 sm:pt-5 sm:text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Dr. Yanga&apos;s Colleges, Inc. · A.SSET equipment tracking</p>
          <a href="/#home" className="inline-flex w-fit items-center gap-2 rounded-sm font-bold text-blue-100/75 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
