import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import type { ServiceRequest } from '../requesters/requesterApi'
import { formatDate } from '../requesters/requesterrequestutils'
import { getFinancePdf, handPurchaseRequisitionToFinance, listItemsToBuy, listStaffPurchaseRequisitions, logFinancePdfReprint, type ItemToBuy } from './purchaseRequisitionsApi'
import { categoryLabel } from './requisitionFlow'
import { EmptyState, TabBar } from './requisitionParts'

const HANDOFF_STATUSES = ['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance']
const REPRINT_REASONS = ['Original copy lost or misplaced', 'Copy damaged, torn, or unreadable', 'Printer or paper error', 'Finance requested another copy', 'Other']
const OTHER_REASON = 'Other'
const PURPOSE_MIN = 5
const PURPOSE_MAX = 300

type QueueTab = 'toPrint' | 'handed'
type SignedPdf = { pdf: string; filename: string }
type ReprintInput = { reason: string; details: string }
type HandedOff = (updated: ServiceRequest, requesterNotified: boolean | null) => void

const queueHint: Record<QueueTab, string> = {
  toPrint: 'Download a signed PDF to hand it to Finance. Downloading marks the requisition as handed.',
  handed: 'These copies already went to Finance. Reprinting asks for a reason, and every reprint is recorded in the audit logs.',
}

const emptyCopy: Record<QueueTab, { title: string; detail: string }> = {
  toPrint: { title: 'Nothing waiting to print', detail: 'Approved requisitions with shortages appear here after the GSO Head approves them.' },
  handed: { title: 'No copies handed to Finance yet', detail: 'A requisition moves here once its signed PDF has been downloaded.' },
}

const iconPaths = {
  view: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  printer: <><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>,
}

function Icon({ name, className = 'h-3.5 w-3.5' }: { name: keyof typeof iconPaths; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>
}

function pdfUrl(base64: string) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let index = 0; index < binaryString.length; index += 1) bytes[index] = binaryString.charCodeAt(index)
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

function openPdf({ pdf }: SignedPdf) {
  window.open(pdfUrl(pdf), '_blank', 'noopener,noreferrer')
}

function saveSignedPdf({ pdf, filename }: SignedPdf) {
  const url = pdfUrl(pdf)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

// Opens Item Master Data with the category and item name filled in from the requisitions.
function addToInventoryHref(item: ItemToBuy) {
  const params = new URLSearchParams({
    from: 'procurement',
    category: item.category,
    itemName: item.itemName,
    quantity: String(item.totalQuantity),
    requisitions: item.requests.map((request) => request.referenceNo).join(','),
  })
  return `/gso/items?${params.toString()}`
}

function FinanceLines({ request }: { request: ServiceRequest }) {
  const lines = (request.purchaseLines || []).filter((line) => Number(line.financeQuantity) > 0)
  return <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/70">
    {lines.map((line) => <li key={line.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-slate-900">{line.itemName}</p>
        <p className="text-[0.62rem] text-slate-500">{line.category}</p>
      </div>
      <p className="shrink-0 text-sm font-black text-slate-900">{line.financeQuantity} <span className="text-xs font-bold text-slate-500">to buy</span></p>
    </li>)}
  </ul>
}

function QueueCard({ request, onHandedOff, onReprint }: { request: ServiceRequest; onHandedOff: HandedOff; onReprint: (request: ServiceRequest) => void }) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)
  const [error, setError] = useState('')
  const handed = request.status === 'Sent to Finance'
  const approvedOn = request.gsoHeadEndorsedAt ? formatDate(request.gsoHeadEndorsedAt) : '—'
  const handedOn = request.financeSentAt ? formatDate(request.financeSentAt) : null

  async function view() {
    setBusy('view')
    setError('')
    try {
      openPdf(await getFinancePdf(request.id))
    } catch (reason) {
      setError(messageOf(reason, 'Could not open the signed PDF.'))
    } finally {
      setBusy(null)
    }
  }

  async function downloadFirstCopy() {
    setBusy('download')
    setError('')
    try {
      // The PDF is built before the handoff is recorded, so a failed build does not mark the requisition.
      const signed = await getFinancePdf(request.id)
      const result = await handPurchaseRequisitionToFinance(request.id)
      onHandedOff(result.request, result.requesterNotified)
      saveSignedPdf(signed)
    } catch (reason) {
      setError(messageOf(reason, 'Could not download the signed PDF.'))
    } finally {
      setBusy(null)
    }
  }

  return <article className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Requisition</p>
        <h3 className="mt-1 text-sm font-black text-slate-900">{request.referenceNo}</h3>
        <p className="mt-1 text-xs text-slate-600">{request.requesterName || '—'} · {request.formData.departmentOrganization || '—'}</p>
      </div>
      {handed
        ? <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[0.6rem] font-extrabold text-emerald-700">Handed to Finance</span>
        : <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[0.6rem] font-extrabold text-indigo-700">Not yet printed</span>}
    </div>

    <FinanceLines request={request} />

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <div>
        <p className="text-[0.68rem] font-semibold text-slate-500">GSO Head approved {approvedOn}{handedOn && <> · Handed {handedOn}</>}</p>
        <p className="mt-0.5 text-[0.62rem] text-slate-400">{handed ? 'Reprinting asks for a reason and is recorded in the audit logs.' : 'Downloading marks this as handed to Finance.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void view()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"><Icon name="view" />{busy === 'view' ? 'Opening…' : 'View PDF'}</button>
        {handed
          ? <button type="button" onClick={() => onReprint(request)} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"><Icon name="printer" />Reprint</button>
          : <button type="button" onClick={() => void downloadFirstCopy()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50"><Icon name="download" />{busy === 'download' ? 'Preparing…' : 'Download'}</button>}
      </div>
    </div>
    {error && <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">{error}</p>}
  </article>
}

function ReprintDialog({ request, onClose, onConfirm }: { request: ServiceRequest; onClose: () => void; onConfirm: (input: ReprintInput) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isOther = reason === OTHER_REASON
  const purpose = details.trim()
  const ready = reason !== '' && (!isOther || purpose.length >= PURPOSE_MIN)
  const purposeTooShort = isOther && purpose.length > 0 && purpose.length < PURPOSE_MIN

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      await onConfirm({ reason, details: isOther ? purpose : '' })
    } catch (reasonError) {
      setError(messageOf(reasonError, 'Could not log the reprint. The PDF was not downloaded.'))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="reprint-title" aria-describedby="reprint-note" className="w-full max-w-lg overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-2xl">
        <form onSubmit={(event) => void submit(event)}>
          <header className="flex items-start gap-3.5 border-b border-slate-200 p-5 sm:p-6">
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><Icon name="printer" className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 id="reprint-title" className="text-base font-black text-slate-900">Reprint signed PDF</h2>
              <p className="mt-1 text-xs text-slate-600">{request.referenceNo} · {request.requesterName || 'Requester'}</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-extrabold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">×</button>
          </header>

          <div className="space-y-5 p-5 sm:p-6">
            <p id="reprint-note" className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
              This copy was already handed to Finance. The reprint is recorded in the audit logs with your reason, and the GSO Head sees it as a warning.
            </p>

            <div>
              <label htmlFor="reprint-reason" className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Reason for reprinting</label>
              <select id="reprint-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError('') }} autoFocus className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                <option value="" disabled>Choose a reason</option>
                {REPRINT_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            {isOther && <div>
              <label htmlFor="reprint-purpose" className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Specify the purpose</label>
              <textarea id="reprint-purpose" value={details} maxLength={PURPOSE_MAX} onChange={(event) => { setDetails(event.target.value); setError('') }} rows={3} placeholder="Describe the real reason for this reprint" className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[0.62rem]">
                <span className={purposeTooShort ? 'font-semibold text-rose-600' : 'text-slate-500'}>{purposeTooShort ? `Write at least ${PURPOSE_MIN} characters.` : 'Be specific, so the audit trail makes sense later.'}</span>
                <span className="font-bold text-slate-400">{details.length}/{PURPOSE_MAX}</span>
              </div>
            </div>}

            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{error}</p>}
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={!ready || busy} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50">{busy ? 'Logging…' : 'Reprint and log'}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}

export default function GsoProcurement() {
  const [items, setItems] = useState<ItemToBuy[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [search, setSearch] = useState('')
  const [chosenTab, setChosenTab] = useState<QueueTab>('toPrint')
  const [reprintTarget, setReprintTarget] = useState<ServiceRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [itemRows, requestRows] = await Promise.all([listItemsToBuy(), listStaffPurchaseRequisitions()])
      setItems(itemRows)
      setRequests(requestRows.filter((request) => HANDOFF_STATUSES.includes(request.status)))
      setError('')
    } catch (reason) {
      setError(messageOf(reason, 'Could not load procurement data.'))
    } finally {
      setLoading(false)
    }
  }, [])

  // The loader is started on mount and updates state when its requests settle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData() }, [loadData])

  const handleHandedOff: HandedOff = (updated, requesterNotified) => {
    setNotice(`${updated.referenceNo} was handed to Finance.${requesterNotified ? ' The requester was notified.' : ''}`)
    void loadData()
  }

  async function confirmReprint(input: ReprintInput) {
    if (!reprintTarget) return
    // Logged before the file is saved, so a reprint without a record is never downloaded.
    const signed = await getFinancePdf(reprintTarget.id)
    await logFinancePdfReprint(reprintTarget.id, input)
    saveSignedPdf(signed)
    setNotice(`${reprintTarget.referenceNo} was reprinted. The reason is recorded in the audit logs.`)
    setReprintTarget(null)
  }

  const term = search.trim().toLocaleLowerCase()
  const matchesSearch = (request: ServiceRequest) => !term || [request.referenceNo, request.requesterName, ...(request.purchaseLines || []).map((line) => line.itemName)]
    .some((value) => (value ?? '').toLocaleLowerCase().includes(term))
  const newestFirst = [...requests].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  const queues: Record<QueueTab, ServiceRequest[]> = {
    toPrint: newestFirst.filter((request) => request.status !== 'Sent to Finance' && matchesSearch(request)),
    handed: newestFirst.filter((request) => request.status === 'Sent to Finance' && matchesSearch(request)),
  }
  const visibleRequests = queues[chosenTab]
  const visibleItems = items.filter((item) => !term || [
    item.itemName,
    item.category,
    item.specifications,
    ...item.requests.flatMap((request) => [request.referenceNo, request.requesterName, request.department]),
  ].some((value) => value.toLocaleLowerCase().includes(term)))
  const unitsToBuy = items.reduce((total, item) => total + Number(item.totalQuantity || 0), 0)
  const initialLoading = loading && items.length === 0 && requests.length === 0

  return <GsoPageFrame activePage="Procurement" searchPlaceholder="Search procurement">
    <div className="mx-auto max-w-7xl">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-blue-200" /> Finance purchasing</span>
          <h1 className="mt-3 text-xl font-black tracking-tight sm:mt-4 sm:text-3xl">Procurement</h1>
          <p className="mt-1.5 max-w-2xl text-xs font-medium leading-relaxed text-blue-100 sm:mt-2 sm:text-sm">Hand each signed PDF to Finance, then track what still needs to be bought.</p>
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="procurement-search">Search requisitions and items</label>
        <input id="procurement-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requisition, requester, or item" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
        <button type="button" onClick={() => void loadData()} disabled={loading} className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60">{loading ? 'Refreshing…' : 'Refresh list'}</button>
      </div>

      {notice && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{notice}</p>}
      {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
      {initialLoading && <div role="status" className="mt-5 grid min-h-48 place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-400">Loading procurement…</div>}

      {!error && !initialLoading && <section aria-labelledby="procurement-queue" className="mt-5 rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id="procurement-queue" className="text-sm font-black text-slate-900">Procurement queue</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">{queueHint[chosenTab]}</p>
          </div>
          <TabBar
            label="Procurement queue"
            tabs={[
              { key: 'toPrint', label: 'To print', count: queues.toPrint.length, needsAction: queues.toPrint.length > 0 },
              { key: 'handed', label: 'Handed to Finance', count: queues.handed.length, needsAction: false },
            ]}
            active={chosenTab}
            onChange={setChosenTab}
          />
        </div>

        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-indigo-700">Combined items to buy</p>
            <p className="text-[0.62rem] font-bold text-indigo-700">{unitsToBuy} unit{unitsToBuy === 1 ? '' : 's'} in total</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">Select an item to add it to Item Master Data. Its category and name are filled in for you.</p>
          {visibleItems.length === 0
            ? <p className="mt-3 text-xs font-semibold text-slate-500">{term ? 'No matching items.' : 'Items with a remaining shortage appear here after the GSO Head approves a requisition.'}</p>
            : <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => <a key={`${item.category}-${item.itemName}-${item.specifications}`} href={addToInventoryHref(item)} aria-label={`Add ${item.itemName} to Item Master Data`} className="group rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm shadow-indigo-100/60 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-900">{item.itemName}</p>
                    <p className="text-[0.62rem] text-slate-500">{categoryLabel(item.category)}</p>
                  </div>
                  <p className="shrink-0 text-lg font-black text-indigo-900">{item.totalQuantity}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.62rem] font-bold text-indigo-700">across {item.requestCount} request{item.requestCount === 1 ? '' : 's'}</p>
                  <span className="text-[0.62rem] font-extrabold text-blue-700 transition group-hover:text-blue-900">Add to Item Master Data →</span>
                </div>
              </a>)}
            </div>}
        </div>

        <div className="mt-5">
          {visibleRequests.length === 0
            ? <EmptyState title={term ? 'No matching requisitions' : emptyCopy[chosenTab].title} detail={term ? 'Try another requisition reference, requester, or item.' : emptyCopy[chosenTab].detail} />
            : <div className="space-y-4">{visibleRequests.map((request) => <QueueCard key={request.id} request={request} onHandedOff={handleHandedOff} onReprint={(target) => setReprintTarget(target)} />)}</div>}
        </div>
      </section>}
    </div>

    {reprintTarget && <ReprintDialog request={reprintTarget} onClose={() => setReprintTarget(null)} onConfirm={confirmReprint} />}
  </GsoPageFrame>
}
