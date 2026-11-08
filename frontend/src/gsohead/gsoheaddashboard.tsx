import { useState, type ReactNode } from 'react'
import { clearAuthSession } from '../auth/authApi'
import PurchaseRequisitionQueue from './purchasequeue'

type HeadIconName = 'menu' | 'grid' | 'clipboard' | 'logout' | 'chevron'

const iconPaths: Record<HeadIconName, ReactNode> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  grid: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><rect x="14" y="14" width="6.5" height="6.5" rx="1" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
}

function Icon({ name, className = 'h-4 w-4' }: { name: HeadIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

export default function GsoHeadDashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  function signOut() {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-y-auto bg-[#071b35] px-5 py-6 text-slate-300 shadow-2xl shadow-slate-900/20 transition-transform duration-300 lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="GSO Head navigation">
        <div className="flex items-center gap-3 px-2">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-indigo-500 to-blue-600 text-sm font-black text-white shadow-lg shadow-blue-950/30">GH</span>
          <div>
            <p className="text-sm font-black tracking-tight text-white">A.S.SET</p>
            <p className="mt-0.5 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-indigo-200">GSO Head</p>
          </div>
        </div>

        <div className="mt-9 px-3 text-[0.58rem] font-extrabold uppercase tracking-[0.16em] text-slate-500">Head workspace</div>
        <nav className="mt-2 space-y-1" aria-label="GSO Head pages">
          <a href="/gso-head" aria-current="page" className="flex items-center gap-3 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-3.5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/35">
            <Icon name="grid" className="h-[1.15rem] w-[1.15rem]" /> Overview
          </a>
          <a href="#purchase-requisition-queue" className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/8 hover:text-white">
            <Icon name="clipboard" className="h-[1.15rem] w-[1.15rem]" />
            <span className="flex-1">Purchase requisitions</span>
          </a>
        </nav>

        <div className="mt-auto rounded-2xl border border-indigo-300/15 bg-linear-to-br from-indigo-900/70 to-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-indigo-200">
            <Icon name="clipboard" className="h-4 w-4" />
            <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em]">Separate workspace</span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">GSO Head approvals are separate from GSO Staff inventory, issuance, and returns.</p>
        </div>
      </aside>

      {mobileMenuOpen && <button type="button" className="fixed inset-0 z-30 bg-slate-950/55 backdrop-blur-[2px] lg:hidden" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />}

      <section className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f4f7fb]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMobileMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden" aria-label="Open navigation menu" aria-expanded={mobileMenuOpen}>
                <Icon name="menu" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[0.65rem] font-bold text-slate-500 sm:text-xs">General Services Office / <span className="text-slate-700">GSO Head Overview</span></p>
                <p className="mt-0.5 hidden text-[0.68rem] font-bold text-slate-400 sm:block">{today}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden rounded-xl border border-indigo-100 bg-white px-3 py-2 text-[0.65rem] font-extrabold text-indigo-700 sm:inline-flex">GSO Head account</span>
              <button type="button" onClick={signOut} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-rose-200 hover:text-rose-700" aria-label="Sign out">
                <Icon name="logout" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(129,140,248,0.4),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(59,130,246,0.2),transparent_36%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-indigo-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> GSO Head Workspace
                </span>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">GSO Head Overview</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Dedicated dashboard for purchase requisition review, endorsement, and Finance handoff.</p>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="GSO Head workflow stages">
            {[
              { number: '01', title: 'Submitted by EmployeeHead', detail: 'Purchase request enters the GSO Head review queue.' },
              { number: '02', title: 'Review and endorse', detail: 'GSO Head reviews the request from their own account.' },
              { number: '03', title: 'Send to Finance', detail: 'GSO Head records the external handoff; Finance has no dashboard.' },
              { number: '04', title: 'Record Finance response', detail: 'Record the response received by email or paper.' },
            ].map((step) => (
              <article key={step.number} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55">
                <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-indigo-700">Step {step.number}</p>
                <h2 className="mt-2 text-sm font-black tracking-tight text-slate-900">{step.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{step.detail}</p>
              </article>
            ))}
          </section>

          <PurchaseRequisitionQueue />
        </div>
      </section>
    </main>
  )
}
