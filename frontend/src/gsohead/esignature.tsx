import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { GsoHeadPageFrame } from './gsoheadnavbar'
import { getMySignature, saveMySignature, type HeadSignature } from './signatureApi'
import { cleanSignatureImage, SIGNATURE_IMAGE_TYPES, type CleanedSignature } from './signatureImage'

const checkerboard: CSSProperties = {
  backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
}

function savedDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

// The GSO Head's signature stays in use until it is replaced; the upload only opens when asked for.
export default function GsoHeadESignature() {
  const [signature, setSignature] = useState<HeadSignature | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [pending, setPending] = useState<CleanedSignature | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // Each pick gets a number, so a result that arrives late for an older file is ignored.
  const latestPick = useRef(0)
  const showUpload = !signature || replacing

  useEffect(() => {
    let active = true
    getMySignature()
      .then((current) => { if (active) setSignature(current) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [])

  function resetUpload() {
    latestPick.current += 1
    setPending(null)
    setShowOriginal(false)
    setCleaning(false)
    setReplacing(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function chooseFile(file: File | undefined) {
    const pick = latestPick.current + 1
    latestPick.current = pick
    const isCurrent = () => latestPick.current === pick
    setMessage(null)
    setPending(null)
    setShowOriginal(false)
    if (!file) return
    setCleaning(true)
    try {
      const cleaned = await cleanSignatureImage(file)
      if (!isCurrent()) return
      setPending(cleaned)
      setMessage({ tone: 'success', text: 'The background was removed. Check the preview, then save.' })
    } catch (reason) {
      if (!isCurrent()) return
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'Unable to read this image.' })
    } finally {
      if (isCurrent()) setCleaning(false)
    }
  }

  async function save() {
    if (!pending) return
    const replacingExisting = Boolean(signature)
    setBusy(true)
    setMessage(null)
    try {
      const saved = await saveMySignature(pending.dataUrl)
      setSignature(saved)
      resetUpload()
      setMessage({ tone: 'success', text: replacingExisting ? 'Signature replaced. New PDFs will use it.' : 'Signature saved. It will be used on requisition PDFs.' })
    } catch (reason) {
      setMessage({ tone: 'error', text: reason instanceof Error ? reason.message : 'Unable to save the signature.' })
    } finally {
      setBusy(false)
    }
  }

  function cancelReplace() {
    resetUpload()
    setMessage(null)
  }

  return (
    <GsoHeadPageFrame activePage="esignature">
      <div className="mx-auto max-w-3xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">GSO Head workspace</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">E-Signature</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-blue-100">Upload your signature once. It is placed on the purchase requisitions GSO Staff print for Finance. Replace it only when it changes.</p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="esignature-title">
          {!loaded ? (
            <div className="grid min-h-48 place-items-center p-6 text-xs font-semibold text-slate-400">Loading your signature…</div>
          ) : !showUpload && signature ? (
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="esignature-title" className="text-sm font-black text-slate-900">Current signature</h2>
                  <p className="mt-1 text-xs text-slate-500">Saved {savedDate(signature.updatedAt)}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[0.6rem] font-extrabold text-emerald-700">In use</span>
              </div>
              <div className="mt-4 grid h-48 place-items-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                <img src={signature.imageDataUrl} alt="Your saved signature" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="max-w-md text-[0.68rem] leading-relaxed text-slate-500">Added automatically to the requisition PDFs GSO Staff print for Finance. You do not need to upload it again.</p>
                <button type="button" onClick={() => { setReplacing(true); setMessage(null) }} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50">Replace signature</button>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <h2 id="esignature-title" className="text-sm font-black text-slate-900">{signature ? 'Replace signature' : 'Upload your signature'}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{signature ? 'Your current signature stays in use until you save the new one. Copies already printed do not change.' : 'Once saved, it is used automatically on the requisition PDFs.'}</p>

              <div className={`mt-5 grid gap-5 ${signature ? 'sm:grid-cols-2' : ''}`}>
                {signature && (
                  <div>
                    <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Current</p>
                    <div className="mt-2 grid h-40 place-items-center rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <img src={signature.imageDataUrl} alt="Current signature" className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">{signature ? 'New' : 'Signature image'}</p>
                    {pending && (
                      <div role="group" aria-label="Preview" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)} className={`rounded-md px-2 py-1 text-[0.6rem] font-extrabold transition ${!showOriginal ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>Cleaned</button>
                        <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)} className={`rounded-md px-2 py-1 text-[0.6rem] font-extrabold transition ${showOriginal ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}>Original</button>
                      </div>
                    )}
                  </div>
                  <label
                    className={`mt-2 grid h-40 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed p-3 text-center transition focus-within:ring-4 focus-within:ring-blue-100 ${pending ? 'border-slate-200 bg-white hover:border-blue-400' : 'border-blue-200 bg-blue-50/50 hover:border-blue-400'} ${busy || cleaning ? 'pointer-events-none opacity-70' : ''}`}
                    style={pending && !showOriginal ? checkerboard : undefined}
                  >
                    {cleaning
                      ? <span className="text-xs font-extrabold text-blue-700">Removing the background…</span>
                      : pending
                        ? <img src={showOriginal ? pending.originalDataUrl : pending.dataUrl} alt={showOriginal ? 'Original photo' : 'Cleaned signature'} className="max-h-full max-w-full object-contain" />
                        : <span className="text-xs font-extrabold text-blue-700">Choose an image</span>}
                    <input ref={fileInput} type="file" accept={SIGNATURE_IMAGE_TYPES.join(',')} className="sr-only" disabled={busy || cleaning} onChange={(event) => void chooseFile(event.target.files?.[0])} />
                  </label>
                  <p className="mt-2 text-[0.65rem] leading-relaxed text-slate-500">PNG, JPG, or WebP. The paper background is removed automatically. Photograph only the signature, on plain paper, in good light.</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {signature && (
                  <button type="button" onClick={cancelReplace} disabled={busy} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                )}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!pending || busy || cleaning}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Saving…' : signature ? 'Save new signature' : 'Save signature'}
                </button>
              </div>
            </div>
          )}

          {message && (
            <p role={message.tone === 'error' ? 'alert' : 'status'} className={`border-t px-5 py-3 text-xs font-bold sm:px-6 ${message.tone === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
              {message.text}
            </p>
          )}
        </section>
      </div>
    </GsoHeadPageFrame>
  )
}
