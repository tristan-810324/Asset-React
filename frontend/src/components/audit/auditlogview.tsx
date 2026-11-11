import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { listAuditLogs, type AuditLogAction, type AuditLogEntityType, type AuditLogEntry, type AuditLogFlag } from '../../admin/auditLogsApi'

const pageSize = 25

type FlagFilter = 'all' | 'any' | AuditLogFlag

const actionOptions: Array<{ value: AuditLogAction; label: string; tone: string }> = [
  { value: 'created', label: 'Added', tone: 'bg-blue-50 text-blue-700' },
  { value: 'updated', label: 'Edited', tone: 'bg-amber-50 text-amber-700' },
  { value: 'renamed', label: 'Renamed', tone: 'bg-violet-50 text-violet-700' },
  { value: 'requested', label: 'Requested', tone: 'bg-sky-50 text-sky-700' },
  { value: 'issued', label: 'Issued', tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'returned', label: 'Returned', tone: 'bg-teal-50 text-teal-700' },
  { value: 'received', label: 'Received', tone: 'bg-indigo-50 text-indigo-700' },
  { value: 'approved', label: 'Approved', tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'rejected', label: 'Declined', tone: 'bg-rose-50 text-rose-700' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bg-slate-100 text-slate-600' },
  { value: 'moved', label: 'Moved', tone: 'bg-cyan-50 text-cyan-700' },
  { value: 'deleted', label: 'Deleted', tone: 'bg-rose-50 text-rose-700' },
]

const flagOptions: Array<{ value: AuditLogFlag; label: string; hint: string; tone: string }> = [
  { value: 'MANUAL_ENTRY', label: 'Typed code', hint: 'The barcode was typed in, not scanned.', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { value: 'ITEM_LOST', label: 'Reported lost', hint: 'A unit was reported lost. A settlement is needed.', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { value: 'DELIVERY_UNDONE', label: 'Delivery undone', hint: 'A recorded purchase delivery was taken back.', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { value: 'RECORD_DELETED', label: 'Record deleted', hint: 'A record was removed from the system.', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { value: 'LABEL_REPRINT', label: 'Label reprinted', hint: 'The old barcode label was replaced with a new one.', tone: 'bg-violet-50 text-violet-700 ring-violet-200' },
]

const entityLabels: Record<AuditLogEntityType, string> = {
  employee: 'Employee profile',
  item: 'Inventory item',
  category: 'Category',
  request: 'Request',
}

// Plain-language names for the fields stored in each entry's values.
const valueLabels: Record<string, string> = {
  tagCode: 'Unit barcode',
  custodyStatus: 'Custody',
  lifecycleStatus: 'Lifecycle',
  condition: 'Condition',
  issuanceStatus: 'Issuance status',
  inventoryStatus: 'Stock status',
  returnStatus: 'Return status',
  entryMethod: 'Barcode entry',
  confirmationMethod: 'Confirmed by',
  location: 'Location',
  destination: 'Sent to',
  employeeCode: 'Employee code',
  employeeEmail: 'Employee email',
  handoverEmployeeCode: 'Handed over to',
  quantity: 'Quantity',
  issuedQuantity: 'Issued quantity',
  reservedQuantity: 'Reserved quantity',
  availableQuantity: 'Available quantity',
  barcodeCount: 'Barcodes',
  labelVersion: 'Label version',
  labelPrinted: 'Label printed',
  status: 'Status',
  financeEmail: 'Finance email',
  receiptReference: 'Receipt reference',
  receiptId: 'Delivery record',
  movementType: 'Movement type',
  fromEmployee: 'From employee',
  toEmployee: 'To employee',
  fromLocation: 'From location',
  toLocation: 'To location',
  recipientLocation: 'Use location',
  recipientPurpose: 'Intended use',
  issuanceBatchId: 'Issuance batch',
  lastInspectionNote: 'Inspection note',
  decisions: 'Item decisions',
  deliveries: 'Deliveries',
  routes: 'Routes',
  dueDate: 'Due date',
  conditionOut: 'Condition given',
  conditionIn: 'Condition received',
  conditionsIn: 'Conditions received',
  unitOfMeasure: 'Unit of measure',
  reservedQuantityBefore: 'Reserved before',
  availableQuantityBefore: 'Available before',
  inventoryStatusBefore: 'Stock status before',
  financeQuantity: 'Finance quantity',
  requestedQuantity: 'Requested quantity',
}

function actionInfo(action: AuditLogAction) {
  return actionOptions.find((option) => option.value === action) ?? { label: action, tone: 'bg-slate-100 text-slate-600' }
}

function labelFor(key: string) {
  return valueLabels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key === 'entryMethod') return value === 'scan' ? 'Scanned' : 'Typed'
  if (Array.isArray(value)) {
    return value.every((item) => typeof item !== 'object' || item === null)
      ? value.map(String).join(', ')
      : `${value.length} item${value.length === 1 ? '' : 's'}`
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function FlagBadge({ flag }: { flag: AuditLogFlag }) {
  const info = flagOptions.find((option) => option.value === flag)
  if (!info) return null
  return <span title={info.hint} className={`inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold ring-1 ${info.tone}`}>⚠ {info.label}</span>
}

function ValueList({ title, values }: { title: string; values: Record<string, unknown> }) {
  const entries = Object.entries(values || {})
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">{title}</h4>
      {entries.length > 0 ? (
        <dl className="mt-3 space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0">
              <dt className="text-[0.68rem] font-bold text-slate-500">{labelFor(key)}</dt>
              <dd className="max-w-[60%] wrap-break-word text-right text-xs font-bold text-slate-800">{formatValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-2 text-xs italic text-slate-400">Nothing recorded.</p>}
    </section>
  )
}

function readFlagFromUrl(): FlagFilter {
  const value = new URLSearchParams(window.location.search).get('flag')
  if (value === 'any') return 'any'
  return flagOptions.some((option) => option.value === value) ? value as AuditLogFlag : 'all'
}

// The audit view is shared by GSO Staff, GSO Head, and IT Admin. Each page passes its own frame.
export default function AuditLogView({ frame }: { frame: (content: ReactNode) => ReactNode }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [flaggedCount, setFlaggedCount] = useState(0)
  const [page, setPage] = useState(0)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [action, setAction] = useState<'all' | AuditLogAction>('all')
  const [entityType, setEntityType] = useState<'all' | AuditLogEntityType>('all')
  const [flag, setFlag] = useState<FlagFilter>(readFlagFromUrl)
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
        const result = await listAuditLogs({ limit: pageSize, offset: page * pageSize, action, entityType, flag, search, from, to })
        if (!active) return
        setLogs(result.logs)
        setTotal(result.total)
        setFlaggedCount(result.flaggedLast30Days)
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Hindi ma-load ang audit logs.')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadLogs()
    return () => { active = false }
  }, [action, entityType, flag, from, page, search, to])

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1)
  const firstResult = total === 0 ? 0 : page * pageSize + 1
  const lastResult = Math.min(total, page * pageSize + logs.length)

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(0)
    setSearch(searchDraft.trim())
  }

  function clearFilters() {
    setSearchDraft('')
    setSearch('')
    setAction('all')
    setEntityType('all')
    setFlag('all')
    setFrom('')
    setTo('')
    setPage(0)
  }

  function showRedFlags() {
    setFlag('any')
    setPage(0)
  }

  const labelClass = 'mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500'
  const selectClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500'

  return frame(
    <>
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Activity history</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Audit Logs</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Read-only record of who added, issued, returned, or changed each item, with the reason. Entries marked ⚠ need a look.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={showRedFlags} aria-pressed={flag === 'any'} className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-left transition hover:bg-amber-400/20">
              <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-amber-100">Red flags · 30 days</span>
              <span className="mt-1 block text-xl font-black text-white">{isLoading ? '—' : flaggedCount}</span>
            </button>
            <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
              <span className="block text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-200">Matching entries</span>
              <span className="mt-1 block text-xl font-black text-white">{isLoading ? '—' : total}</span>
            </div>
          </div>
        </div>
      </section>

      {flaggedCount > 0 && flag !== 'any' && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-xs font-bold leading-relaxed text-amber-900">{flaggedCount} entr{flaggedCount === 1 ? 'y' : 'ies'} in the last 30 days were typed in, reported lost, undone, deleted, or reprinted. Check them first.</p>
          <button type="button" onClick={showRedFlags} className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-amber-600">Show red flags</button>
        </div>
      )}

      <section className="mt-6 rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-6" aria-label="Audit log filters">
        <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_0.7fr_0.7fr_auto]">
          <label className="block">
            <span className={labelClass}>Search</span>
            <input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name, code, reason, or person" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10" />
          </label>
          <label className="block">
            <span className={labelClass}>What happened</span>
            <select value={action} onChange={(event) => { setAction(event.target.value as 'all' | AuditLogAction); setPage(0) }} className={selectClass}>
              <option value="all">All actions</option>
              {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Record type</span>
            <select value={entityType} onChange={(event) => { setEntityType(event.target.value as 'all' | AuditLogEntityType); setPage(0) }} className={selectClass}>
              <option value="all">All records</option>
              {(Object.keys(entityLabels) as AuditLogEntityType[]).map((value) => <option key={value} value={value}>{entityLabels[value]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Red flags</span>
            <select value={flag} onChange={(event) => { setFlag(event.target.value as FlagFilter); setPage(0) }} className={selectClass}>
              <option value="all">All entries</option>
              <option value="any">Any red flag</option>
              {flagOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>From</span>
            <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0) }} className={selectClass} />
          </label>
          <label className="block">
            <span className={labelClass}>To</span>
            <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0) }} className={selectClass} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white hover:bg-blue-700">Search</button>
            <button type="button" onClick={clearFilters} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Clear</button>
          </div>
        </form>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">Activity history</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Select View details to see the reason and the values before and after.</p>
          </div>
          <span className="text-[0.68rem] font-bold text-slate-400">Showing {firstResult}–{lastResult} of {total}</span>
        </div>

        {errorMessage && <p role="alert" className="mx-5 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:mx-6">{errorMessage}</p>}

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-225 w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3.5 sm:px-6">When / by</th><th className="px-5 py-3.5">Record</th><th className="px-5 py-3.5">What happened</th><th className="px-5 py-3.5">Reason</th><th className="px-5 py-3.5 sm:px-6">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center font-semibold text-slate-500">Loading audit logs…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center"><p className="font-extrabold text-slate-700">No matching entries</p><p className="mt-1 text-xs text-slate-500">Changes will show here as they happen. Try clearing the filters.</p></td></tr>
              ) : logs.map((log) => {
                const info = actionInfo(log.action)
                return (
                  <tr key={log.id} className={`align-top hover:bg-slate-50/60 ${log.flag ? 'bg-amber-50/40' : ''}`}>
                    <td className="whitespace-nowrap px-5 py-4 sm:px-6"><p className="font-bold text-slate-700">{formatDate(log.changedAt)}</p><p className="mt-1 text-[0.68rem] font-semibold text-slate-400">{log.changedBy || 'System'}</p></td>
                    <td className="px-5 py-4"><p className="font-extrabold text-slate-800">{log.entityName}</p><p className="mt-1 text-[0.65rem] font-semibold text-slate-400">{entityLabels[log.entityType]} · {log.entityId}</p></td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${info.tone}`}>{info.label}</span>{log.flag && <div className="mt-2"><FlagBadge flag={log.flag} /></div>}</td>
                    <td className="max-w-sm px-5 py-4 text-slate-600"><p className="line-clamp-3 leading-relaxed">{log.reason}</p></td>
                    <td className="px-5 py-4 sm:px-6"><button type="button" onClick={() => setSelectedLog(log)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[0.68rem] font-extrabold text-blue-700 hover:bg-blue-100">View details</button></td>
                  </tr>
                )
              })}
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

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLog(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="my-6 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${actionInfo(selectedLog.action).tone}`}>{actionInfo(selectedLog.action).label}</span>
                  {selectedLog.flag && <FlagBadge flag={selectedLog.flag} />}
                </div>
                <h3 id="audit-detail-title" className="mt-2 text-base font-black text-slate-900">{selectedLog.entityName}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{entityLabels[selectedLog.entityType]} · {selectedLog.entityId}</p>
                {selectedLog.flag && <p className="mt-2 text-xs font-bold text-amber-800">{flagOptions.find((option) => option.value === selectedLog.flag)?.hint}</p>}
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50">Close</button>
            </div>
            <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div><dt className="text-[0.62rem] font-extrabold uppercase text-slate-400">Done by</dt><dd className="mt-1 text-xs font-bold text-slate-700">{selectedLog.changedBy || 'System'}</dd></div>
              <div><dt className="text-[0.62rem] font-extrabold uppercase text-slate-400">Date and time</dt><dd className="mt-1 text-xs font-bold text-slate-700">{formatDate(selectedLog.changedAt)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-[0.62rem] font-extrabold uppercase text-slate-400">Reason</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{selectedLog.reason}</dd></div>
            </dl>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ValueList title="Before" values={selectedLog.oldValues} />
              <ValueList title="After" values={selectedLog.newValues} />
            </div>
          </section>
        </div>
      )}
    </>,
  )
}
