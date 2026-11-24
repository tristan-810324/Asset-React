import { useEffect, useMemo, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { CHARGE_SOURCE_LABEL, getChargeReceipt, listCharges, markChargePaid, type ChargeReceipt, type ChargeRow } from './paymentsApi'

const MAX_RECEIPT_BYTES = 1_000_000
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const money = (value: string | number | null) => {
  const amount = Number(value)
  return amount > 0 ? amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) : '—'
}
const dateText = (value: string | null) => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('The receipt could not be read.'))
  reader.readAsDataURL(file)
})

function ChargePanel({ charge, onClose, onPaid }: { charge: ChargeRow; onClose: () => void; onPaid: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<ChargeReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // A paid charge shows the receipt that was uploaded for it.
  useEffect(() => {
    setReceipt(null)
    if (!charge.paid) return
    let active = true
    getChargeReceipt(charge.kind, charge.ref)
      .then((result) => { if (active) setReceipt(result) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'The receipt could not be loaded.') })
    return () => { active = false }
  }, [charge.kind, charge.ref, charge.paid])

  // Escape closes the pop-up, as it does on the other GSO dialogs.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const chooseFile = async (selected: File | null) => {
    setError('')
    setFile(null)
    setPreview('')
    if (!selected) return
    if (!RECEIPT_TYPES.includes(selected.type)) { setError('Upload a JPG, PNG, or WebP image of the receipt.'); return }
    if (selected.size > MAX_RECEIPT_BYTES) { setError('The receipt image must be 1 MB or smaller.'); return }
    setFile(selected)
    setPreview(await readAsDataUrl(selected))
  }

  const submit = async () => {
    if (!file || !preview) return
    setBusy(true)
    setError('')
    try {
      await markChargePaid(charge.kind, charge.ref, { receiptData: preview, receiptName: file.name, note: note.trim() })
      onPaid(`${charge.referenceNo} marked as Paid. The receipt is saved with your name.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to mark this charge as paid.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="charge-panel-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-700">{CHARGE_SOURCE_LABEL[charge.kind]}</p>
            <h2 id="charge-panel-title" className="mt-0.5 truncate text-base font-black text-slate-900">{charge.itemName}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{charge.referenceNo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Close</button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Requester</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{charge.personName}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Amount</p>
              <p className="mt-1 text-sm font-black text-slate-900">{money(charge.amount)}</p>
            </div>
            <div className="col-span-2 rounded-xl bg-slate-50 p-3">
              <p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Charged on</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{dateText(charge.chargedAt)}</p>
            </div>
          </div>

          <div className={`rounded-xl px-4 py-3 text-sm font-extrabold ${charge.paid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
            {charge.paid ? 'Paid' : 'To pay'}
          </div>

          {charge.paid ? (
            <section className="space-y-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Receipt</p>
              {receipt ? (
                <>
                  <img src={receipt.receiptData} alt={`Receipt for ${charge.referenceNo}`} className="w-full rounded-xl border border-slate-200 bg-white object-contain" />
                  <div className="rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-700">
                    <p><span className="font-extrabold">File:</span> {receipt.receiptName || '—'}</p>
                    <p><span className="font-extrabold">Uploaded by:</span> {receipt.uploadedBy || 'Not recorded'}</p>
                    <p><span className="font-extrabold">Uploaded on:</span> {dateText(receipt.uploadedAt)}</p>
                    {receipt.note && <p><span className="font-extrabold">Note:</span> {receipt.note}</p>}
                  </div>
                </>
              ) : <p className="text-xs text-slate-500">Loading the receipt…</p>}
            </section>
          ) : (
            <section className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Receipt image <span className="text-rose-600">*</span></span>
                <input type="file" accept={RECEIPT_TYPES.join(',')} disabled={busy} onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null) }} className="block w-full text-xs font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-extrabold file:text-blue-700" />
                <span className="mt-1 block text-[0.65rem] text-slate-500">JPG, PNG, or WebP, 1 MB or smaller.</span>
              </label>
              {preview && <img src={preview} alt="Receipt preview" className="w-full rounded-xl border border-slate-200 bg-white object-contain" />}
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Note (optional)</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={busy} placeholder="e.g. Paid at the cashier, OR No. 12345" className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-medium outline-none focus:border-blue-500" />
              </label>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.65rem] font-semibold leading-relaxed text-amber-900">
                Your name and the time are saved with this receipt. Only upload the receipt you actually received.
              </p>
            </section>
          )}

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
        </div>

        {!charge.paid && (
          <footer className="shrink-0 border-t border-slate-200 px-5 py-4">
            <button type="button" disabled={busy || !file} onClick={() => { void submit() }} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Saving…' : 'Mark as Paid'}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

export default function GsoPayments() {
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<'To pay' | 'Paid' | 'All'>('To pay')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ChargeRow | null>(null)

  const load = () => {
    setLoading(true)
    listCharges()
      .then((rows) => { setCharges(rows); setError('') })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The charges could not be loaded.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toPay = charges.filter((charge) => !charge.paid)
  const totalToPay = toPay.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return charges.filter((charge) => (filter === 'All' || charge.status === filter)
      && (!query || `${charge.referenceNo} ${charge.itemName} ${charge.personName}`.toLowerCase().includes(query)))
  }, [charges, filter, search])

  return (
    <GsoPageFrame activePage="Payments to Collect" searchPlaceholder="Search requester, item, or reference...">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Payments to collect
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Payments to collect</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Charged items waiting for payment. Upload the receipt, then mark the charge as Paid.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">To pay</p><p className="mt-1 text-xl font-black">{toPay.length}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">Amount to collect</p><p className="mt-1 text-xl font-black">{money(totalToPay)}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">Paid</p><p className="mt-1 text-xl font-black">{charges.length - toPay.length}</p></div>
        </div>
      </section>

      {message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>}

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['To pay', 'Paid', 'All'] as const).map((option) => (
              <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${filter === option ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{option}</button>
            ))}
          </div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requester, item, or reference…" className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-medium outline-none focus:border-blue-500 sm:w-72" />
        </div>
        {loading ? (
          <p className="px-5 py-10 text-center text-xs font-semibold text-slate-500">Loading charges…</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs font-semibold text-slate-500">No charges to show.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-left text-xs">
              <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Requester</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Charged on</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((charge) => (
                  <tr key={`${charge.kind}-${charge.ref}`} onClick={() => setSelected(charge)} className="cursor-pointer border-t border-slate-100 text-slate-700 transition hover:bg-blue-50/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{charge.personName}</td>
                    <td className="max-w-xs truncate px-5 py-3.5">{charge.itemName}</td>
                    <td className="px-5 py-3.5">{CHARGE_SOURCE_LABEL[charge.kind]}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{charge.referenceNo}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-black text-slate-900">{money(charge.amount)}</td>
                    <td className="whitespace-nowrap px-5 py-3.5">{dateText(charge.chargedAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${charge.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{charge.status}</span>
                      {charge.paid && <span className="mt-1 block text-[0.6rem] font-semibold text-slate-500">by {charge.uploadedBy || 'GSO Staff'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <ChargePanel
          charge={selected}
          onClose={() => setSelected(null)}
          onPaid={(text) => { setSelected(null); setMessage(text); load() }}
        />
      )}
    </GsoPageFrame>
  )
}
