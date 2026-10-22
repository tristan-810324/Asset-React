import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import RequesterLayout from './requesterlayout'
import { listCatalogAssets, REQUEST_TYPE_LABELS, submitRequest, type CatalogAsset, type RequestType } from './requesterApi'

type FormValues = Record<string, any>

const requestTypes = Object.keys(REQUEST_TYPE_LABELS) as RequestType[]
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const twoWeeksFromToday = () => {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function initialForm(type: RequestType): FormValues {
  if (type === 'BORROWING') return { purpose: '', neededDate: '', returnDate: '', pickupLocation: '', remarks: '', items: [{ itemId: '', quantity: 1 }] }
  if (type === 'FACILITY_USE') return { departmentOrganization: '', activity: '', purpose: '', activityType: 'CURRICULAR', otherActivityType: '', date: '', startTime: '', endTime: '', participantsMale: '', participantsFemale: '', venue: '', equipment: [], remarks: '' }
  if (type === 'JOB_REQUEST') return { departmentOrganization: '', purpose: '', requiredDate: '', tasks: [{ quantity: 1, particulars: '', natureOfWork: '', remarks: '' }], remarks: '' }
  if (type === 'PURCHASE_REQUISITION') return { departmentOrganization: '', category: '', purpose: '', requiredDate: '', items: [{ quantity: 1, description: '' }] }
  return { incidentType: 'LOST', keyArea: '', incidentDate: '', responsiblePerson: '', items: [{ quantity: 1, description: '', assetCode: '', remarks: '' }], remarks: '' }
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[0.66rem] font-extrabold uppercase tracking-wide text-slate-500">{label}</span>{children}{hint && <span className="mt-1.5 block text-[0.65rem] leading-relaxed text-slate-400">{hint}</span>}</label>
}

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100'
const textareaClass = 'min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100'

export default function RequestForm() {
  const params = new URLSearchParams(window.location.search)
  const requestedType = params.get('type') as RequestType | null
  const type = requestTypes.includes(requestedType as RequestType) ? requestedType as RequestType : null
  const [form, setForm] = useState<FormValues>(() => type ? initialForm(type) : {})
  const [catalog, setCatalog] = useState<CatalogAsset[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!type || type !== 'BORROWING') return
    listCatalogAssets().then(setCatalog).catch((reason: unknown) => setCatalogError(reason instanceof Error ? reason.message : 'Hindi ma-load ang item catalog.'))
  }, [type])

  const minPurchaseDate = useMemo(twoWeeksFromToday, [])
  const setField = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }))
  const updateRow = (key: string, index: number, field: string, value: unknown) => {
    setForm((current) => ({ ...current, [key]: current[key].map((row: FormValues, rowIndex: number) => rowIndex === index ? { ...row, [field]: value } : row) }))
  }
  const addRow = (key: string, value: FormValues) => setForm((current) => ({ ...current, [key]: [...current[key], value] }))
  const removeRow = (key: string, index: number) => setForm((current) => ({ ...current, [key]: current[key].filter((_row: FormValues, rowIndex: number) => rowIndex !== index) }))

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type) return
    setError('')
    setSaving(true)
    try {
      const request = await submitRequest(type, form)
      window.location.replace(`/borrower/requests/${request.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi naisumite ang request. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  if (!type) {
    return <RequesterLayout title="New request" subtitle="Pumili muna ng available request form."><a href="/borrower/request-center" className="text-sm font-extrabold text-blue-700 hover:underline">Bumalik sa Request Center</a></RequesterLayout>
  }

  return (
    <RequesterLayout title={REQUEST_TYPE_LABELS[type]} subtitle="Complete the form and review your details before submitting.">
      <div className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> New school request</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{REQUEST_TYPE_LABELS[type]}</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">Complete the form details below. GSO will review your submission and provide a reference number for tracking.</p></div>
        </section>
        <a href="/borrower/request-center" className="inline-flex items-center gap-2 text-xs font-extrabold text-blue-700 hover:underline">← Request Center</a>
        <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm shadow-blue-950/5 sm:p-5">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Requester account</p>
          <p className="mt-1 text-sm font-bold text-slate-800">Your signed-in school account will be recorded automatically.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">A submission creates a reference number and enters the GSO review queue. It is not an approval.</p>
        </section>

        <form onSubmit={onSubmit} className="mt-5 space-y-5">
          {type === 'BORROWING' && <>
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <h2 className="text-lg font-black tracking-tight">Borrow an asset</h2>
              <p className="mt-1 text-xs text-slate-500">Select available inventory, quantity, purpose, and requested dates.</p>
              {catalogError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{catalogError}</p>}
              {!catalogError && catalog.length === 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Walang available na inventory item ngayon o naglo-load pa ang catalog.</p>}
              <div className="mt-4 space-y-3">
                {(form.items || []).map((item: FormValues, index: number) => <div key={index} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-[1fr_9rem_auto]">
                  <Field label={`Item ${index + 1}`}><select className={inputClass} value={item.itemId} onChange={(event) => updateRow('items', index, 'itemId', event.target.value)} required><option value="">Select available item</option>{catalog.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.itemCode} · {asset.availableQuantity} {asset.unitOfMeasure} available</option>)}</select></Field>
                  <Field label="Quantity"><input className={inputClass} type="number" min="1" max={catalog.find((asset) => asset.id === item.itemId)?.availableQuantity || undefined} value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field>
                  {form.items.length > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>}
                </div>)}
              </div>
              <button type="button" onClick={() => addRow('items', { itemId: '', quantity: 1 })} className="mt-3 rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add another item</button>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Needed date"><input className={inputClass} type="date" min={today()} value={form.neededDate} onChange={(event) => setField('neededDate', event.target.value)} required /></Field>
                <Field label="Expected return date"><input className={inputClass} type="date" min={form.neededDate || today()} value={form.returnDate} onChange={(event) => setField('returnDate', event.target.value)} required /></Field>
                <Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field>
                <Field label="Pickup location" hint="Optional; GSO may confirm the actual pickup point."><input className={inputClass} value={form.pickupLocation} onChange={(event) => setField('pickupLocation', event.target.value)} /></Field>
                <Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field>
              </div>
            </section>
          </>}

          {type === 'FACILITY_USE' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Permit to use school facilities</h2><p className="mt-1 text-xs text-slate-500">Facility approval is subject to venue availability and school approval.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Department / year & section / organization"><input className={inputClass} value={form.departmentOrganization} onChange={(event) => setField('departmentOrganization', event.target.value)} required /></Field>
              <Field label="Activity"><input className={inputClass} value={form.activity} onChange={(event) => setField('activity', event.target.value)} required /></Field>
              <Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field>
              <Field label="Nature of activity"><select className={inputClass} value={form.activityType} onChange={(event) => setField('activityType', event.target.value)}><option value="CURRICULAR">Curricular</option><option value="CO_CURRICULAR">Co-curricular</option><option value="OTHER">Others</option></select></Field>
              {form.activityType === 'OTHER' && <Field label="Please specify"><input className={inputClass} value={form.otherActivityType} onChange={(event) => setField('otherActivityType', event.target.value)} required /></Field>}
              <Field label="Date needed"><input className={inputClass} type="date" min={today()} value={form.date} onChange={(event) => setField('date', event.target.value)} required /></Field>
              <Field label="Start time"><input className={inputClass} type="time" value={form.startTime} onChange={(event) => setField('startTime', event.target.value)} required /></Field>
              <Field label="End time"><input className={inputClass} type="time" value={form.endTime} onChange={(event) => setField('endTime', event.target.value)} required /></Field>
              <Field label="Venue"><input className={inputClass} value={form.venue} onChange={(event) => setField('venue', event.target.value)} placeholder="e.g. Magpili Hall" required /></Field>
              <Field label="Male participants"><input className={inputClass} type="number" min="0" value={form.participantsMale} onChange={(event) => setField('participantsMale', event.target.value)} /></Field>
              <Field label="Female participants"><input className={inputClass} type="number" min="0" value={form.participantsFemale} onChange={(event) => setField('participantsFemale', event.target.value)} /></Field>
              <Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field>
            </div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-extrabold text-slate-800">Equipment / materials</h2><p className="mt-1 text-[0.68rem] text-slate-500">Optional; add rows for equipment requested with the venue.</p></div><button type="button" onClick={() => addRow('equipment', { name: '', quantity: 1, unit: 'pcs' })} className="shrink-0 rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add item</button></div>
              <div className="mt-3 space-y-3">{form.equipment.map((item: FormValues, index: number) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto]"><Field label="Equipment"><input className={inputClass} value={item.name} onChange={(event) => updateRow('equipment', index, 'name', event.target.value)} required /></Field><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('equipment', index, 'quantity', event.target.value)} required /></Field><Field label="Unit"><input className={inputClass} value={item.unit} onChange={(event) => updateRow('equipment', index, 'unit', event.target.value)} /></Field><button type="button" onClick={() => removeRow('equipment', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button></div>)}</div>
            </div>
          </section>}

          {type === 'JOB_REQUEST' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Job request</h2><p className="mt-1 text-xs text-slate-500">Describe the work requested and when it is needed.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Area / department"><input className={inputClass} value={form.departmentOrganization} onChange={(event) => setField('departmentOrganization', event.target.value)} required /></Field><Field label="Date required"><input className={inputClass} type="date" min={today()} value={form.requiredDate} onChange={(event) => setField('requiredDate', event.target.value)} required /></Field><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field></div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Particulars / nature of work</h2><button type="button" onClick={() => addRow('tasks', { quantity: 1, particulars: '', natureOfWork: '', remarks: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add task</button></div><div className="mt-3 space-y-4">{form.tasks.map((task: FormValues, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={task.quantity} onChange={(event) => updateRow('tasks', index, 'quantity', event.target.value)} required /></Field><Field label="Particulars"><input className={inputClass} value={task.particulars} onChange={(event) => updateRow('tasks', index, 'particulars', event.target.value)} required /></Field>{form.tasks.length > 1 && <button type="button" onClick={() => removeRow('tasks', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div><Field label="Description / nature of work"><textarea className={`${textareaClass} mt-3`} value={task.natureOfWork} onChange={(event) => updateRow('tasks', index, 'natureOfWork', event.target.value)} required /></Field><Field label="Task remarks"><input className={`${inputClass} mt-3`} value={task.remarks} onChange={(event) => updateRow('tasks', index, 'remarks', event.target.value)} /></Field></div>)}</div></div>
          </section>}

          {type === 'PURCHASE_REQUISITION' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Purchase requisition</h2><p className="mt-1 text-xs text-slate-500">One supplier category per requisition. The paper form requires at least two weeks of lead time.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Department / office / area"><input className={inputClass} value={form.departmentOrganization} onChange={(event) => setField('departmentOrganization', event.target.value)} required /></Field><Field label="Supplier category"><select className={inputClass} value={form.category} onChange={(event) => setField('category', event.target.value)} required><option value="">Select a category</option>{['Office Supplies','Office Equipment','Machineries / Parts','Computer Parts / Peripherals','Tools / Equipment','Publications','Electrical Supplies','Other Consumables','Others'].map((option) => <option key={option}>{option}</option>)}</select></Field><Field label="Date required"><input className={inputClass} type="date" min={minPurchaseDate} value={form.requiredDate} onChange={(event) => setField('requiredDate', event.target.value)} required /></Field><Field label="Purpose of request"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field></div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Requested items</h2><button type="button" onClick={() => addRow('items', { quantity: 1, description: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add item</button></div><div className="mt-3 space-y-3">{form.items.map((item: FormValues, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field><Field label={`Item ${index + 1} description / specifications`}><textarea className={textareaClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required /></Field>{form.items.length > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div></div>)}</div></div>
          </section>}

          {type === 'LOSS_DAMAGE_REPORT' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Losses and damages report</h2><p className="mt-1 text-xs text-slate-500">This submits an incident for review. It does not automatically assign fault or a charge.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Incident type"><select className={inputClass} value={form.incidentType} onChange={(event) => setField('incidentType', event.target.value)}><option value="LOST">Lost</option><option value="DAMAGED">Damaged</option></select></Field><Field label="Key area / location"><input className={inputClass} value={form.keyArea} onChange={(event) => setField('keyArea', event.target.value)} required /></Field><Field label="Date of incident"><input className={inputClass} type="date" max={today()} value={form.incidentDate} onChange={(event) => setField('incidentDate', event.target.value)} required /></Field><Field label="Reported / responsible person"><input className={inputClass} value={form.responsiblePerson} onChange={(event) => setField('responsiblePerson', event.target.value)} required /></Field></div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Affected property</h2><button type="button" onClick={() => addRow('items', { quantity: 1, description: '', assetCode: '', remarks: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add item</button></div><div className="mt-3 space-y-3">{form.items.map((item: FormValues, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field><Field label="Item / description"><input className={inputClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required /></Field><Field label="Asset/control number"><input className={inputClass} value={item.assetCode} onChange={(event) => updateRow('items', index, 'assetCode', event.target.value)} /></Field>{form.items.length > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div><Field label="Item remarks"><input className={`${inputClass} mt-3`} value={item.remarks} onChange={(event) => updateRow('items', index, 'remarks', event.target.value)} /></Field></div>)}</div></div>
            <Field label="Incident details / remarks"><textarea className={`${textareaClass} mt-5`} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} required /></Field>
          </section>}

          {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><a href="/borrower/request-center" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Cancel</a><button disabled={saving} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{saving ? 'Submitting…' : 'Submit request'}</button></div>
        </form>
      </div>
    </RequesterLayout>
  )
}
