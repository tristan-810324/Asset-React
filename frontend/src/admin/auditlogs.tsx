import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { clearAuthSession } from '../auth/authApi'
import AdminNavbar, { AdminPageHeader } from '../components/navbars/adminnavbar'
import { listAuditLogs, type AuditLogAction, type AuditLogEntityType, type AuditLogEntry } from './auditLogsApi'

const pageSize = 25

type AuditIconName = 'activity' | 'menu' | 'search' | 'clock'

const iconPaths: Record<AuditIconName, ReactNode> = {
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  search: <><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15.1 15.1 4.15 4.15" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
}

function Icon({ name, className = 'h-5 w-5' }: { name: AuditIconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function actionLabel(action: AuditLogAction) {
  if (action === 'created') return 'Created'
  if (action === 'updated') return 'Edited'
  if (action === 'renamed') return 'Renamed'
  return 'Deleted'
}

function entityLabel(entityType: AuditLogEntityType) {
  if (entityType === 'employee') return 'Employee profile'
  if (entityType === 'item') return 'Inventory item'
  return 'Category'
}

function actionTone(action: AuditLogAction) {
  if (action === 'created') return 'bg-blue-50 text-blue-700'
  if (action === 'updated') return 'bg-amber-50 text-amber-700'
  if (action === 'renamed') return 'bg-violet-50 text-violet-700'
  return 'bg-rose-50 text-rose-700'
}

function AuditValues({ title, values }: { title: string; values: Record<string, unknown> }) {
  const entries = Object.entries(values || {})
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">{title}</h4>
      {entries.length ? (
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap wrap-break-word text-[0.68rem] leading-relaxed text-slate-700">{JSON.stringify(values, null, 2)}</pre>
      ) : <p className="mt-2 text-xs italic text-slate-400">No previous values.</p>}
    </section>
  )
}

export default function AuditLogs() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<'all' | AuditLogAction>('all')
  const [entityType, setEntityType] = useState<'all' | AuditLogEntityType>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true

    const loadLogs = async () => {
      setIsLoading(true)
      setErrorMessage('')
      try {
        const result = await listAuditLogs({
          limit: pageSize,
          offset: page * pageSize,
          action,
          entityType,
          search,
          from,
          to,
        })
        if (!active) return
        setLogs(result.logs)
        setTotal(result.total)
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Unable to load the audit logs.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadLogs()
    return () => { active = false }
  }, [action, entityType, from, page, search, to])

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  const firstResult = total === 0 ? 0 : page * pageSize + 1
  const lastResult = Math.min(total, page * pageSize + logs.length)

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(0)
    setSearch(searchDraft.trim())
  }

  const clearFilters = () => {
    setSearchDraft('')
    setSearch('')
    setAction('all')
    setEntityType('all')
    setFrom('')
    setTo('')
    setPage(0)
  }

  const handleSignOut = () => {
    clearAuthSession()
    window.location.replace('/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <AdminNavbar activePath="/admin/audit-logs" mobileMenuOpen={mobileMenuOpen} onMobileMenuClose={() => setMobileMenuOpen(false)} />
      <section className="min-h-screen lg:pl-72">
        <AdminPageHeader pageName="Audit logs" subtitle="Employee, inventory, and category change history" onOpenMenu={() => setMobileMenuOpen(true)} onSignOut={handleSignOut} />

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><Icon name="activity" className="h-3.5 w-3.5" /> Admin activity history</span>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Audit logs</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">See who made each inventory or category change, when it was made, and the reason provided.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
                <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-200">Matching events</span>
                <span className="mt-1 block text-xl font-black text-white">{isLoading ? '—' : total}</span>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6" aria-label="Audit log filters">
            <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.5fr_0.8fr_0.8fr_0.75fr_0.75fr_auto]">
              <label className="block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Search logs</span>
                <span className="relative block">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Employee, item, category, actor, or reason" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10" />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Action</span>
                <select value={action} onChange={(event) => { setAction(event.target.value as 'all' | AuditLogAction); setPage(0) }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500">
                  <option value="all">All actions</option><option value="created">Created</option><option value="updated">Edited</option><option value="renamed">Renamed</option><option value="deleted">Deleted</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Record type</span>
                <select value={entityType} onChange={(event) => { setEntityType(event.target.value as 'all' | AuditLogEntityType); setPage(0) }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500">
                  <option value="all">All records</option><option value="employee">Employee profile</option><option value="item">Inventory item</option><option value="category">Category</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">From</span>
                <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0) }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">To</span>
                <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0) }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500" />
              </label>
              <div className="flex items-end gap-2">
                <button type="submit" className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white hover:bg-blue-700">Search</button>
                <button type="button" onClick={clearFilters} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Clear</button>
              </div>
            </form>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-black tracking-tight text-slate-900">Employee, inventory, and category activity</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Each record includes the reason and before-and-after values when opened.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-bold text-slate-400"><Icon name="clock" className="h-3.5 w-3.5" /> Showing {firstResult}–{lastResult} of {total}</span>
            </div>

            {errorMessage && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6">{errorMessage}</p>}

            <div className="overflow-x-auto border-t border-slate-100">
              <table className="min-w-225 w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-5 py-3.5 sm:px-6">Date / Actor</th><th className="px-5 py-3.5">Record</th><th className="px-5 py-3.5">Action</th><th className="px-5 py-3.5">Reason</th><th className="px-5 py-3.5 sm:px-6">Details</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center font-semibold text-slate-500">Loading audit logs…</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-12 text-center"><p className="font-extrabold text-slate-700">No matching audit entries</p><p className="mt-1 text-xs text-slate-500">Employee, item, and category changes will appear here once they have been recorded.</p></td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className="align-top hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-4 sm:px-6"><p className="font-bold text-slate-700">{formatDate(log.changedAt)}</p><p className="mt-1 text-[0.68rem] font-semibold text-slate-400">{log.changedBy || 'Unknown user'}</p></td>
                      <td className="px-5 py-4"><p className="font-extrabold text-slate-800">{log.entityName}</p><p className="mt-1 text-[0.65rem] font-semibold text-slate-400">{entityLabel(log.entityType)} · ID {log.entityId}</p></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${actionTone(log.action)}`}>{actionLabel(log.action)}</span></td>
                      <td className="max-w-sm px-5 py-4 text-slate-600"><p className="line-clamp-3 leading-relaxed">{log.reason}</p></td>
                      <td className="px-5 py-4 sm:px-6"><button type="button" onClick={() => setSelectedLog(log)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[0.68rem] font-extrabold text-blue-700 hover:bg-blue-100">View details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-[0.68rem] font-semibold text-slate-400">Page {page + 1} of {Math.max(1, lastPage + 1)}</p>
              <div className="flex gap-2">
                <button type="button" disabled={page === 0 || isLoading} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <button type="button" disabled={page >= lastPage || isLoading} onClick={() => setPage((current) => Math.min(lastPage, current + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </div>
            </div>
          </section>
        </div>
      </section>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="my-6 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${actionTone(selectedLog.action)}`}>{actionLabel(selectedLog.action)}</span>
                <h3 id="audit-detail-title" className="mt-2 text-base font-black text-slate-900">{selectedLog.entityName}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{entityLabel(selectedLog.entityType)} · ID {selectedLog.entityId}</p>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50">Close</button>
            </div>
            <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div><dt className="text-[0.62rem] font-extrabold uppercase text-slate-400">Changed by</dt><dd className="mt-1 text-xs font-bold text-slate-700">{selectedLog.changedBy || 'Unknown user'}</dd></div>
              <div><dt className="text-[0.62rem] font-extrabold uppercase text-slate-400">Date and time</dt><dd className="mt-1 text-xs font-bold text-slate-700">{formatDate(selectedLog.changedAt)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-[0.62rem] font-extrabold uppercase text-slate-400">Reason</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{selectedLog.reason}</dd></div>
            </dl>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <AuditValues title="Previous values" values={selectedLog.oldValues} />
              <AuditValues title="New values" values={selectedLog.newValues} />
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
