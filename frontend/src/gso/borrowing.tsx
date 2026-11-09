import { GsoPageFrame } from '../components/navbars/gsonavbar'

export default function BorrowingPage() {
  return (
    <GsoPageFrame activePage="Request & Borrowing" searchPlaceholder="Search requests and borrowings...">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> GSO workflow
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Requests &amp; Borrowing</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">
              Review requester submissions, manage approvals, and track temporary borrowings.
            </p>
          </div>
          <nav className="relative mt-6 flex flex-wrap gap-2 border-t border-blue-400/20 pt-4" aria-label="Issuance and borrowing pages">
            <a href="/gso/main-issuance" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-extrabold text-blue-100 transition hover:bg-white/12">
              + Main Issuance
            </a>
            <a href="/gso/requests-borrowing" aria-current="page" className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md">
              + Request &amp; Borrowing
            </a>
          </nav>
        </section>
      </div>
    </GsoPageFrame>
  )
}
