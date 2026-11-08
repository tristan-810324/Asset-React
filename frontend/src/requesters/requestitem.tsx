import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { listCatalogAssets, listRequesterDepartmentStaff, REQUEST_TYPE_LABELS, submitRequest, type CatalogAsset, type RequesterDepartmentStaff, type RequestType } from './requesterApi'

type FormRow = Record<string, string | number>
type FormValues = {
  [key: string]: unknown
  purpose?: string
  neededDate?: string
  returnDate?: string
  useLocation?: string
  remarks?: string
  departmentOrganization?: string
  activity?: string
  activityType?: string
  otherActivityType?: string
  date?: string
  startTime?: string
  endTime?: string
  participantsMale?: string
  participantsFemale?: string
  venue?: string
  equipment?: FormRow[]
  requiredDate?: string
  requesterCertification?: boolean
  incidentType?: string
  keyArea?: string
  incidentDate?: string
  responsiblePerson?: string
  items?: FormRow[]
  tasks?: FormRow[]
}

const requestTypes = Object.keys(REQUEST_TYPE_LABELS) as RequestType[]
const purchaseCategoryOptions = [
  ['OFFICE_SUPPLIES', 'Office supplies'],
  ['OFFICE_EQUIPMENT', 'Office equipment'],
  ['MACHINERY_PARTS', 'Machineries / parts'],
  ['COMPUTER_PERIPHERALS', 'Peripherals / computer parts'],
  ['TOOLS_EQUIPMENT', 'Tools and equipment'],
  ['ELECTRICAL_SUPPLIES', 'Electrical supplies'],
  ['OTHER_CONSUMABLES', 'Other consumables'],
  ['OTHER', 'Others'],
  ['PUBLICATIONS', 'Publications'],
] as const

const catalogCategoryAliases: Record<string, string[]> = {
  OFFICE_SUPPLIES: ['office_supplies'],
  OFFICE_EQUIPMENT: ['office_equipment'],
  MACHINERY_PARTS: ['machinery_parts', 'machineries_parts'],
  COMPUTER_PERIPHERALS: ['computer_parts_peripherals', 'computer_peripherals', 'peripherals_computer_parts'],
  TOOLS_EQUIPMENT: ['tools_equipment', 'tools_and_equipment'],
  ELECTRICAL_SUPPLIES: ['electrical_supplies'],
  OTHER_CONSUMABLES: ['other_consumables'],
  OTHER: ['other', 'others'],
  PUBLICATIONS: ['publications'],
}

const normalizedCategory = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const catalogMatchesCategory = (asset: CatalogAsset, category: string) => {
  const normalizedAssetCategory = normalizedCategory(asset.category)
  return (catalogCategoryAliases[category] ?? []).some((alias) => normalizedAssetCategory === alias)
}
const purchaseCategoryForCatalogCategory = (value: string) => Object.entries(catalogCategoryAliases)
  .find(([, aliases]) => aliases.includes(normalizedCategory(value)))?.[0] ?? ''
const kindOptions = [['all', 'All items'], ['borrow', 'Borrow'], ['issue', 'For issuance']] as const
// Only reusable quantity stock is lent; per-unit assets and supplies go through an issuance request.
const canBorrow = (asset: CatalogAsset) => asset.trackingMode === 'quantity' && asset.issueBehavior === 'returnable'
// The catalog name falls back to the description, so only show the description when it adds detail.
const hasDescription = (asset: CatalogAsset) => Boolean(asset.description?.trim()) && asset.description.trim().toLowerCase() !== asset.name.trim().toLowerCase()
const itemRequestHref = (asset: CatalogAsset, withCatalogMatch: boolean) => {
  const params = new URLSearchParams({ type: 'ITEM_REQUEST', itemName: asset.name })
  const category = purchaseCategoryForCatalogCategory(asset.category)
  if (category) params.set('category', category)
  if (hasDescription(asset)) params.set('description', asset.description.trim())
  if (withCatalogMatch) params.set('catalogItemId', String(asset.id))
  return `/requester/requests/new?${params.toString()}`
}
const categoryOf = (asset: CatalogAsset) => asset.category || 'Uncategorized'
// Issuance items with the same name and description are one model, and GSO picks the unit when issuing.
// Borrowing must name the exact stock record, so borrowable items are never merged.
const variantKey = (asset: CatalogAsset) => canBorrow(asset) ? `item:${asset.id}` : `model:${categoryOf(asset)}|${asset.name.trim().toLowerCase()}|${asset.description.trim().toLowerCase()}`
const typeLabel = (asset: CatalogAsset) => canBorrow(asset) ? 'Borrow' : asset.trackingMode === 'individual' ? 'Per-unit asset' : 'Supply'
const inStockCount = (assets: CatalogAsset[]) => assets.filter((asset) => asset.availableQuantity > 0).length
const tileClass = 'group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100'

function groupAssets(assets: CatalogAsset[], keyOf: (asset: CatalogAsset) => string) {
  const groups = new Map<string, CatalogAsset[]>()
  for (const asset of assets) groups.set(keyOf(asset), [...(groups.get(keyOf(asset)) ?? []), asset])
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function TypeBadge({ label }: { label: string }) {
  return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-wide ${label === 'Borrow' ? 'bg-blue-50 text-blue-700' : label === 'Mixed' ? 'bg-slate-100 text-slate-600' : 'bg-violet-50 text-violet-700'}`}>{label}</span>
}
const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseSelectedStaffCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((code): code is string => typeof code === 'string')
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === 'string') : []
  } catch {
    return []
  }
}
const twoWeeksFromToday = () => {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type ItemPrefill = {
  name?: string
  description?: string
  category?: string
  catalogItemId?: string
}

function initialForm(type: RequestType, prefill: ItemPrefill = {}): FormValues {
  if (type === 'BORROWING') return { purpose: '', neededDate: '', returnDate: '', useLocation: '', remarks: '', items: [] }
  if (type === 'FACILITY_USE') return { departmentOrganization: '', activity: '', purpose: '', activityType: 'CURRICULAR', otherActivityType: '', date: '', startTime: '', endTime: '', participantsMale: '', participantsFemale: '', venue: '', equipment: [], remarks: '' }
  if (type === 'JOB_REQUEST') return { departmentOrganization: '', purpose: '', requiredDate: '', tasks: [{ quantity: 1, particulars: '', natureOfWork: '', remarks: '' }], remarks: '' }
  if (type === 'PURCHASE_REQUISITION') return { purpose: '', requiredDate: '', requesterCertification: false, items: [{ quantity: 1, category: prefill.category || '', catalogItemId: prefill.catalogItemId || '', itemName: prefill.name || '', description: prefill.description || '', intendedStaffCodes: '[]' }], remarks: '' }
  if (type === 'ISSUANCE_REQUEST') return { purpose: '', neededDate: '', remarks: '', items: [{ quantity: 1, description: prefill.name || '' }] }
  return { incidentType: 'LOST', keyArea: '', incidentDate: '', responsiblePerson: '', items: [{ quantity: 1, description: '', assetCode: '', remarks: '' }], remarks: '' }
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[0.66rem] font-extrabold uppercase tracking-wide text-slate-500">{label}</span>{children}{hint && <span className="mt-1.5 block text-[0.65rem] leading-relaxed text-slate-400">{hint}</span>}</label>
}

const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100'
const textareaClass = 'min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100'

function RequestItemContent() {
  const { identity, identityLoading, refreshIdentity, openIdentityPrompt } = useRequesterIdentity()
  const params = new URLSearchParams(window.location.search)
  const requestedType = params.get('type') as RequestType | 'ITEM_REQUEST' | null
  const unifiedItemRequest = requestedType === 'ITEM_REQUEST'
  const legacyPrefill = (params.get('item') || '').trim().slice(0, 1000)
  const itemPrefill: ItemPrefill = {
    name: (params.get('itemName') || legacyPrefill).trim().slice(0, 250),
    description: (params.get('description') || (legacyPrefill ? legacyPrefill : '')).trim().slice(0, 1000),
    category: (params.get('category') || '').trim().slice(0, 60),
    catalogItemId: (params.get('catalogItemId') || '').trim(),
  }
  const type = unifiedItemRequest
    ? 'PURCHASE_REQUISITION'
    : requestTypes.includes(requestedType as RequestType) ? requestedType as RequestType : null
  const [form, setForm] = useState<FormValues>(() => type ? initialForm(type, itemPrefill) : {})
  const [catalog, setCatalog] = useState<CatalogAsset[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [departmentStaff, setDepartmentStaff] = useState<RequesterDepartmentStaff[]>([])
  const [departmentStaffLoading, setDepartmentStaffLoading] = useState(true)
  const [departmentStaffError, setDepartmentStaffError] = useState('')
  const [search, setSearch] = useState(() => (params.get('q') || '').slice(0, 100))
  const [category, setCategory] = useState('')
  const [itemName, setItemName] = useState('')
  const [kind, setKind] = useState<(typeof kindOptions)[number][0]>('all')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const verifiedEmployeeName = [identity?.firstName, identity?.middleName, identity?.lastName, identity?.suffix]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ') || identity?.accountName || ''
  const verifiedDepartment = identity?.matchedDepartment || identity?.department || ''
  const verifiedPosition = identity?.matchedPosition || identity?.position || ''
  const verifiedEmployeeCode = identity?.matchedEmployeeCode || identity?.employeeCode || ''
  const requestDateLabel = useMemo(() => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date()), [])

  useEffect(() => {
    if (!type || !['BORROWING', 'PURCHASE_REQUISITION'].includes(type)) return
    listCatalogAssets()
      .then(setCatalog)
      .catch((reason: unknown) => setCatalogError(reason instanceof Error ? reason.message : 'Hindi ma-load ang item catalog.'))
      .finally(() => setCatalogLoaded(true))
  }, [type])

  useEffect(() => {
    if (type !== 'PURCHASE_REQUISITION' || identity?.status !== 'Verified') return
    let active = true
    listRequesterDepartmentStaff()
      .then((staff) => { if (active) setDepartmentStaff(staff) })
      .catch((reason: unknown) => { if (active) setDepartmentStaffError(reason instanceof Error ? reason.message : 'Hindi ma-load ang staff sa department mo.') })
      .finally(() => { if (active) setDepartmentStaffLoading(false) })
    return () => { active = false }
  }, [identity?.status, type])

  // Browsing goes category → item name → specific items; typing a search jumps straight to matching items.
  const term = search.trim().toLowerCase()
  const searching = term.length > 0
  const visibleCatalog = useMemo(() => catalog
    .filter((asset) => (kind === 'all' || (kind === 'borrow') === canBorrow(asset))
      && (!term || `${asset.name} ${asset.itemCode} ${asset.category} ${asset.description}`.toLowerCase().includes(term)))
    .sort((left, right) => Number(right.availableQuantity > 0) - Number(left.availableQuantity > 0)), [catalog, term, kind])
  const purchaseCatalogItems = useMemo(() => {
    const uniqueItems = new Map<string, CatalogAsset>()
    catalog.forEach((asset) => {
      const key = `${normalizedCategory(asset.category)}|${asset.name.trim().toLowerCase()}`
      if (!uniqueItems.has(key)) uniqueItems.set(key, asset)
    })
    return [...uniqueItems.values()].sort((left, right) => left.name.localeCompare(right.name))
  }, [catalog])
  const categoryGroups = useMemo(() => groupAssets(visibleCatalog, categoryOf), [visibleCatalog])
  const nameGroups = useMemo(() => groupAssets(visibleCatalog.filter((asset) => categoryOf(asset) === category), (asset) => asset.name), [visibleCatalog, category])
  const shownVariants = groupAssets(searching ? visibleCatalog : itemName ? visibleCatalog.filter((asset) => categoryOf(asset) === category && asset.name === itemName) : [], variantKey)
    .map(([key, assets]) => ({ key, assets, asset: assets[0], available: assets.reduce((total, entry) => total + entry.availableQuantity, 0) }))
    .sort((left, right) => Number(right.available > 0) - Number(left.available > 0))
  const selectedItems = (type === 'BORROWING' ? form.items ?? [] : []) as FormRow[]
  const fallbackQuery = search.trim() ? `&item=${encodeURIComponent(search.trim())}` : ''

  const minPurchaseDate = useMemo(() => twoWeeksFromToday(), [])
  const setField = (key: string, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const updateRow = (key: string, index: number, field: string, value: string | number) => {
    setForm((current) => {
      const rows = current[key]
      return { ...current, [key]: Array.isArray(rows) ? (rows as FormRow[]).map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) : [] }
    })
  }
  const addRow = (key: string, value: FormRow) => setForm((current) => {
    const rows = current[key]
    return { ...current, [key]: [...(Array.isArray(rows) ? rows as FormRow[] : []), value] }
  })
  const removeRow = (key: string, index: number) => setForm((current) => {
    const rows = current[key]
    return { ...current, [key]: Array.isArray(rows) ? (rows as FormRow[]).filter((_row, rowIndex) => rowIndex !== index) : [] }
  })

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type) return
    setError('')
    if (type === 'BORROWING' && selectedItems.length === 0) {
      setError('Pumili muna ng kahit isang item sa catalog.')
      return
    }
    setSaving(true)
    try {
      const currentIdentity = identity?.status === 'Verified' ? identity : await refreshIdentity()
      if (currentIdentity?.status !== 'Verified') {
        setError(currentIdentity?.status === 'Pending' ? 'Nasa GSO pa ang identity verification mo. Hintayin muna ang approval bago magpadala ng request.' : 'Kumpletuhin muna ang staff identity details at hintayin ang GSO verification bago magpadala ng request.')
        openIdentityPrompt()
        return
      }
      const requestData = type === 'PURCHASE_REQUISITION'
        ? {
          ...form,
          items: ((form.items ?? []) as FormRow[]).map((item) => ({
            ...item,
            catalogItemId: item.catalogItemId ? String(item.catalogItemId) : null,
            intendedStaffCodes: parseSelectedStaffCodes(item.intendedStaffCodes),
          })),
        }
        : form
      const request = await submitRequest(type, requestData)
      window.location.replace(`/requester/requests/${request.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Hindi naisumite ang request. Subukan ulit.')
      const currentIdentity = await refreshIdentity()
      if (currentIdentity?.status !== 'Verified') openIdentityPrompt()
    } finally {
      setSaving(false)
    }
  }

  if (!type) {
    return <div><a href="/requester/request-center" className="text-sm font-extrabold text-blue-700 hover:underline">Bumalik sa Request Center</a></div>
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {unifiedItemRequest ? 'Item request' : 'New school request'}</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{unifiedItemRequest ? 'Request an item' : REQUEST_TYPE_LABELS[type]}</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">{unifiedItemRequest ? 'Tell GSO what your department needs. GSO will check the catalog and decide the next step.' : type === 'PURCHASE_REQUISITION' ? 'Describe the general item your department needs. GSO will review the request before any purchase or issuance.' : 'Complete the form details below. GSO will review your submission and provide a reference number for tracking.'}</p></div>
        </section>
        <a href="/requester/request-center" className="inline-flex items-center gap-2 text-xs font-extrabold text-blue-700 hover:underline">← Request Center</a>
        <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm shadow-blue-950/5 sm:p-5">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">{type === 'PURCHASE_REQUISITION' ? 'EmployeeHead / requester' : 'Requester account'}</p>
          <p className="mt-1 text-sm font-bold text-slate-800">Your signed-in school account will be recorded automatically.</p>
          {type === 'PURCHASE_REQUISITION' && identity?.status === 'Verified' && <p className="mt-1 text-xs font-semibold text-slate-600">{verifiedEmployeeName}{verifiedEmployeeCode ? ` · ${verifiedEmployeeCode}` : ''}{verifiedDepartment ? ` · ${verifiedDepartment}` : ''}{verifiedPosition ? ` · ${verifiedPosition}` : ''}</p>}
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{type === 'PURCHASE_REQUISITION' ? 'The verified employee department is attached automatically. The GSO Head reviews and endorses the requisition before it is forwarded to Finance.' : 'A submission creates a reference number and enters the GSO review queue. It is not an approval.'}</p>
        </section>

        {identity?.status !== 'Verified' && <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" role="status">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-extrabold text-amber-950">{identityLoading ? 'Checking GSO verification…' : identity?.status === 'Pending' ? 'Your identity is awaiting GSO verification' : identity?.status === 'Needs Correction' ? 'Your identity details need correction' : 'GSO identity verification is required'}</p><p className="mt-1 text-xs leading-relaxed text-amber-900">{identity?.status === 'Pending' ? 'Hindi maipapadala ang request habang pending pa ang review.' : 'Maaari mong kumpletuhin ang staff details ngayon; kailangan itong ma-verify bago makapag-submit.'}</p></div><button type="button" onClick={openIdentityPrompt} className="shrink-0 rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-amber-950">{identity?.status === 'Pending' ? 'View status' : 'Complete identity'}</button></div>
        </section>}

        <form onSubmit={onSubmit} className="mt-5 space-y-5">
          {type === 'BORROWING' && <>
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Step 1 · Choose items</p>
                  <h2 className="mt-1 text-lg font-black tracking-tight">Inventory catalog</h2>
                  <p className="mt-1 text-xs text-slate-500">Pumili ng category, tapos ng item, saka ang mismong unit na kailangan mo. O i-search agad.</p>
                </div>
                <input type="search" className={`${inputClass} sm:w-64`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, code, or category" aria-label="Search the inventory catalog" />
              </div>
              <div className="mt-4 inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Filter by request type">
                {kindOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-extrabold transition ${kind === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
              </div>
              {catalogError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{catalogError}</p>}
              {!catalogLoaded && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-bold text-slate-500">Loading the catalog…</p>}
              {catalogLoaded && searching && <p className="mt-4 text-xs font-semibold text-slate-500">{visibleCatalog.length} result{visibleCatalog.length === 1 ? '' : 's'} for “{search.trim()}” · <button type="button" onClick={() => setSearch('')} className="font-extrabold text-blue-700 hover:underline">Clear search</button></p>}
              {catalogLoaded && !searching && category && <nav aria-label="Catalog location" className="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <button type="button" onClick={() => { setCategory(''); setItemName('') }} className="text-blue-700 hover:underline">All categories</button>
                <span className="text-slate-300" aria-hidden="true">/</span>
                {itemName ? <button type="button" onClick={() => setItemName('')} className="text-blue-700 hover:underline">{category}</button> : <span className="text-slate-700" aria-current="page">{category}</span>}
                {itemName && <><span className="text-slate-300" aria-hidden="true">/</span><span className="text-slate-700" aria-current="page">{itemName}</span></>}
              </nav>}

              {catalogLoaded && !searching && !category && categoryGroups.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categoryGroups.map(([name, assets]) => <button key={name} type="button" onClick={() => setCategory(name)} className={tileClass}>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-slate-900">{name}</span>
                    <span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">{new Set(assets.map((asset) => asset.name)).size} item name{new Set(assets.map((asset) => asset.name)).size === 1 ? '' : 's'} · {inStockCount(assets)} of {assets.length} in stock</span>
                  </span>
                  <span className="text-base text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true">→</span>
                </button>)}
              </div>}

              {catalogLoaded && !searching && category && !itemName && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {nameGroups.map(([name, assets]) => {
                  const labels = new Set(assets.map(typeLabel))
                  return <button key={name} type="button" onClick={() => setItemName(name)} className={tileClass}>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-black text-slate-900">{name}</span><TypeBadge label={labels.size === 1 ? [...labels][0] : 'Mixed'} /></span>
                      <span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">{new Set(assets.map(variantKey)).size} variant{new Set(assets.map(variantKey)).size === 1 ? '' : 's'} · {inStockCount(assets)} in stock</span>
                    </span>
                    <span className="text-base text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true">→</span>
                  </button>
                })}
                {nameGroups.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500 sm:col-span-2 lg:col-span-3">Walang item sa category na ito para sa napiling filter.</p>}
              </div>}

              {catalogLoaded && !searching && itemName && shownVariants.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">Walang item dito para sa napiling filter.</p>}
              {catalogLoaded && shownVariants.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shownVariants.map(({ key, assets, asset, available }) => {
                  const selected = selectedItems.some((row) => row.itemId === asset.id)
                  const borrowable = canBorrow(asset)
                  const inStock = available > 0
                  const conditions = new Set(assets.map((entry) => entry.condition))
                  // Inside an item name every card shares the name, so the description becomes the title.
                  const title = !searching && hasDescription(asset) ? asset.description : asset.name
                  return <article key={key} className={`flex flex-col rounded-xl border p-4 transition ${selected ? 'border-blue-300 bg-blue-50/60' : inStock ? 'border-slate-200 bg-white hover:border-blue-200' : 'border-slate-200 bg-slate-50/70'}`}>
                    {searching && <p className="truncate text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{categoryOf(asset)}</p>}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`line-clamp-2 min-w-0 text-sm font-black ${inStock ? 'text-slate-900' : 'text-slate-600'}`} title={title}>{title}</h4>
                      <TypeBadge label={typeLabel(asset)} />
                    </div>
                    {searching && hasDescription(asset) && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600" title={asset.description}>{asset.description}</p>}
                    <p className="mt-1.5 text-[0.65rem] font-semibold text-slate-400">{assets.length > 1 ? `${assets.length} ${asset.trackingMode === 'individual' ? 'units' : 'items'}` : asset.itemCode} · {conditions.size === 1 ? asset.condition : 'Mixed condition'}</p>
                    <div className="mt-3 flex flex-1 items-end justify-between gap-2">
                      <span className={`rounded-lg px-2 py-1 text-[0.62rem] font-extrabold ${inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200/70 text-slate-500'}`}>{inStock ? `${available} ${asset.unitOfMeasure} available` : 'Out of stock'}</span>
                      {borrowable && inStock
                        ? <button type="button" aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Add'} ${asset.name}`} onClick={() => selected ? setForm((current) => ({ ...current, items: ((current.items ?? []) as FormRow[]).filter((row) => row.itemId !== asset.id) })) : addRow('items', { itemId: asset.id, quantity: 1 })} className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-extrabold transition ${selected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-blue-200 text-blue-700 hover:bg-blue-50'}`}>{selected ? '✓ Added' : '+ Add'}</button>
                        : <a href={itemRequestHref(asset, assets.length === 1)} aria-label={`Request ${asset.name}`} className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[0.65rem] font-extrabold text-blue-700 transition hover:bg-blue-50">Request item</a>}
                    </div>
                  </article>
                })}
              </div>}
              {catalogLoaded && !catalogError && <div role={visibleCatalog.length ? undefined : 'status'} className={`mt-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${visibleCatalog.length ? 'border-slate-200 bg-slate-50/80' : 'border-amber-200 bg-amber-50'}`}>
                <div>
                  <p className="text-sm font-extrabold text-slate-800">{visibleCatalog.length ? 'Hindi mo makita ang kailangan mo?' : catalog.length ? `Walang tumugma${search.trim() ? ` sa “${search.trim()}”` : ''} sa inventory.` : 'Wala pang item sa inventory catalog.'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">Kung wala sa catalog, piliin ang “General item / not listed” sa form. GSO ang magmamatch sa Item Master Data o magpapasok ng bagong item pagkatapos ng review.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={`/requester/requests/new?type=ITEM_REQUEST${fallbackQuery.replace('&item=', '&itemName=')}`} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700">Request an item</a>
                </div>
              </div>}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
              <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Step 2 · Quantity and schedule</p>
              <h2 className="mt-1 text-lg font-black tracking-tight">Selected items ({selectedItems.length})</h2>
              <p className="mt-1 text-xs text-slate-500">GSO reviews the quantity, use details, and return date before pickup.</p>
              {selectedItems.length === 0
                ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center text-xs font-semibold text-slate-500">Pumili ng item sa catalog sa itaas.</p>
                : <div className="mt-4 space-y-2">
                  {selectedItems.map((row, index) => {
                    const asset = catalog.find((entry) => entry.id === row.itemId)
                    return <div key={row.itemId} className="grid items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-[1fr_8rem_auto]">
                      <div className="min-w-0 self-center"><p className="truncate text-sm font-extrabold text-slate-800">{asset?.name ?? 'Item'}</p>{asset && <p className="mt-0.5 text-[0.65rem] text-slate-500">{asset.itemCode} · {asset.availableQuantity} {asset.unitOfMeasure} available</p>}</div>
                      <Field label="Quantity"><input className={inputClass} type="number" min="1" max={asset?.availableQuantity || undefined} value={row.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field>
                      <button type="button" onClick={() => removeRow('items', index)} className="rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>
                    </div>
                  })}
                </div>}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Needed date"><input className={inputClass} type="date" min={today()} value={form.neededDate} onChange={(event) => setField('neededDate', event.target.value)} required /></Field>
                <Field label="Expected return date"><input className={inputClass} type="date" min={form.neededDate || today()} value={form.returnDate} onChange={(event) => setField('returnDate', event.target.value)} required /></Field>
                <Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field>
                <Field label="Place of use"><input className={inputClass} value={form.useLocation} onChange={(event) => setField('useLocation', event.target.value)} placeholder="e.g. Conference room or covered court" required maxLength={250} /></Field>
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
              <div className="mt-3 space-y-3">{(form.equipment ?? []).map((item: FormRow, index: number) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto]"><Field label="Equipment"><input className={inputClass} value={item.name} onChange={(event) => updateRow('equipment', index, 'name', event.target.value)} required /></Field><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('equipment', index, 'quantity', event.target.value)} required /></Field><Field label="Unit"><input className={inputClass} value={item.unit} onChange={(event) => updateRow('equipment', index, 'unit', event.target.value)} /></Field><button type="button" onClick={() => removeRow('equipment', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button></div>)}</div>
            </div>
          </section>}

          {type === 'JOB_REQUEST' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Job request</h2><p className="mt-1 text-xs text-slate-500">Describe the work requested and when it is needed.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Area / department"><input className={inputClass} value={form.departmentOrganization} onChange={(event) => setField('departmentOrganization', event.target.value)} required /></Field><Field label="Date required"><input className={inputClass} type="date" min={today()} value={form.requiredDate} onChange={(event) => setField('requiredDate', event.target.value)} required /></Field><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field></div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Particulars / nature of work</h2><button type="button" onClick={() => addRow('tasks', { quantity: 1, particulars: '', natureOfWork: '', remarks: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add task</button></div><div className="mt-3 space-y-4">{(form.tasks ?? []).map((task: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={task.quantity} onChange={(event) => updateRow('tasks', index, 'quantity', event.target.value)} required /></Field><Field label="Particulars"><input className={inputClass} value={task.particulars} onChange={(event) => updateRow('tasks', index, 'particulars', event.target.value)} required /></Field>{(form.tasks?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('tasks', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div><Field label="Description / nature of work"><textarea className={`${textareaClass} mt-3`} value={task.natureOfWork} onChange={(event) => updateRow('tasks', index, 'natureOfWork', event.target.value)} required /></Field><Field label="Task remarks"><input className={`${inputClass} mt-3`} value={task.remarks} onChange={(event) => updateRow('tasks', index, 'remarks', event.target.value)} /></Field></div>)}</div></div>
          </section>}

          {type === 'PURCHASE_REQUISITION' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Item requisition for staff issue</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">The Head submits the request; GSO validates stock and coordinates the next step.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="EmployeeHead / requester">
                <input className={inputClass} value={verifiedEmployeeName || identity?.accountName || ''} readOnly aria-readonly="true" placeholder="GSO-verified identity required" />
              </Field>
              <Field label="Verified department">
                <input className={inputClass} value={verifiedDepartment} readOnly aria-readonly="true" placeholder="Set from verified employee record" />
              </Field>
              <Field label="Position">
                <input className={inputClass} value={verifiedPosition} readOnly aria-readonly="true" placeholder="Set from verified employee record" />
              </Field>
              <Field label="Request date">
                <input className={inputClass} value={requestDateLabel} readOnly aria-readonly="true" />
              </Field>
              <Field label="Date needed" hint="Isumite nang hindi bababa sa dalawang linggo bago ang petsang kailangan.">
                <input className={inputClass} type="date" min={minPurchaseDate} value={form.requiredDate} onChange={(event) => setField('requiredDate', event.target.value)} required />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Purpose / justification">
                  <textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} placeholder="Bakit kailangan ng department ang mga item na ito?" required maxLength={2000} />
                </Field>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-extrabold text-slate-800">Items for requisition</h3><p className="mt-1 text-[0.68rem] text-slate-500">Add the category, quantity, and specifications.</p></div>
                <button type="button" onClick={() => addRow('items', { quantity: 1, category: '', catalogItemId: '', itemName: '', description: '', intendedStaffCodes: '[]' })} className="shrink-0 rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add item</button>
              </div>
              <div className="mt-3 space-y-3">
                {(form.items ?? []).map((item: FormRow, index: number) => {
                  const selectedStaffCodes = parseSelectedStaffCodes(item.intendedStaffCodes)
                  const matchingCatalogItems = purchaseCatalogItems.filter((asset) => !item.category || catalogMatchesCategory(asset, String(item.category)))
                  return <div key={index} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-[14rem_1fr_8rem_auto]">
                      <Field label="Requisition category"><select className={inputClass} value={item.category} onChange={(event) => { updateRow('items', index, 'category', event.target.value); updateRow('items', index, 'catalogItemId', ''); updateRow('items', index, 'itemName', '') }} required><option value="">Select category</option>{purchaseCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                       <Field label="Item name" hint="Choose a saved item, or select general if it is not listed."><select className={inputClass} value={item.catalogItemId ? String(item.catalogItemId) : item.itemName ? '__GENERAL__' : ''} onChange={(event) => { const selected = matchingCatalogItems.find((asset) => String(asset.id) === event.target.value); if (!selected) { updateRow('items', index, 'catalogItemId', ''); updateRow('items', index, 'itemName', ''); updateRow('items', index, 'description', ''); return } updateRow('items', index, 'catalogItemId', String(selected.id)); updateRow('items', index, 'category', purchaseCategoryForCatalogCategory(selected.category)); updateRow('items', index, 'itemName', selected.name); updateRow('items', index, 'description', selected.description) }} required><option value="">Select an item</option><option value="__GENERAL__">General item / not listed</option>{matchingCatalogItems.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{hasDescription(asset) ? ` · ${asset.description}` : ''}</option>)}</select></Field>
                      <Field label="Quantity"><input className={inputClass} type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field>
                      {(form.items?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>}
                    </div>
                     {!item.catalogItemId && <Field label="General item name" hint="Type the item name if it is not in the saved catalog."><input className={`${inputClass} mt-3`} value={item.itemName || ''} onChange={(event) => { updateRow('items', index, 'catalogItemId', ''); updateRow('items', index, 'itemName', event.target.value) }} placeholder="e.g. Bond paper or projector" required maxLength={250} /></Field>}
                     <Field label={`Item ${index + 1} description / specifications`}><textarea className={`${textareaClass} mt-3`} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} placeholder="Add the required specifications or details" required maxLength={1000} /></Field>
                    <fieldset className="mt-4">
                       <legend className="text-[0.66rem] font-extrabold uppercase tracking-wide text-slate-600">Planned staff recipient(s) <span className="font-semibold normal-case tracking-normal text-slate-400">(optional)</span></legend>
                       <p id={`purchase-staff-help-${index}`} className="mt-1 text-[0.65rem] leading-relaxed text-slate-500">Piliin kung alam na kung sino ang gagamit. Final assignment at location ay kukumpirmahin sa Main Issuance bago i-release.</p>
                      {identity?.status !== 'Verified' ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-800">Kailangan munang ma-verify ng GSO ang requester identity mo para ma-load ang department staff.</p>
                        : departmentStaffLoading ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[0.68rem] font-semibold text-slate-500">Loading active department staff…</p>
                          : departmentStaffError ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[0.68rem] font-semibold text-rose-700">{departmentStaffError}</p>
                            : departmentStaff.length === 0 ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-800">Walang ibang active staff sa verified department. Ipa-check sa GSO ang Employee Master Data.</p>
                              : <div aria-describedby={`purchase-staff-help-${index}`} className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-2">
                                {departmentStaff.map((staff) => {
                                  const checked = selectedStaffCodes.includes(staff.employeeCode)
                                  return <label key={staff.employeeCode} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${checked ? 'border-[#9bb8ae] bg-[#edf4f0]' : 'border-transparent bg-white hover:border-slate-200'}`}>
                                    <input type="checkbox" checked={checked} onChange={(event) => {
                                      const nextCodes = event.target.checked
                                        ? [...selectedStaffCodes, staff.employeeCode]
                                        : selectedStaffCodes.filter((code) => code !== staff.employeeCode)
                                      updateRow('items', index, 'intendedStaffCodes', JSON.stringify(nextCodes))
                                    }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#42675b]" />
                                    <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">{staff.employeeName}</span><span className="mt-0.5 block truncate text-[0.6rem] font-semibold text-slate-500">{staff.email}{staff.position ? ` · ${staff.position}` : ''}</span></span>
                                  </label>
                                })}
                              </div>}
                       <p className="mt-1.5 text-[0.62rem] font-bold text-slate-500">{selectedStaffCodes.length ? `${selectedStaffCodes.length} planned recipient${selectedStaffCodes.length === 1 ? '' : 's'}` : 'No planned recipient yet · optional at this stage'}</p>
                    </fieldset>
                  </div>
                })}
              </div>
            </div>

            <Field label="Additional remarks">
              <textarea className={`${textareaClass} mt-4`} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} placeholder="Optional supporting details" maxLength={2000} />
            </Field>

            <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-900">
              Sa pagpasa, pinatutunayan mong tama ang detalye at kailangan ito ng iyong department. Itatala ng system ang verified requester, department, at oras ng submission; GSO Head ang susunod na magre-review.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
              <input type="checkbox" checked={Boolean(form.requesterCertification)} onChange={(event) => setField('requesterCertification', event.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
              <span className="text-xs font-semibold leading-relaxed text-slate-700">Kinukumpirma ko na tama ang mga item, dami, purpose, at date needed, at para ito sa pangangailangan ng aking department.</span>
            </label>
          </section>}

          {type === 'ISSUANCE_REQUEST' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Item issuance request</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Para sa item na wala sa borrowing catalog o kailangan mong hawakan nang pangmatagalan. Titingnan ng GSO kung may stock; kapag na-issue, makikita mo ito sa My Issued Items. Kung wala, maaaring payuhan ka ng GSO na mag-purchase requisition.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Needed date"><input className={inputClass} type="date" min={today()} value={form.neededDate} onChange={(event) => setField('neededDate', event.target.value)} required /></Field><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} placeholder="Saan at bakit mo ito kailangan" required /></Field><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field></div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Requested items</h2><button type="button" onClick={() => addRow('items', { quantity: 1, description: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add item</button></div><div className="mt-3 space-y-3">{(form.items ?? []).map((item: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field><Field label={`Item ${index + 1} description / specifications`}><textarea className={textareaClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required maxLength={1000} /></Field>{(form.items?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>}</div></div>)}</div></div>
          </section>}

          {type === 'LOSS_DAMAGE_REPORT' && <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
            <h2 className="text-lg font-black tracking-tight">Losses and damages report</h2><p className="mt-1 text-xs text-slate-500">This submits an incident for review. It does not automatically assign fault or a charge.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Incident type"><select className={inputClass} value={form.incidentType} onChange={(event) => setField('incidentType', event.target.value)}><option value="LOST">Lost</option><option value="DAMAGED">Damaged</option></select></Field><Field label="Key area / location"><input className={inputClass} value={form.keyArea} onChange={(event) => setField('keyArea', event.target.value)} required /></Field><Field label="Date of incident"><input className={inputClass} type="date" max={today()} value={form.incidentDate} onChange={(event) => setField('incidentDate', event.target.value)} required /></Field><Field label="Reported / responsible person"><input className={inputClass} value={form.responsiblePerson} onChange={(event) => setField('responsiblePerson', event.target.value)} required /></Field></div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Affected property</h2><button type="button" onClick={() => addRow('items', { quantity: 1, description: '', assetCode: '', remarks: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add item</button></div><div className="mt-3 space-y-3">{(form.items ?? []).map((item: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field><Field label="Item / description"><input className={inputClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required /></Field><Field label="Asset/control number"><input className={inputClass} value={item.assetCode} onChange={(event) => updateRow('items', index, 'assetCode', event.target.value)} /></Field>{(form.items?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div><Field label="Item remarks"><input className={`${inputClass} mt-3`} value={item.remarks} onChange={(event) => updateRow('items', index, 'remarks', event.target.value)} /></Field></div>)}</div></div>
            <Field label="Incident details / remarks"><textarea className={`${textareaClass} mt-5`} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} required /></Field>
          </section>}

          {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><a href="/requester/request-center" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Cancel</a><button disabled={saving || identityLoading || identity?.status !== 'Verified'} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Submitting…' : identity?.status !== 'Verified' ? 'Verification required' : type === 'PURCHASE_REQUISITION' ? 'Submit to GSO Head' : 'Submit request'}</button></div>
        </form>
      </div>
    </div>
  )
}

export default function RequestItem() {
  const params = new URLSearchParams(window.location.search)
  const requestedType = params.get('type') as RequestType | 'ITEM_REQUEST' | null
  const type = requestTypes.includes(requestedType as RequestType) ? requestedType as RequestType : null
  return <RequesterLayout title={requestedType === 'ITEM_REQUEST' ? 'Item request' : type ? REQUEST_TYPE_LABELS[type] : 'New request'} subtitle="Complete the form and review your details before submitting."><RequestItemContent /></RequesterLayout>
}
