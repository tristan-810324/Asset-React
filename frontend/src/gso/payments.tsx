import { useEffect, useRef, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { CHARGE_SOURCE_LABEL, getChargeReceipt, getWaiverProof, listCharges, listWaivedCharges, markChargePaid, saveWaiverProof, type ChargeReceipt, type ChargeRow, type WaiverProof, type WaivedRow } from './paymentsApi'
import AuditLogView from '../components/audit/auditlogview'

const MAX_RECEIPT_BYTES = 1_000_000
const MAX_RECEIPT_CHARS = 1_400_000 // the same limit the server checks
const MAX_RECEIPT_EDGE_PX = 2000
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

// Opens the picked file as a picture. Large files and other picture types are saved again as a JPEG that fits the upload limit.
function prepareReceipt(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const notAPicture = new Error(`"${file.name}" can't be opened as a picture. Try a JPG or PNG photo, or a screenshot of the receipt.`)
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(notAPicture)
    }
    image.onload = () => {
      URL.revokeObjectURL(url)
      if (!image.naturalWidth || !image.naturalHeight) return reject(notAPicture)
      if (RECEIPT_TYPES.includes(file.type) && file.size <= MAX_RECEIPT_BYTES) {
        readAsDataUrl(file).then(resolve, reject)
        return
      }
      try {
        const scale = Math.min(1, MAX_RECEIPT_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('This browser cannot prepare the picture. Try another browser.'))
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        for (const quality of [0.85, 0.7, 0.55]) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality)
          if (dataUrl.length <= MAX_RECEIPT_CHARS) return resolve(dataUrl)
        }
        reject(new Error('This picture is still too large after resizing. Try a screenshot of the receipt instead.'))
      } catch {
        // Some picture types (for example an SVG that loads other files) cannot be drawn and saved; say so instead of stalling.
        reject(new Error('This picture could not be prepared. Try a JPG or PNG photo, or a screenshot of the receipt.'))
      }
    }
    image.src = url
  })
}

const PANEL_CARD = 'rounded-2xl border border-slate-200 bg-white p-5'
const FIELD_LABEL = 'mb-1.5 block text-xs font-extrabold text-slate-700'
const FIELD_INPUT = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const PANEL_CLOSE = 'shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50'
const ERROR_BOX = 'rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700'

// Today's date and time, shown as saved automatically. The server stamps the real time when the receipt is saved.
const nowText = () => new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

// The amount typed for a receipt: a positive peso amount with at most two decimals, or null while it is not valid.
const amountOf = (text: string) => {
  const value = Number(text)
  return text.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 100_000_000 && Number(value.toFixed(2)) === value ? value : null
}

// A signed waiver: a PDF is kept as it is (up to the upload limit); a picture is prepared the same way as a receipt.
function prepareProof(file: File) {
  if (file.type !== 'application/pdf') return prepareReceipt(file)
  return (async () => {
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('This PDF is larger than 1 MB. Save a smaller copy, or attach a picture of the signed waiver instead.')
    const dataUrl = await readAsDataUrl(file)
    if (!dataUrl.startsWith('data:application/pdf;base64,')) throw new Error('That PDF could not be read. Try another file.')
    return dataUrl
  })()
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 wrap-break-word text-sm font-bold text-slate-900">{value}</dd>
    </div>
  )
}

function ChargePanel({ charge, onClose, onPaid }: { charge: ChargeRow; onClose: () => void; onPaid: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')
  const [amountText, setAmountText] = useState('')
  const [receipt, setReceipt] = useState<ChargeReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const [openedAt] = useState(nowText)
  const fileInput = useRef<HTMLInputElement>(null)
  const estimate = Number(charge.amount || 0)
  const amountPaid = amountOf(amountText)

  // A paid charge shows the receipt that was uploaded for it.
  useEffect(() => {
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
    if (busy || checking) return
    setError('')
    setFileError('')
    setFile(null)
    setPreview('')
    if (!selected) return
    setChecking(true)
    try {
      setPreview(await prepareReceipt(selected))
      setFile(selected)
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : 'This picture could not be used. Try another one.')
    } finally {
      setChecking(false)
    }
  }

  const submit = async () => {
    if (!file || !preview || amountPaid === null || busy || checking) return
    setBusy(true)
    setError('')
    try {
      await markChargePaid(charge.kind, charge.ref, { receiptData: preview, receiptName: file.name, note: note.trim(), amountPaid })
      onPaid(`${charge.referenceNo} marked as Paid. The receipt and the amount are saved with your name.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to mark this charge as paid.')
    } finally {
      setBusy(false)
    }
  }

  let buttonHint = 'Enter the amount on the receipt to turn this on.'
  if (amountText.trim() !== '' && amountPaid === null) buttonHint = 'The amount must be a peso amount, like 1500.00.'
  else if (amountPaid !== null && !file) buttonHint = 'Add the receipt photo to turn this on.'
  else if (amountPaid !== null && file) buttonHint = 'Save when the receipt and the amount match.'
  if (checking) buttonHint = 'Checking the picture…'
  if (busy) buttonHint = ''

  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="charge-panel-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">{CHARGE_SOURCE_LABEL[charge.kind]}</p>
            <h2 id="charge-panel-title" className="mt-0.5 truncate text-lg font-black text-slate-900">{charge.itemName}</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{charge.referenceNo} · {charge.personName}</p>
          </div>
          <button type="button" onClick={onClose} className={PANEL_CLOSE}>Close</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-5 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <section className={PANEL_CARD}>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${charge.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{charge.paid ? 'Paid' : 'To pay'}</span>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">
                {charge.paid ? 'Paid. The receipt and the amount paid are saved on the right.' : 'Not paid yet. When the requester pays, enter the amount on the receipt and upload the receipt.'}
              </p>
              <dl className="mt-4 grid gap-3">
                <FactTile label="Requester" value={charge.personName} />
                <FactTile label="Estimated charge" value={money(charge.amount)} />
                <FactTile label="Charged on" value={dateText(charge.chargedAt)} />
                {charge.paid && <FactTile label="Amount paid" value={money(charge.amountPaid)} />}
              </dl>
            </section>

            {charge.paid ? (
              <section className={`${PANEL_CARD} space-y-4`}>
                <h3 className="text-sm font-extrabold text-slate-900">Receipt</h3>
                {receipt ? (
                  <>
                    <img src={receipt.receiptData} alt={`Receipt for ${charge.referenceNo}`} className="max-h-96 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <FactTile label="Uploaded on" value={dateText(receipt.uploadedAt)} />
                      <FactTile label="Uploaded by" value={receipt.uploadedBy || 'Not recorded'} />
                      <FactTile label="File" value={receipt.receiptName || '—'} />
                      {receipt.note && <FactTile label="Note" value={receipt.note} />}
                    </dl>
                  </>
                ) : <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">Loading the receipt…</p>}
                {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
              </section>
            ) : (
              <section className={`${PANEL_CARD} space-y-5`}>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Payment</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Enter the amount and upload the receipt. The date is filled in for you.</p>
                </div>

                <label className="block">
                  <span className={FIELD_LABEL}>Amount on the receipt <span className="text-rose-600">*</span></span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">₱</span>
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amountText} onChange={(event) => setAmountText(event.target.value)} disabled={busy} placeholder="0.00" className={`${FIELD_INPUT} pl-8`} />
                  </div>
                  <span className="mt-1.5 block text-[0.7rem] font-medium text-slate-500">Type the total written on the receipt. It can be less or more than the estimate.</span>
                  {amountText.trim() !== '' && amountPaid === null && <span role="alert" className="mt-1.5 block text-[0.7rem] font-bold text-rose-700">Enter a peso amount, like 1500.00.</span>}
                  {amountPaid !== null && estimate > 0 && Math.abs(amountPaid - estimate) > 0.005 && (
                    <span className="mt-1.5 block rounded-lg bg-amber-50 px-3 py-2 text-[0.7rem] font-semibold text-amber-900">This is different from the estimated charge of {money(estimate)}. Check it against the receipt.</span>
                  )}
                </label>

                <div>
                  <span className={FIELD_LABEL}>Date and time</span>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-800">{openedAt}</div>
                  <span className="mt-1.5 block text-[0.7rem] font-medium text-slate-500">Filled in automatically. It is saved when you click Mark as Paid.</span>
                </div>

                <div>
                  <span className={FIELD_LABEL}>Receipt photo <span className="text-rose-600">*</span></span>
                  <input ref={fileInput} type="file" accept="image/*" className="hidden" disabled={busy || checking} onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
                  {file && preview ? (
                    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
                      <div className="flex items-center justify-between gap-3 bg-emerald-50 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-emerald-900">{file.name}</p>
                          <p className="text-[0.65rem] font-semibold text-emerald-700">Ready to save</p>
                        </div>
                        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[0.7rem] font-extrabold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50">Change</button>
                      </div>
                      <img src={preview} alt="Receipt preview" className="max-h-72 w-full object-contain p-2" />
                    </div>
                  ) : (
                    <button type="button" disabled={busy || checking} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files.item(0)) }} className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait">
                      <span className="text-sm font-extrabold text-blue-800">{checking ? 'Checking the picture…' : 'Choose a receipt photo'}</span>
                      <span className="text-[0.7rem] font-semibold text-slate-600">Click here, or drop the file on this box</span>
                      <span className="text-[0.65rem] text-slate-500">JPG, PNG, or WebP. Big phone photos are resized for you.</span>
                    </button>
                  )}
                  {fileError && <p role="alert" className={`mt-2 ${ERROR_BOX}`}>{fileError}</p>}
                </div>

                <label className="block">
                  <span className={FIELD_LABEL}>Note (optional)</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={busy} placeholder="e.g. Paid at the cashier, OR No. 12345" className={FIELD_INPUT} />
                </label>

                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7rem] font-semibold leading-relaxed text-amber-900">
                  Only upload the receipt you actually received. Your name and the time are saved with it.
                </p>
              </section>
            )}
          </div>
        </div>

        {!charge.paid && (
          <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
            {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
            <button type="button" disabled={busy || checking || !file || !preview || amountPaid === null} onClick={() => { void submit() }} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Saving…' : 'Mark as Paid'}
            </button>
            <p className="text-center text-[0.7rem] font-semibold text-slate-500">{buttonHint}</p>
          </footer>
        )}
      </div>
    </div>
  )
}

// A charge waived instead of paid: no payment, so the proof is the signed waiver (a PDF or a picture) attached to the item.
function WaiverPanel({ waiver, onClose, onSaved }: { waiver: WaivedRow; onClose: () => void; onSaved: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<WaiverProof | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  // An item that already has its proof shows the file that was attached.
  useEffect(() => {
    if (!waiver.hasProof) return
    let active = true
    getWaiverProof(waiver.kind, waiver.ref)
      .then((result) => { if (active) setProof(result) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'The proof could not be loaded.') })
    return () => { active = false }
  }, [waiver.kind, waiver.ref, waiver.hasProof])

  // Escape closes the pop-up, as it does on the other GSO dialogs.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const chooseFile = async (selected: File | null) => {
    if (busy || checking) return
    setError('')
    setFileError('')
    setFile(null)
    setPreview('')
    if (!selected) return
    setChecking(true)
    try {
      setPreview(await prepareProof(selected))
      setFile(selected)
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : 'This file could not be used. Try another one.')
    } finally {
      setChecking(false)
    }
  }

  const submit = async () => {
    if (!file || !preview || busy || checking) return
    setBusy(true)
    setError('')
    try {
      await saveWaiverProof(waiver.kind, waiver.ref, { proofData: preview, proofName: file.name, note: note.trim() })
      onSaved(`Proof saved for ${waiver.referenceNo}. The signed waiver is on file with your name.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the proof.')
    } finally {
      setBusy(false)
    }
  }

  let buttonHint = 'Attach the signed waiver to turn this on.'
  if (file) buttonHint = 'Save when the file is the signed waiver.'
  if (checking) buttonHint = 'Checking the file…'
  if (busy) buttonHint = ''

  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="charge-panel-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-blue-600">{CHARGE_SOURCE_LABEL[waiver.kind]} · Waived</p>
            <h2 id="charge-panel-title" className="mt-0.5 truncate text-lg font-black text-slate-900">{waiver.itemName}</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{waiver.referenceNo} · {waiver.personName}</p>
          </div>
          <button type="button" onClick={onClose} className={PANEL_CLOSE}>Close</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-5 sm:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <section className={PANEL_CARD}>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700">Waived</span>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-700">
                {proof ? 'The signed waiver is on file. It is saved on the right.' : waiver.hasProof ? 'Loading the proof…' : 'No payment is needed. Attach the signed waiver form, or a photo of it, as proof.'}
              </p>
              <dl className="mt-4 grid gap-3">
                <FactTile label="Requester" value={waiver.personName} />
                <FactTile label="Estimated value" value={money(waiver.amount)} />
                <FactTile label="Waived on" value={dateText(waiver.decidedAt)} />
              </dl>
            </section>

            <section className={`${PANEL_CARD} space-y-5`}>
              {proof && (
                <div className="space-y-4">
                  <h3 className="text-sm font-extrabold text-slate-900">Attached proof</h3>
                  {proof.proofMime.startsWith('image/') ? (
                    <img src={proof.proofData} alt="Waiver proof" className="max-h-96 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{proof.proofName || 'Signed waiver.pdf'}</p>
                        <p className="text-xs font-semibold text-slate-500">PDF file</p>
                      </div>
                      <a href={proof.proofData} download={proof.proofName || 'signed-waiver.pdf'} className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700">Open file</a>
                    </div>
                  )}
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <FactTile label="Uploaded on" value={dateText(proof.uploadedAt)} />
                    <FactTile label="Uploaded by" value={proof.uploadedBy || 'Not recorded'} />
                    {proof.note && <FactTile label="Note" value={proof.note} />}
                  </dl>
                </div>
              )}

              <div>
                <h3 className="text-sm font-extrabold text-slate-900">{proof ? 'Replace the proof' : 'Attach the signed waiver'}</h3>
                <p className="mt-0.5 text-xs text-slate-500">A PDF, or a JPG, PNG, or WebP picture. Up to 1 MB.</p>
              </div>

              <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" disabled={busy || checking} onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
              {file && preview ? (
                <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
                  <div className="flex items-center justify-between gap-3 bg-emerald-50 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-emerald-900">{file.name}</p>
                      <p className="text-[0.65rem] font-semibold text-emerald-700">Ready to save</p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[0.7rem] font-extrabold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50">Change</button>
                  </div>
                  {file.type.startsWith('image/') || preview.startsWith('data:image/') ? (
                    <img src={preview} alt="Waiver preview" className="max-h-72 w-full object-contain p-2" />
                  ) : (
                    <p className="px-4 py-6 text-center text-xs font-semibold text-slate-600">PDF ready. It is saved as it is.</p>
                  )}
                </div>
              ) : (
                <button type="button" disabled={busy || checking} onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files.item(0)) }} className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-wait">
                  <span className="text-sm font-extrabold text-blue-800">{checking ? 'Checking the file…' : 'Choose a file or picture'}</span>
                  <span className="text-[0.7rem] font-semibold text-slate-600">Click here, or drop the file on this box</span>
                  <span className="text-[0.65rem] text-slate-500">PDF, JPG, PNG, or WebP. Up to 1 MB.</span>
                </button>
              )}
              {fileError && <p role="alert" className={ERROR_BOX}>{fileError}</p>}

              <label className="block">
                <span className={FIELD_LABEL}>Note (optional)</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={busy} placeholder="e.g. Signed by the department head" className={FIELD_INPUT} />
              </label>

              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.7rem] font-semibold leading-relaxed text-amber-900">
                Attach only the signed waiver. Your name and the time are saved with it.
              </p>
              {error && <p role="alert" className={ERROR_BOX}>{error}</p>}
            </section>
          </div>
        </div>

        <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
          <button type="button" disabled={busy || checking || !file || !preview} onClick={() => { void submit() }} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Saving…' : proof ? 'Replace proof' : 'Save proof'}
          </button>
          <p className="text-center text-[0.7rem] font-semibold text-slate-500">{buttonHint}</p>
        </footer>
      </div>
    </div>
  )
}

type PaymentFilter = 'To pay' | 'Paid' | 'Waived' | 'All'
type SelectedRow = { type: 'charge'; charge: ChargeRow } | { type: 'waiver'; waiver: WaivedRow }
type ListEntry = { status: PaymentFilter; text: string; row: SelectedRow }

export default function GsoPayments() {
  const [charges, setCharges] = useState<ChargeRow[]>([])
  const [waivers, setWaivers] = useState<WaivedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<PaymentFilter>('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SelectedRow | null>(null)
  // Bumped after a payment or waiver proof is saved, so the audit trail shows the new entry.
  const [auditVersion, setAuditVersion] = useState(0)

  const load = () => {
    Promise.all([listCharges(), listWaivedCharges()])
      .then(([chargeRows, waiverRows]) => { setCharges(chargeRows); setWaivers(waiverRows); setError('') })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The charges could not be loaded.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toPay = charges.filter((charge) => !charge.paid)
  const totalToPay = toPay.reduce((sum, charge) => sum + Number(charge.amount || 0), 0)
  const paidCount = charges.length - toPay.length

  // Charged items and waived items in one list, each with its own status.
  const query = search.trim().toLowerCase()
  const entries: ListEntry[] = [
    ...charges.map((charge): ListEntry => ({ status: charge.status, text: `${charge.referenceNo} ${charge.itemName} ${charge.personName}`, row: { type: 'charge', charge } })),
    // Waived items drop out of this table once GSO attaches the signed proof. The audit trail keeps the record.
    ...waivers.filter((waiver) => !waiver.hasProof).map((waiver): ListEntry => ({ status: 'Waived', text: `${waiver.referenceNo} ${waiver.itemName} ${waiver.personName}`, row: { type: 'waiver', waiver } })),
  ]
  const visible = entries.filter((entry) => (filter === 'All' || entry.status === filter) && (!query || entry.text.toLowerCase().includes(query)))

  return (
    <GsoPageFrame activePage="Proof of Settlements" searchPlaceholder="Search requester, item, or reference...">
      <section className="isolate relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7"><div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Proof of settlements
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Proof of Settlements</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Charged items waiting for payment, and waived items waiting for their signed waiver.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">To pay</p><p className="mt-1 text-xl font-black">{toPay.length}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">Estimated to collect</p><p className="mt-1 text-xl font-black">{money(totalToPay)}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">Paid</p><p className="mt-1 text-xl font-black">{paidCount}</p></div>
          <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-blue-100">Waived</p><p className="mt-1 text-xl font-black">{waivers.length}</p></div>
        </div>
      </section>

      {message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>}

      <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['All', 'Waived', 'Paid', 'To pay'] as const).map((option) => (
              <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)} className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${filter === option ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {option}
              </button>
            ))}
          </div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requester, item, or reference…" className="h-10 w-full rounded-xl border border-slate-300 px-3 text-xs font-medium outline-none focus:border-blue-500 sm:w-72" />
        </div>
        {loading ? (
          <p className="px-5 py-10 text-center text-xs font-semibold text-slate-500">Loading charges…</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs font-semibold text-slate-500">No items to show.</p>
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
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row }) => row.type === 'charge' ? (
                  <tr key={`charge-${row.charge.kind}-${row.charge.ref}`} onClick={() => setSelected(row)} className="cursor-pointer border-t border-slate-100 text-slate-700 transition hover:bg-blue-50/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{row.charge.personName}</td>
                    <td className="max-w-xs truncate px-5 py-3.5">{row.charge.itemName}</td>
                    <td className="px-5 py-3.5">{CHARGE_SOURCE_LABEL[row.charge.kind]}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{row.charge.referenceNo}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-black text-slate-900">
                      {money(row.charge.amount)}
                      {row.charge.paid && <span className="mt-0.5 block text-[0.6rem] font-semibold text-emerald-700">Paid {money(row.charge.amountPaid)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">{dateText(row.charge.chargedAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${row.charge.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{row.charge.status}</span>
                      {row.charge.paid && <span className="mt-1 block text-[0.6rem] font-semibold text-slate-500">by {row.charge.uploadedBy || 'GSO Staff'}</span>}
                    </td>
                  </tr>
                ) : (
                  <tr key={`waiver-${row.waiver.kind}-${row.waiver.ref}`} onClick={() => setSelected(row)} className="cursor-pointer border-t border-slate-100 text-slate-700 transition hover:bg-blue-50/50">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{row.waiver.personName}</td>
                    <td className="max-w-xs truncate px-5 py-3.5">{row.waiver.itemName}</td>
                    <td className="px-5 py-3.5">{CHARGE_SOURCE_LABEL[row.waiver.kind]}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">{row.waiver.referenceNo}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-black text-slate-900">{money(row.waiver.amount)}</td>
                    <td className="whitespace-nowrap px-5 py-3.5">{dateText(row.waiver.decidedAt)}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[0.62rem] font-extrabold text-slate-700">Waived</span>
                      <span className={`mt-1 block text-[0.6rem] font-semibold ${row.waiver.hasProof ? 'text-slate-500' : 'text-amber-700'}`}>{row.waiver.hasProof ? `Proof by ${row.waiver.proofUploadedBy || 'GSO Staff'}` : 'Proof needed'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="payment-audit-title">
        <h2 id="payment-audit-title" className="mb-3 text-sm font-black text-slate-900">Payment and waiver audit trail</h2>
        <AuditLogView key={auditVersion} frame={(content) => <>{content}</>} variant="activity" module="payments" intro="Read-only record of payments and waived items." />
      </section>

      {selected?.type === 'charge' && (
        <ChargePanel
          key={`${selected.charge.kind}-${selected.charge.ref}`}
          charge={selected.charge}
          onClose={() => setSelected(null)}
          onPaid={(text) => { setSelected(null); setMessage(text); setLoading(true); setAuditVersion((version) => version + 1); load() }}
        />
      )}
      {selected?.type === 'waiver' && (
        <WaiverPanel
          key={`${selected.waiver.kind}-${selected.waiver.ref}`}
          waiver={selected.waiver}
          onClose={() => setSelected(null)}
          onSaved={(text) => { setSelected(null); setMessage(text); setLoading(true); setAuditVersion((version) => version + 1); load() }}
        />
      )}
    </GsoPageFrame>
  )
}
