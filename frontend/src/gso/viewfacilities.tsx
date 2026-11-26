import { useEffect, useState, type FormEvent } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { FacilitiesShortcuts } from './facilitiesShortcuts'
import {
  createVenue,
  deleteVenue,
  listManagedVenues,
  updateVenue,
  type ManagedVenue,
  type VenueInput,
} from '../facilities/facilityOptionsApi'

const sectionClass = 'rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5'
const inputClass = 'h-11 w-full rounded-xl border-2 border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'
const cardButtonClass = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60'

// "View facilities": the school places requesters can book, and the controls GSO uses to add, edit, hide, show, or delete them.
export default function ViewFacilities() {
  return (
    <GsoPageFrame activePage="Facilities and equipment" searchPlaceholder="">
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" /><div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full border-18 border-white/4" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-[40%] h-64 w-64 rounded-full border-22 border-white/3" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">Facilities and equipment</span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">View facilities</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">The school places requesters can book for an activity. GSO adds, edits, hides, shows, and deletes them here.</p>
          <FacilitiesShortcuts active="facilities" />
        </div>
      </section>

      <div className="mt-6">
        <PlacesPanel />
      </div>
    </GsoPageFrame>
  )
}

function PlacesPanel() {
  const [venues, setVenues] = useState<ManagedVenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [label, setLabel] = useState('')
  const [asksDetail, setAsksDetail] = useState(false)
  const [question, setQuestion] = useState('')

  useEffect(() => {
    let active = true
    listManagedVenues()
      .then((rows) => { if (active) setVenues(rows) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the places.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function reload() {
    try {
      setVenues(await listManagedVenues())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not refresh the places.')
    }
  }

  // Shared by every change to a place: shows the result or the error, then reloads the list.
  async function runChange(id: string, work: () => Promise<string>): Promise<boolean> {
    setError('')
    setNotice('')
    setBusyId(id)
    try {
      setNotice(await work())
      await reload()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change was not saved. Try again.')
      return false
    } finally {
      setBusyId('')
    }
  }

  async function addPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const added = await createVenue({ label, requiresDetail: asksDetail, detailLabel: asksDetail ? question : '' })
      setNotice(`${added.label} was added. Requesters can pick it now.`)
      setLabel('')
      setAsksDetail(false)
      setQuestion('')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The place was not added. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function toggleVenue(venue: ManagedVenue) {
    return runChange(venue.id, async () => {
      const changed = await updateVenue(venue.id, { isActive: !venue.isActive })
      return changed.isActive ? `${changed.label} is shown to requesters again.` : `${changed.label} is hidden from new requests.`
    })
  }

  function saveVenue(venue: ManagedVenue, input: VenueInput) {
    return runChange(venue.id, async () => {
      const changed = await updateVenue(venue.id, input)
      return `${changed.label} was updated. Requests sent before keep the name they had.`
    })
  }

  function removeVenue(venue: ManagedVenue) {
    return runChange(venue.id, async () => {
      await deleteVenue(venue.id)
      return `${venue.label} was deleted. Requests sent before keep the venue they had.`
    })
  }

  const availableCount = venues.filter((venue) => venue.isActive).length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className={sectionClass} aria-labelledby="places-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 id="places-title" className="text-base font-black tracking-tight text-slate-900">Available places</h2>
            <p className="mt-1 text-xs text-slate-500">Requesters pick these in the Facilities and equipment request.</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[0.62rem] font-extrabold text-blue-700">{loading ? 'Loading' : `${availableCount} available`}</span>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">{notice}</p>}
        {loading ? <p className="mt-4 text-sm font-bold text-slate-400">Loading places…</p>
          : venues.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-xs font-semibold text-slate-500">No places yet. Add the first one.</p>
          : <ul className="mt-4 grid gap-3 sm:grid-cols-2">{venues.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              busy={busyId === venue.id}
              onToggle={() => void toggleVenue(venue)}
              onSave={(input) => saveVenue(venue, input)}
              onDelete={() => void removeVenue(venue)}
            />
          ))}</ul>}
      </section>

      <form onSubmit={(event) => void addPlace(event)} className={`${sectionClass} self-start`} aria-labelledby="add-place-title">
        <h2 id="add-place-title" className="text-base font-black tracking-tight text-slate-900">Add a place</h2>
        <p className="mt-1 text-xs text-slate-500">A new place appears in the requester's list right away.</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-800">Place name</span>
            <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="e.g. Gymnasium" required />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={asksDetail} onChange={(event) => setAsksDetail(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
            Requesters must say which room or area
          </label>
          {asksDetail && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold text-slate-800">Question for requesters</span>
              <input className={inputClass} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={80} placeholder="e.g. Which gym area?" required />
            </label>
          )}
          <button type="submit" disabled={saving} className="h-11 w-full rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{saving ? 'Adding…' : 'Add place'}</button>
        </div>
      </form>
    </div>
  )
}

type VenueCardProps = {
  venue: ManagedVenue
  busy: boolean
  onToggle: () => void
  onSave: (input: VenueInput) => Promise<boolean>
  onDelete: () => void
}

// One place. Edit fixes a spelling or the question; Delete asks first so a misclick cannot remove a place.
function VenueCard({ venue, busy, onToggle, onSave, onDelete }: VenueCardProps) {
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [label, setLabel] = useState(venue.label)
  const [asksDetail, setAsksDetail] = useState(venue.requiresDetail)
  const [question, setQuestion] = useState(venue.detailLabel ?? '')

  function startEditing() {
    setLabel(venue.label)
    setAsksDetail(venue.requiresDetail)
    setQuestion(venue.detailLabel ?? '')
    setConfirmingDelete(false)
    setEditing(true)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await onSave({ label, requiresDetail: asksDetail, detailLabel: asksDetail ? question : '' })
    if (saved) setEditing(false)
  }

  return (
    <li className={`rounded-xl border-2 p-4 ${venue.isActive ? 'border-slate-300/80 bg-white' : 'border-dashed border-slate-300 bg-slate-50/80'}`}>
      {editing ? (
        <form onSubmit={(event) => void save(event)} className="space-y-3" aria-label={`Edit ${venue.label}`}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold text-slate-800">Place name</span>
            <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={asksDetail} onChange={(event) => setAsksDetail(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
            Requesters must say which room or area
          </label>
          {asksDetail && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-extrabold text-slate-800">Question for requesters</span>
              <input className={inputClass} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={80} required />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{busy ? 'Saving…' : 'Save changes'}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">{venue.label}</p>
              <p className="mt-1 text-xs text-slate-500">{venue.requiresDetail && venue.detailLabel ? `Requesters answer: ${venue.detailLabel}` : 'No extra question'}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6rem] font-extrabold ${venue.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{venue.isActive ? 'Available' : 'Hidden'}</span>
          </div>
          {confirmingDelete ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="mr-auto text-xs font-bold text-rose-700">Delete “{venue.label}”?</p>
              <button type="button" onClick={onDelete} disabled={busy} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60">Yes, delete</button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-50">Keep it</button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={startEditing} disabled={busy} className={cardButtonClass}>Edit</button>
              <button type="button" onClick={onToggle} disabled={busy} className={cardButtonClass}>{busy ? 'Saving…' : venue.isActive ? 'Hide from requesters' : 'Show to requesters'}</button>
              <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className="rounded-xl border border-rose-100 bg-white px-3 py-2 text-xs font-extrabold text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60">Delete</button>
            </div>
          )}
        </>
      )}
    </li>
  )
}
