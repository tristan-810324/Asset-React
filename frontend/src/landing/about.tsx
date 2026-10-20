const highlights = [
  {
    number: '01',
    title: 'A reliable asset record',
    description:
      'Keep equipment details and availability organized so staff can find the information they need in one place.',
    accent: 'from-sky-400 to-blue-500',
  },
  {
    number: '02',
    title: 'Clear accountability',
    description:
      'Follow an item through issuance, return, and repair with records that help teams understand what happened and when.',
    accent: 'from-blue-500 to-indigo-500',
  },
  {
    number: '03',
    title: 'The right access for each role',
    description:
      'Give IT Admin and GSO Staff focused workspaces for the responsibilities they manage.',
    accent: 'from-violet-400 to-sky-400',
  },
]

const workflow = ['Register', 'Issue', 'Track', 'Return or repair']

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
        <a href="/about" aria-current="page" className="rounded-full bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-700">About</a>
        <a href="/contact" className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">Contact</a>
      </nav>

      <a href="/login" className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-5 sm:text-xs">
        Login portal
      </a>
    </header>
  )
}

export default function AboutPage() {
  return (
    <main id="about" className="relative isolate min-h-screen overflow-hidden bg-white font-['Plus_Jakarta_Sans'] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-linear-to-b from-sky-50 via-white to-white" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-20 -z-10 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-72 -z-10 h-80 w-80 rounded-full bg-violet-200/35 blur-3xl" />

      <LandingHeader />

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-12 lg:pb-28 lg:pt-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3.5 py-2 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-700 shadow-sm sm:text-xs">
            <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 to-indigo-500" />
            About A.SSET
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl xl:text-[4.3rem]">
            School assets, <span className="bg-linear-to-r from-sky-500 via-blue-600 to-violet-600 bg-clip-text text-transparent">accounted for.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            A.SSET is Dr. Yanga&apos;s Colleges&apos; equipment tracking system for keeping asset information, issuance, returns, and repair records together in one clear workspace.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            It helps GSO Staff manage day-to-day equipment records while IT Admin supports user access and system administration.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href="/contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Contact the team <span aria-hidden="true" className="text-base">→</span>
            </a>
            <a href="/login" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Open the portal
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
          <div aria-hidden="true" className="absolute -inset-5 rounded-[2.5rem] bg-linear-to-br from-sky-200/55 via-blue-100/50 to-violet-200/60 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white p-5 shadow-[0_30px_90px_-35px_rgba(37,99,235,0.3)] ring-1 ring-slate-200/80 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-blue-600">A clearer asset lifecycle</p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">From record to return</h2>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-sky-100 via-blue-100 to-violet-100 text-blue-700" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" strokeLinejoin="round" />
                  <path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.4V21M8 5.3l8 4.6" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              {workflow.map((step, index) => (
                <div key={step} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-linear-to-r from-white to-slate-50/80 px-4 py-3.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-sm ${index === 3 ? 'bg-linear-to-br from-violet-500 to-indigo-600' : 'bg-linear-to-br from-sky-500 to-blue-600'}`}>
                    0{index + 1}
                  </span>
                  <span className="text-sm font-extrabold text-slate-800">{step}</span>
                  {index < workflow.length - 1 && <span aria-hidden="true" className="ml-auto text-slate-300">↗</span>}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-white sm:p-6">
              <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.17em] text-sky-300">Built around practical work</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">Inventory, people, and equipment activity are easier to follow when the details stay connected.</p>
              <div aria-hidden="true" className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/4 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-violet-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-linear-to-b from-slate-50/80 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-blue-600">What the system supports</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">One connected view of equipment work.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">A.SSET brings the core records used by the school&apos;s asset team into a role-based full-stack application.</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {highlights.map((item) => (
              <article key={item.number} className="group rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5 sm:p-7">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br ${item.accent} text-xs font-black text-white shadow-md shadow-blue-500/15`}>
                  {item.number}
                </div>
                <h3 className="mt-6 text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
                <div aria-hidden="true" className={`mt-6 h-1 w-14 rounded-full bg-linear-to-r ${item.accent} transition-all duration-300 group-hover:w-24`} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="flex flex-col gap-8 rounded-[2rem] bg-linear-to-br from-slate-950 via-blue-950 to-indigo-950 p-7 text-white shadow-2xl shadow-blue-950/15 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:p-12">
          <div className="max-w-2xl">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-sky-300">A.SSET · DYCI</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Keeping equipment work clear and accountable.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">For questions about records, access, or the asset workflow, the right team can point you to the next step.</p>
          </div>
          <a href="/contact" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950">
            Get in touch <span aria-hidden="true" className="text-base">→</span>
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-100 px-5 py-7 text-center text-xs font-medium text-slate-500 sm:px-8">
        A.SSET · Dr. Yanga&apos;s Colleges, Inc.
      </footer>
    </main>
  )
}
