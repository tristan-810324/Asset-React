import ITSSNavbar from '../components/navbars/itssnavbar'
import ComputerLabSupportPanel from './computerlabsupport'

function Icon({ name, className = 'h-4 w-4' }: { name: 'arrow'; className?: string }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  }
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

export default function ITStaffDashboard() {
  return (
    <ITSSNavbar
      currentPage="Overview"
      title="IT Staff Workspace"
      subtitle="Computer laboratory and technical requests"
    >
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> IT Staff Workspace
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Welcome to A.S.SET</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Computer laboratory and technical requests from requesters land here. Claim a job, work on it, and mark it complete.
            </p>
          </div>
          <a href="/itss/service-workboard" className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:self-auto">
            Open support queue <Icon name="arrow" className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      <div className="mt-6">
        <ComputerLabSupportPanel queueHref="/itss/service-workboard" />
      </div>
    </ITSSNavbar>
  )
}
