import { useEffect } from 'react'
import Hero from './hero'

const homeHighlights = [
  {
    number: '01',
    title: 'Inventory records',
    description: 'Keep equipment details organized and easier for the GSO team to review.',
    color: 'from-sky-400 to-blue-600',
  },
  {
    number: '02',
    title: 'Issuance and returns',
    description: 'Follow assignment and return activity with clear records for each item.',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    number: '03',
    title: 'Repair tracking',
    description: 'Keep repair work visible as equipment moves through its lifecycle.',
    color: 'from-indigo-500 to-violet-600',
  },
]

function AboutSection() {
  return (
    <section id="about" className="scroll-mt-28 border-y border-slate-100 bg-white px-5 py-20 font-['Plus_Jakarta_Sans'] text-slate-900 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/70 px-3.5 py-2 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-700 sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 to-violet-500" />
              About A.SSET
            </p>
            <h2 className="mt-5 max-w-2xl text-3xl font-black leading-tight tracking-[-0.04em] text-slate-950 sm:text-4xl lg:text-5xl">
              School equipment, <span className="bg-linear-to-r from-sky-500 via-blue-600 to-violet-600 bg-clip-text text-transparent">easier to follow.</span>
            </h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
              A.SSET is Dr. Yanga&apos;s Colleges&apos; equipment tracking system. It brings inventory, issuance, returns, and repair records into one role-based workspace for GSO Staff and IT Admin.
            </p>
            <a href="/about" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-blue-700 transition hover:text-indigo-700 focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-blue-500">
              Learn more about A.SSET <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {homeHighlights.map((item) => (
            <article key={item.number} className="rounded-3xl border border-slate-200/80 bg-linear-to-br from-white via-white to-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/5 sm:p-7">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br ${item.color} text-xs font-black text-white shadow-md shadow-blue-500/15`}>{item.number}</span>
              <h3 className="mt-5 text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function ContactSection() {
  return (
    <section id="contact" className="scroll-mt-28 bg-linear-to-br from-sky-50 via-white to-violet-50 px-5 py-20 font-['Plus_Jakarta_Sans'] text-slate-900 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-4xl border border-white bg-white/85 p-7 shadow-[0_30px_90px_-45px_rgba(37,99,235,0.35)] backdrop-blur sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
        <div className="max-w-2xl">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.17em] text-indigo-600">Contact and support</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">Need help with A.SSET?</h2>
          <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
            GSO Staff can assist with equipment records, assignments, returns, and repairs. Contact IT Admin for account and portal access concerns through your school&apos;s official channels.
          </p>
        </div>
        <a href="/contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-3 text-xs font-extrabold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          Contact the team <span aria-hidden="true" className="text-base">→</span>
        </a>
      </div>
      <footer className="mx-auto mt-10 max-w-7xl text-center text-xs font-medium text-slate-500">
        A.SSET · Dr. Yanga&apos;s Colleges, Inc.
      </footer>
    </section>
  )
}

export default function LandingHome() {
  useEffect(() => {
    const anchor = decodeURIComponent(window.location.hash.slice(1))
    if (!anchor) return

    const target = document.getElementById(anchor)
    if (target) {
      window.requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [])

  return (
    <>
      <Hero />
      <AboutSection />
      <ContactSection />
    </>
  )
}
