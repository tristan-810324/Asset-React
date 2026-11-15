import { useEffect, useState } from 'react'
import { AdminPageFrame } from '../components/navbars/adminnavbar'
import { RecentAuditList } from '../components/audit/auditlogview'
import ComputerLabSupportPanel from '../itstaff/computerlabsupport'
import { listServiceWorkOrders, type ServiceWorkSummary } from '../gso/serviceWorkboardApi'
import { AdminGlyph, AdminMetricCard, type AdminGlyphName } from './adminui'
import { listAuditLogs } from './auditLogsApi'
import { listSystemUsers } from './userManagementApi'

const quickActions: Array<{ label: string; detail: string; icon: AdminGlyphName; href: string }> = [
  { label: 'Manage user accounts', detail: 'Create or review accounts', icon: 'users', href: '/admin/users' },
  { label: 'Open support queue', detail: 'Claim and complete lab jobs', icon: 'wrench', href: '/admin/support-queue' },
  { label: 'Review audit trail', detail: 'Check changes and red flags', icon: 'history', href: '/admin/audit-logs' },
]

export default function AdminDashboard() {
  const [accountCounts, setAccountCounts] = useState<{ total: number; active: number } | null>(null)
  const [labSummary, setLabSummary] = useState<ServiceWorkSummary | null>(null)
  const [flaggedCount, setFlaggedCount] = useState<number | undefined>(undefined)

  useEffect(() => {
    let active = true
    listSystemUsers()
      .then((accounts) => {
        if (active) setAccountCounts({ total: accounts.length, active: accounts.filter((account) => account.isActive).length })
      })
      .catch(() => undefined)
    listServiceWorkOrders({ team: 'ITSS', limit: 1 })
      .then(({ summary }) => { if (active) setLabSummary(summary) })
      .catch(() => undefined)
    listAuditLogs({ limit: 1, offset: 0, action: 'all', entityType: 'all', flag: 'all', search: '', from: '', to: '' })
      .then((page) => { if (active) setFlaggedCount(page.flaggedLast30Days) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  return (
    <AdminPageFrame activePath="/admin" pageName="Overview">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> IT Admin workspace
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Admin dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Accounts, computer lab support, and the audit trail in one place.</p>
        </div>
      </section>

      <section className="mt-6" aria-label="Overview numbers">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <AdminMetricCard
            label="User accounts"
            value={accountCounts?.total}
            detail={accountCounts ? `${accountCounts.active} active` : 'Loading'}
            icon="users"
            href="/admin/users"
            badgeTone="bg-blue-50 text-blue-800"
          />
          <AdminMetricCard
            label="New lab jobs"
            value={labSummary?.new}
            detail="Waiting to be claimed"
            icon="wrench"
            href="/admin/support-queue?queue=new"
          />
          <AdminMetricCard
            label="Overdue lab jobs"
            value={labSummary?.overdue}
            detail="Past the target date"
            icon="clock"
            href="/admin/support-queue?queue=overdue"
            badgeTone="bg-rose-50 text-rose-700"
            valueTone="text-rose-700"
          />
          <AdminMetricCard
            label="Red flags · 30 days"
            value={flaggedCount}
            detail="Check these first"
            icon="alert"
            href="/admin/audit-logs?flag=any"
            badgeTone="bg-amber-50 text-amber-800"
          />
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]" aria-label="Computer lab support and next tasks">
        <ComputerLabSupportPanel queueHref="/admin/support-queue" />

        <article className="rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6">
          <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Quick actions</p>
          <h2 className="mt-1 text-base font-black tracking-tight text-slate-900">Next tasks</h2>
          <div className="mt-5 space-y-3">
            {quickActions.map((task) => (
              <a key={task.label} href={task.href} className="group flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 transition hover:border-blue-300 hover:bg-blue-50">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><AdminGlyph name={task.icon} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800">{task.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{task.detail}</span>
                </span>
                <span className="text-blue-700 transition group-hover:translate-x-0.5"><AdminGlyph name="arrow" /></span>
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6" aria-labelledby="recent-activity-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">Audit trail</p>
            <h2 id="recent-activity-title" className="mt-1 text-base font-black tracking-tight text-slate-900">Recent activity</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Latest entries from the audit log.</p>
          </div>
          <a href="/admin/audit-logs" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[0.68rem] font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800">View all</a>
        </div>
        <div className="mt-5">
          <RecentAuditList limit={5} />
        </div>
      </section>
    </AdminPageFrame>
  )
}
