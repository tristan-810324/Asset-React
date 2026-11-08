import ITSSNavbar from '../components/navbars/itssnavbar'

export default function ITStaffDashboard() {
  return (
    <ITSSNavbar
      currentPage="Overview"
      title="IT Staff Workspace"
      subtitle="IT Staff account landing page"
    >
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            IT Staff Workspace
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Welcome to A.S.SET</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
            This account role remains available. IT Staff tools will be connected here when that workflow is defined.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <h2 className="text-base font-black tracking-tight text-slate-900">Workspace setup</h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-500">
          The IT Staff account is separate from GSO Staff and GSO Head. Its workspace is ready for the future IT Staff flow.
        </p>
      </section>
    </ITSSNavbar>
  )
}
