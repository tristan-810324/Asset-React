const supportTeams = [
  {
    initials: 'GS',
    label: 'GSO Staff',
    title: 'Equipment and records',
    description: 'Inventory details, equipment assignments, returns, repair follow-up, and other equipment workflow questions.',
    tone: 'bg-blue-700 text-white shadow-blue-900/15',
  },
  {
    initials: 'IT',
    label: 'IT Admin',
    title: 'Account and portal access',
    description: 'Sign-in issues, account access, and questions about the workspace available to your account.',
    tone: 'bg-sky-100 text-blue-800 ring-1 ring-sky-200',
  },
]

const usefulDetails = [
  'Item name or inventory code',
  'Issuance or record reference',
  'Your department or office',
  'A short description of the issue',
]

export function ContactSection() {
  return (
    <section id="contact" aria-labelledby="contact-heading" className="relative isolate overflow-hidden bg-[#f3f7fc] px-4 py-8 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 top-10 h-128 w-lg rounded-full bg-sky-100/90 blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-136 w-136 rounded-full bg-blue-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="relative isolate overflow-hidden rounded-3xl bg-[#0b2551] px-4 py-5 text-white shadow-[0_28px_85px_-40px_rgba(5,27,64,0.55)] sm:rounded-[1.75rem] sm:px-7 sm:py-9 lg:px-9 lg:py-10">
          <img src="/dyci_img/homepage3.jpg" alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-25" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-r from-[#071a3c]/95 via-[#0b2551]/90 to-[#164083]/75" />
          <div aria-hidden="true" className="absolute -right-16 -top-24 -z-10 h-80 w-80 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -right-2 -top-10 -z-10 h-52 w-52 rounded-full border border-white/10" />

          <div className="relative grid gap-5 sm:gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-100 backdrop-blur-sm">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-300" />Contact and support
              </p>
              <h2 id="contact-heading" className="mt-3 text-2xl font-black leading-[1.1] tracking-[-0.045em] sm:mt-4 sm:text-4xl lg:text-4xl">
                Need help with <span className="text-sky-200">A.SSET?</span>
              </h2>
              <p className="mt-2.5 max-w-2xl text-xs leading-5 text-blue-100/85 sm:mt-3 sm:text-[0.95rem] sm:leading-7">
                Contact GSO for equipment records and workflows. For account access, contact your school&apos;s IT Admin through the official support channel.
              </p>
            </div>
            <a href="#faq" className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-[0.68rem] font-extrabold text-white backdrop-blur transition hover:border-white/40 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950 sm:min-h-11 sm:px-4 sm:text-xs">
              Browse quick answers <span aria-hidden="true">↑</span>
            </a>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 max-[360px]:grid-cols-1 sm:mt-4 sm:gap-4 md:grid-cols-2">
          {supportTeams.map((team) => (
            <article key={team.label} className="group relative isolate overflow-hidden rounded-[1.25rem] border border-blue-100 bg-white p-3.5 shadow-[0_16px_50px_-38px_rgba(15,37,79,0.32)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_24px_65px_-38px_rgba(15,37,79,0.35)] sm:rounded-3xl sm:p-6">
              <div aria-hidden="true" className="absolute -right-12 -top-16 -z-10 h-48 w-48 rounded-full bg-blue-50 blur-3xl transition group-hover:bg-sky-100" />
              <div className="flex items-start gap-4">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[0.65rem] font-black ${team.tone} sm:h-11 sm:w-11 sm:rounded-xl sm:text-xs`}>{team.initials}</span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-700">{team.label}</p>
                  <h3 className="mt-1 text-sm font-extrabold leading-tight tracking-tight text-slate-950 sm:text-lg">{team.title}</h3>
                </div>
              </div>
              <p className="mt-3 max-w-xl text-xs leading-5 text-slate-600 sm:mt-5 sm:text-sm sm:leading-7">{team.description}</p>
              <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-blue-100 bg-[#f6f9ff] px-2.5 py-2 text-[0.62rem] font-semibold leading-4 text-slate-700 sm:mt-4 sm:items-center sm:gap-2 sm:px-3.5 sm:py-2.5 sm:text-xs sm:leading-5">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />Use the official DYCI office or support channel to reach this team.
              </p>
            </article>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-[1.12fr_0.88fr]">
          <section aria-labelledby="contact-details-heading" className="rounded-[1.25rem] border border-blue-100 bg-white p-4 shadow-[0_16px_50px_-38px_rgba(15,37,79,0.3)] sm:rounded-3xl sm:p-6">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-700">Help us help you</p>
            <h3 id="contact-details-heading" className="mt-2 text-lg font-black tracking-tight text-slate-950 sm:text-xl">Share a few useful details.</h3>
            <p className="mt-2.5 text-xs leading-5 text-slate-600 sm:mt-3 sm:text-sm sm:leading-7">When contacting the team, include the details that fit your concern:</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 max-[360px]:grid-cols-1 sm:mt-5 sm:grid-cols-2 sm:gap-2.5">
              {usefulDetails.map((detail) => (
                <li key={detail} className="flex items-start gap-2 rounded-xl border border-slate-200/80 bg-[#f8fafd] px-2.5 py-2 text-[0.65rem] font-semibold leading-4 text-slate-700 sm:gap-3 sm:px-3.5 sm:py-3 sm:text-xs sm:leading-5">
                  <span aria-hidden="true" className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-blue-700 text-white">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><path d="m3 8 3 3 7-7" /></svg>
                  </span>
                  {detail}
                </li>
              ))}
            </ul>
          </section>

          <aside className="relative isolate flex flex-col justify-between overflow-hidden rounded-[1.25rem] bg-[#0b2551] bg-linear-to-br from-[#0b2551] to-[#174b8a] p-4 text-white shadow-[0_20px_60px_-32px_rgba(5,27,64,0.4)] sm:rounded-3xl sm:p-6">
            <div aria-hidden="true" className="absolute -right-12 -top-14 -z-10 h-56 w-56 rounded-full bg-sky-300/15 blur-2xl" />
            <div>
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-sky-200">A.SSET portal</p>
              <h3 className="mt-2 text-lg font-black tracking-tight sm:text-xl">Already have an account?</h3>
              <p className="mt-2.5 text-xs leading-5 text-blue-100/85 sm:mt-3 sm:text-sm sm:leading-7">Sign in to reach the workspace assigned to your role.</p>
            </div>
            <div>
              <a href="/login" className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-blue-900 transition hover:-translate-y-0.5 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900 sm:mt-5 sm:min-h-11 sm:px-4 sm:text-xs">
                Go to login <span aria-hidden="true">→</span>
              </a>
              <p className="mt-3 border-t border-white/15 pt-3 text-[0.65rem] leading-4 text-blue-100/75 sm:mt-4 sm:pt-4 sm:text-xs sm:leading-5">For your security, never share your password or one-time verification code.</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
