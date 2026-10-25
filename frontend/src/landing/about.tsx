const capabilities = [
  {
    number: '01',
    title: 'Organized inventory records',
    description:
      'Keep school equipment details together so GSO staff can review and maintain item records.',
    color: 'from-sky-400 to-blue-600',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Issuance and returns',
    description:
      'Record equipment assigned to employees and follow its return status.',
    color: 'from-blue-500 to-indigo-600',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0-4-4m4 4-4 4M16 17H4m0 0 4 4m-4-4 4-4" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Repair follow-up',
    description:
      'Keep items that need attention visible to the GSO team.',
    color: 'from-indigo-500 to-violet-600',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3.4-3.4 3.4-3Z" />
      </svg>
    ),
  },
]

const workflow = [
  {
    step: '01',
    title: 'Record',
    description: 'Keep item details and equipment records organized.',
  },
  {
    step: '02',
    title: 'Issue',
    description: 'Record equipment assignments to employees.',
  },
  {
    step: '03',
    title: 'Return',
    description: 'Update the record when equipment is returned.',
  },
  {
    step: '04',
    title: 'Repair',
    description: 'Follow up on items that need repair.',
  },
]

function LandingHeader() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
      <a
        href="/"
        aria-label="A.SSET home"
        className="flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
          <img
            src="/dyci_img/dyci-logo.webp"
            alt="Dr. Yanga's Colleges logo"
            className="h-full w-full object-contain"
          />
        </span>
        <span>
          <span className="block text-sm font-black tracking-[0.2em] text-slate-900">A.SSET</span>
          <span className="mt-0.5 block text-[0.58rem] font-bold uppercase tracking-[0.13em] text-slate-500">
            DYCI equipment tracking
          </span>
        </span>
      </a>

      <nav
        aria-label="Main navigation"
        className="order-3 mt-4 flex w-full items-center justify-center gap-1 rounded-full border border-slate-200/80 bg-white/85 p-1 shadow-sm backdrop-blur md:order-0 md:mt-0 md:w-auto"
      >
        <a href="/" className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Home
        </a>
        <a href="/about" aria-current="page" className="rounded-full bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          About
        </a>
        <a href="/faq" className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          FAQ
        </a>
        <a href="/contact" className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          Contact
        </a>
      </nav>

      <a
        href="/login"
        className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-5 sm:text-xs"
      >
        Login portal
      </a>
    </header>
  )
}

export default function AboutPage() {
  return (
    <main id="about" className="relative isolate min-h-screen overflow-hidden bg-white font-['Plus_Jakarta_Sans'] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-192 bg-linear-to-b from-sky-50/80 via-white to-white" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-36 top-32 -z-10 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-136 -z-10 h-96 w-96 rounded-full bg-violet-200/35 blur-3xl" />

      <LandingHeader />

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-16 lg:px-12 lg:pb-24 lg:pt-20">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3.5 py-2 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-700 shadow-sm sm:text-xs">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 to-violet-500" />
            About A.SSET
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">
            A clearer view of school{' '}
            <span className="bg-linear-to-r from-sky-500 via-blue-600 to-violet-600 bg-clip-text text-transparent">
              equipment.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            A.SSET is Dr. Yanga&apos;s Colleges&apos; equipment tracking portal. It supports the teams responsible for keeping item records organized and following equipment through assignment, return, and repair.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            GSO Staff use it for equipment operations, while IT Admin supports account access and system oversight. Each team can use the workspace suited to its responsibilities.
          </p>

          <div className="mt-8 flex flex-col gap-3.5 sm:flex-row sm:items-center">
            <a
              href="/login"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 px-7 py-3 text-xs font-extrabold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Open the portal <span aria-hidden="true" className="text-base">→</span>
            </a>
            <a
              href="/contact"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-7 py-3 text-xs font-extrabold uppercase tracking-widest text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Contact the team
            </a>
          </div>
        </div>

        <figure className="relative mx-auto w-full max-w-xl lg:ml-auto">
          <div aria-hidden="true" className="absolute -inset-4 rounded-[2.5rem] bg-linear-to-br from-sky-200/70 via-blue-100/50 to-violet-200/60 blur-2xl" />
          <div className="relative overflow-hidden rounded-4xl border border-white bg-white p-2 shadow-[0_30px_90px_-40px_rgba(37,99,235,0.4)] ring-1 ring-slate-200/70">
            <img
              src="/dyci_img/homepage5.jpg"
              alt="A campus building at Dr. Yanga's Colleges"
              className="h-72 w-full rounded-3xl object-cover object-center sm:h-96"
            />
            <figcaption className="absolute inset-x-5 bottom-5 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-lg backdrop-blur sm:inset-x-7 sm:bottom-7">
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-md shadow-blue-500/20">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M16 12h.01" />
                </svg>
              </span>
              <span>
                <span className="block text-sm font-extrabold text-slate-950">Dr. Yanga&apos;s Colleges, Inc.</span>
                <span className="mt-0.5 block text-xs font-medium text-slate-500">Equipment tracking for school operations</span>
              </span>
            </figcaption>
          </div>
        </figure>
      </section>

      <section className="border-y border-slate-100 bg-white/85 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-blue-600">What A.SSET supports</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Equipment records, kept in view.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              Follow the work around school equipment, from maintaining item details to tracking assignments and repair needs.
            </p>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {capabilities.map((item) => (
              <article key={item.number} className="group rounded-3xl border border-slate-200/80 bg-linear-to-br from-white via-white to-slate-50 p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5 sm:p-7">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br ${item.color} text-white shadow-md shadow-blue-500/15`}>
                  {item.icon}
                </div>
                <h3 className="mt-5 text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 grid gap-4 rounded-3xl border border-blue-100 bg-linear-to-br from-sky-50/80 via-white to-violet-50/80 p-6 sm:grid-cols-[0.8fr_1.2fr] sm:items-center sm:p-8">
            <div>
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-indigo-600">Role-based workspaces</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">Focused tools for each team.</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
                <p className="text-sm font-extrabold text-slate-950">GSO Staff</p>
                <p className="mt-1.5 text-xs leading-6 text-slate-600">Inventory and employee records, issuance and returns, and repair follow-up.</p>
              </div>
              <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
                <p className="text-sm font-extrabold text-slate-950">IT Admin</p>
                <p className="mt-1.5 text-xs leading-6 text-slate-600">Account access and system oversight, including user management and audit activity.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-linear-to-br from-sky-50 via-white to-violet-50 px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-indigo-600">Equipment lifecycle</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">A simple path to follow.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              A.SSET helps the teams responsible for equipment keep each part of the lifecycle visible.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item) => (
              <li key={item.step} className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm ring-1 ring-slate-200/60 sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-sky-400 to-indigo-600 text-xs font-black text-white shadow-md shadow-blue-500/20">
                  {item.step}
                </span>
                <h3 className="mt-5 text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-center text-xs font-medium text-slate-500">Record <span aria-hidden="true">→</span> Issue <span aria-hidden="true">→</span> Return <span aria-hidden="true">→</span> Repair</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-white p-7 shadow-[0_30px_90px_-50px_rgba(37,99,235,0.35)] sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-linear-to-br from-sky-200/70 to-violet-200/70 blur-3xl" />
          <div className="relative max-w-2xl">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-blue-600">A.SSET portal</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">Ready to open your workspace?</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
              Sign in to access the workspace available to your account, or contact the team for equipment and portal support.
            </p>
          </div>
          <div className="relative mt-6 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
            <a href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-3 text-xs font-extrabold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Open the portal <span aria-hidden="true" className="text-base">→</span>
            </a>
            <a href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-xs font-extrabold uppercase tracking-widest text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              Contact the team
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-xs font-medium text-slate-500 sm:flex-row">
          <p>A.SSET <span aria-hidden="true">·</span> Dr. Yanga&apos;s Colleges, Inc.</p>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a href="/" className="transition hover:text-blue-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500">Home</a>
            <a href="/about" aria-current="page" className="font-bold text-blue-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500">About</a>
            <a href="/faq" className="transition hover:text-blue-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500">FAQ</a>
            <a href="/contact" className="transition hover:text-blue-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500">Contact</a>
            <a href="/login" className="font-extrabold text-slate-700 transition hover:text-blue-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500">Login portal</a>
          </nav>
        </div>
      </footer>
    </main>
  )
}
