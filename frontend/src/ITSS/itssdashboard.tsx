import ITSSNavbar from '../components/navbars/itssnavbar'
import { useITSSUser } from './itssUserContext'

function DashboardWelcome() {
  const user = useITSSUser()

  return (
    <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-7 text-white shadow-xl shadow-blue-950/15 sm:px-8 sm:py-9">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
      <div className="relative max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> IT Staff workspace</span>
        <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
        <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">You are signed in to the IT Staff dashboard.</p>
      </div>
    </section>
  )
}

export default function ITSSDashboard() {
  return (
    <ITSSNavbar currentPage="Overview" title="Overview" subtitle="IT Staff dashboard and system tools.">
      <DashboardWelcome />
    </ITSSNavbar>
  )
}
