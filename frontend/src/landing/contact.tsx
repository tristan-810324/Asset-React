function LandingHeader() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <a href="/" aria-label="A.SSET home" className="flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
          <img src="/dyci_img/dyci-logo.webp" alt="Dr. Yanga's Colleges logo" className="h-full w-full object-contain" />
        </span>
        <span>
          <span className="block text-sm font-black tracking-[0.2em] text-slate-900">A.SSET</span>
          <span className="mt-0.5 block text-[0.58rem] font-bold uppercase tracking-[0.13em] text-slate-500">DYCI equipment tracking</span>
        </span>
      </a>

      <nav aria-label="Main navigation" className="order-3 mt-4 flex w-full items-center justify-center gap-1 rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-sm backdrop-blur md:order-none md:mt-0 md:w-auto">
        <a href="/" className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Home</a>
        <a href="/about" className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">About</a>
        <a href="/contact" aria-current="page" className="rounded-full bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-700">Contact</a>
      </nav>

      <a href="/login" className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-5 sm:text-xs">
        Login portal
      </a>
    </header>
  )
}

const supportTeams = [
  {
    initials: 'GS',
    label: 'GSO Staff',
    title: 'Equipment and records',
    description: 'For inventory details, equipment assignments, returns, repair records, or questions about the asset workflow.',
    style: 'from-sky-400 to-blue-600',
  },
  {
    initials: 'IT',
    label: 'IT Admin',
    title: 'Account and portal access',
    description: 'For sign-in issues, account access, or questions about your role in the A.SSET portal.',
    style: 'from-blue-500 to-violet-600',
  },
]

export default function ContactPage() {
  return (
    <main id="contact" className="relative isolate min-h-screen overflow-hidden bg-white font-['Plus_Jakarta_Sans'] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[48rem] bg-linear-to-b from-indigo-50/80 via-white to-white" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-24 -z-10 h-96 w-96 rounded-full bg-sky-200/45 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-64 -z-10 h-96 w-96 rounded-full bg-violet-200/40 blur-3xl" />

      <LandingHeader />

      <section className="mx-auto max-w-7xl px-5 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-12 lg:pb-24 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3.5 py-2 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-indigo-700 shadow-sm sm:text-xs">
            <span className="h-2 w-2 rounded-full bg-linear-to-r from-blue-500 to-violet-500" />
            Contact and support
          </div>
          <h1 className="text-4xl font-black leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">
            Let&apos;s get you to the <span className="bg-linear-to-r from-sky-500 via-blue-600 to-violet-600 bg-clip-text text-transparent">right team.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            Whether you need help with an equipment record or portal access, contact the team that manages that part of A.SSET through your school&apos;s official channels.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
          {supportTeams.map((team) => (
            <article key={team.label} className="group relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_55px_-35px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/10 sm:p-8">
              <div aria-hidden="true" className={`absolute -right-12 -top-16 h-48 w-48 rounded-full bg-linear-to-br ${team.style} opacity-[0.08] blur-2xl transition duration-300 group-hover:opacity-[0.15]`} />
              <div className="relative flex items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${team.style} text-sm font-black tracking-wide text-white shadow-lg shadow-blue-500/15`}>
                  {team.initials}
                </div>
                <div>
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.17em] text-blue-600">{team.label}</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">{team.title}</h2>
                </div>
              </div>
              <p className="relative mt-5 text-sm leading-7 text-slate-600">{team.description}</p>
              <div className="relative mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3.5">
                <p className="text-xs font-bold leading-5 text-slate-700">Contact this team through the official DYCI office or support channel.</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-8 grid max-w-5xl gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[1.75rem] border border-slate-200/80 bg-linear-to-br from-white via-white to-sky-50/70 p-6 sm:p-8">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-blue-600">Help us help you</p>
            <h2 className="mt-3 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">A few details can speed things up.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600">When you contact the team, include the information that fits your concern:</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                'Item name or inventory code',
                'Issuance or record reference',
                'Your department or office',
                'A short description of the issue',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-3.5 py-3 text-xs font-semibold leading-5 text-slate-700 shadow-sm">
                  <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sky-400 to-blue-600 text-[0.55rem] text-white">✓</span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>

          <aside className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 p-6 text-white shadow-xl shadow-indigo-950/15 sm:p-8">
            <div aria-hidden="true" className="absolute -right-14 -top-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative">
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-sky-300">A.SSET portal</p>
              <h2 className="mt-3 text-xl font-black tracking-tight sm:text-2xl">Already have an account?</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">Sign in to reach the workspace assigned to your role.</p>
              <a href="/login" className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                Go to login <span aria-hidden="true" className="text-base">→</span>
              </a>
              <p className="mt-6 border-t border-white/10 pt-5 text-xs leading-5 text-slate-400">For your security, never share your password or one-time verification code.</p>
            </div>
          </aside>
        </div>
      </section>

      <footer className="border-t border-slate-100 px-5 py-7 text-center text-xs font-medium text-slate-500 sm:px-8">
        A.SSET · Dr. Yanga&apos;s Colleges, Inc.
      </footer>
    </main>
  )
}
