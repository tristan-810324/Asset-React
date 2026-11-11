import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { listCatalogAssets, listPurchaseItemNames, listRequesterDepartmentStaff, REQUEST_TYPE_LABELS, submitRequest, type CatalogAsset, type PurchaseItemName, type RequestType, type RequesterDepartmentStaff } from './requesterApi'

type FormRow = Record<string, string | number>
type PlannedRecipient = { employeeCode: string; quantity: number; useLocation: string; purpose: string }
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
  urgency?: string
  urgentReason?: string
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
const purchasePurposeOptions = [
  ['OFFICE_USE', 'Office use'],
  ['CLASSROOM_INSTRUCTIONAL_USE', 'Classroom / instructional use'],
  ['SCHOOL_ACTIVITY_EVENT', 'School activity / event'],
  ['REPLACEMENT', 'Replacement of damaged or unusable item'],
  ['ADDITIONAL_REQUIREMENT', 'Additional / new requirement'],
  ['MAINTENANCE_REPAIR', 'Maintenance / repair'],
  ['OTHER', 'Others'],
] as const
const borrowingPurposeOptions = [
  'Office work / administration',
  'Classroom instruction',
  'School event / activity',
  'Training / meeting',
  'Laboratory / workshop use',
  'Fieldwork / off-campus activity',
  'Maintenance / repair',
  'Other',
] as const
const borrowingLocationOptions = [
  'Office',
  'Classroom',
  'Conference room',
  'Library',
  'Laboratory / workshop',
  'Gym / covered court',
  'Storage / stockroom',
  'Off-campus / field location',
  'Other',
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
// Only reusable stock tracked by quantity is lent; individually tracked items and supplies go through an issuance request.
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
const inStockCount = (assets: CatalogAsset[]) => assets.filter((asset) => asset.availableQuantity > 0).length
const tileClass = 'group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100'

function groupAssets(assets: CatalogAsset[], keyOf: (asset: CatalogAsset) => string) {
  const groups = new Map<string, CatalogAsset[]>()
  for (const asset of assets) groups.set(keyOf(asset), [...(groups.get(keyOf(asset)) ?? []), asset])
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type ItemPrefill = {
  name?: string
  description?: string
  category?: string
  catalogItemId?: string
}

function initialForm(type: RequestType, prefill: ItemPrefill = {}): FormValues {
  if (type === 'BORROWING') return { purpose: '', otherPurpose: '', neededDate: '', returnDate: '', useLocation: '', specificLocation: '', returnResponsibleName: '', returnResponsibleContact: '', remarks: '', items: [] }
  if (type === 'FACILITY_USE') return { departmentOrganization: '', activity: '', purpose: '', activityType: 'CURRICULAR', otherActivityType: '', date: '', startTime: '', endTime: '', participantsMale: '', participantsFemale: '', venue: '', equipment: [], remarks: '' }
  if (type === 'JOB_REQUEST') return { departmentOrganization: '', purpose: '', requiredDate: '', tasks: [{ quantity: 1, particulars: '', natureOfWork: '', remarks: '' }], remarks: '' }
  if (type === 'PURCHASE_REQUISITION') return { purpose: '', otherPurpose: '', requiredDate: today(), urgency: 'Standard', urgentReason: '', requesterCertification: false, items: [{ quantity: 1, category: prefill.category || '', catalogItemId: prefill.catalogItemId || '', itemNameId: '', itemName: prefill.name || '', description: prefill.description || '', plannedRecipientsJson: '[]' }], remarks: '' }
  if (type === 'ISSUANCE_REQUEST') return { purpose: '', neededDate: '', remarks: '', items: [{ quantity: 1, description: prefill.name || '' }] }
  return { incidentType: 'LOST', keyArea: '', incidentDate: '', responsiblePerson: '', items: [{ quantity: 1, description: '', assetCode: '', remarks: '' }], remarks: '' }
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-sm font-extrabold text-slate-900">{label}</span>{children}{hint && <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span>}</label>
}

type RequestStepStatus = 'done' | 'current' | 'upcoming'

const requestStepStyles: Record<RequestStepStatus, { badge: string; label: string; suffix: string }> = {
  done: { badge: 'bg-emerald-600 text-white', label: 'text-emerald-700', suffix: ' · Done' },
  current: { badge: 'bg-blue-600 text-white ring-4 ring-blue-100', label: 'text-blue-700', suffix: '' },
  upcoming: { badge: 'bg-slate-200 text-slate-700', label: 'text-slate-600', suffix: '' },
}

function RequestStepHeader({ step, status, titleId, title, description, children }: {
  step: 1 | 2 | 3
  status: RequestStepStatus
  titleId: string
  title: string
  description: string
  children?: ReactNode
}) {
  const styles = requestStepStyles[status]
  return <div className="flex items-start gap-3">
    <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${styles.badge}`}>
      {status === 'done' ? <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 12 4 4L19 6" /></svg> : step}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className={`text-xs font-extrabold uppercase tracking-wide ${styles.label}`}>Step {step} of 3{styles.suffix}</p>
          <h2 id={titleId} className="mt-0.5 text-base font-black leading-tight text-slate-900">{title}</h2>
        </div>
        {children}
      </div>
      <p className="mt-1 text-sm leading-snug text-slate-600">{description}</p>
    </div>
  </div>
}

const inputClass = 'h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'
const textareaClass = 'min-h-20 w-full resize-y rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'

function plannedRecipientsFor(item: FormRow): PlannedRecipient[] {
  try {
    const value: unknown = JSON.parse(String(item.plannedRecipientsJson || '[]'))
    if (!Array.isArray(value)) return []
    return value.filter((recipient): recipient is PlannedRecipient => Boolean(recipient)
      && typeof recipient === 'object'
      && typeof recipient.employeeCode === 'string'
      && Number.isInteger(Number(recipient.quantity))
      && typeof recipient.useLocation === 'string'
      && typeof recipient.purpose === 'string')
  } catch {
    return []
  }
}

function RequestItemContent() {
  const { identity, identityLoading, refreshIdentity } = useRequesterIdentity()
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
  const [purchaseItemNames, setPurchaseItemNames] = useState<PurchaseItemName[]>([])
  const [departmentStaff, setDepartmentStaff] = useState<RequesterDepartmentStaff[]>([])
  const [departmentStaffError, setDepartmentStaffError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [search, setSearch] = useState(() => (params.get('q') || '').slice(0, 100))
  const [category, setCategory] = useState('')
  const [itemName, setItemName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const verifiedEmployeeName = [identity?.firstName, identity?.middleName, identity?.lastName, identity?.suffix]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ') || identity?.accountName || ''
  const verifiedDepartment = identity?.matchedDepartment || identity?.department || ''
  const verifiedPosition = identity?.matchedPosition || identity?.position || ''
  const requestDateLabel = useMemo(() => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date()), [])

  useEffect(() => {
    if (!type || !['BORROWING', 'PURCHASE_REQUISITION'].includes(type)) return
    listCatalogAssets()
      .then(setCatalog)
      .catch((reason: unknown) => setCatalogError(reason instanceof Error ? reason.message : 'Unable to load the item catalog.'))
      .finally(() => setCatalogLoaded(true))
  }, [type])

  useEffect(() => {
    if (type !== 'PURCHASE_REQUISITION') return
    let active = true
    void listPurchaseItemNames()
      .then((itemNames) => { if (active) setPurchaseItemNames(itemNames) })
      .catch((reason: unknown) => { if (active) setCatalogError(reason instanceof Error ? reason.message : 'Unable to load saved item names.') })
    void listRequesterDepartmentStaff()
      .then((staff) => { if (active) { setDepartmentStaff(staff); setDepartmentStaffError('') } })
      .catch((reason: unknown) => { if (active) setDepartmentStaffError(reason instanceof Error ? reason.message : 'Unable to load department staff.') })
    return () => { active = false }
  }, [type])

  // Browsing goes category → item name → specific items; typing a search jumps straight to matching items.
  const term = search.trim().toLowerCase()
  const searching = term.length > 0
  const visibleCatalog = useMemo(() => catalog
    .filter((asset) => (type !== 'BORROWING' || canBorrow(asset))
      && (!term || `${asset.name} ${asset.itemCode} ${asset.category} ${asset.description}`.toLowerCase().includes(term)))
    .sort((left, right) => Number(right.availableQuantity > 0) - Number(left.availableQuantity > 0)), [catalog, term, type])
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
  const canContinueToBorrow = selectedItems.length > 0 && selectedItems.every((item) => item.willReturn === 'yes')
  const borrowingNeededDate = String(form.neededDate || '')
  const borrowingReturnDate = String(form.returnDate || '')
  const borrowingPurpose = String(form.purpose || '')
  const borrowingOtherPurpose = String(form.otherPurpose || '').trim()
  const borrowingLocation = String(form.useLocation || '')
  const borrowingSpecificLocation = String(form.specificLocation || '').trim()
  const borrowingReturnerName = String(form.returnResponsibleName || verifiedEmployeeName).trim()
  const borrowingReturnerContact = String(form.returnResponsibleContact || identity?.contactNumber || '').trim()
  const borrowingContactIsValid = /^[+0-9().\s-]+$/.test(borrowingReturnerContact) && borrowingReturnerContact.replace(/\D/g, '').length >= 7
  const borrowingQuantitiesAreValid = selectedItems.length > 0 && selectedItems.every((item) => {
    const asset = catalog.find((entry) => entry.id === item.itemId)
    const quantity = Number(item.quantity)
    return Boolean(asset) && Number.isInteger(quantity) && quantity >= 1 && quantity <= Number(asset?.availableQuantity || 0)
  })
  const borrowingDetailsAreComplete = canContinueToBorrow
    && borrowingQuantitiesAreValid
    && borrowingNeededDate >= today()
    && borrowingReturnDate >= borrowingNeededDate
    && Boolean(borrowingPurpose)
    && (borrowingPurpose !== 'Other' || Boolean(borrowingOtherPurpose))
    && Boolean(borrowingLocation)
    && Boolean(borrowingSpecificLocation)
    && Boolean(borrowingReturnerName)
    && borrowingContactIsValid
  const borrowingCurrentStep = !canContinueToBorrow ? 1 : borrowingDetailsAreComplete ? 3 : 2
  const borrowingStepStatus = (step: 1 | 2 | 3, isDone = false): RequestStepStatus => {
    if (isDone) return 'done'
    return borrowingCurrentStep === step ? 'current' : 'upcoming'
  }
  const borrowingUnitCount = selectedItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
  const borrowingPurposeSummary = borrowingPurpose === 'Other'
    ? borrowingOtherPurpose ? `Other: ${borrowingOtherPurpose}` : 'Other (please specify)'
    : borrowingPurpose || 'Not selected'
  const borrowingLocationSummary = borrowingLocation
    ? [borrowingLocation, borrowingSpecificLocation].filter(Boolean).join(' · ')
    : 'Not selected'
  const requestItems = (type === 'PURCHASE_REQUISITION' ? form.items ?? [] : []) as FormRow[]
  const requestItemsAreComplete = requestItems.length > 0 && requestItems.every((item) => {
    const quantity = Number(item.quantity)
    const plannedRecipients = plannedRecipientsFor(item)
    const plannedQuantity = plannedRecipients.reduce((sum, recipient) => sum + Number(recipient.quantity), 0)
    return Boolean(String(item.category || '').trim())
      && Boolean(String(item.itemName || '').trim())
      && (item.catalogItemId === '__GENERAL__' || Boolean(item.catalogItemId) || Boolean(item.itemNameId))
      && Boolean(String(item.description || '').trim())
      && Number.isInteger(quantity)
      && quantity >= 1
      && quantity <= 2147483647
      && plannedQuantity <= quantity
      && plannedRecipients.every((recipient) => Boolean(recipient.employeeCode)
        && Number.isInteger(Number(recipient.quantity))
        && Number(recipient.quantity) > 0
        && Boolean(recipient.useLocation.trim())
        && Boolean(recipient.purpose.trim()))
  })
  const requestPurpose = String(form.purpose || '')
  const requestOtherPurpose = String(form.otherPurpose || '').trim()
  const requestUrgency = String(form.urgency || 'Standard')
  const requestUrgentReason = String(form.urgentReason || '').trim()
  const requestDetailsAreComplete = requestItemsAreComplete
    && String(form.requiredDate || '') >= today()
    && (requestUrgency !== 'Urgent' || Boolean(requestUrgentReason))
    && Boolean(requestPurpose)
    && (requestPurpose !== 'Others' || Boolean(requestOtherPurpose))
    && form.requesterCertification === true
  const requestCurrentStep = !requestItemsAreComplete ? 1 : requestDetailsAreComplete ? 3 : 2
  const requestStepStatus = (step: 1 | 2 | 3, isDone = false): RequestStepStatus => {
    if (isDone) return 'done'
    return requestCurrentStep === step ? 'current' : 'upcoming'
  }
  const requestQuantityCount = requestItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
  const requestPurposeSummary = requestPurpose === 'Others'
    ? requestOtherPurpose ? `Others: ${requestOtherPurpose}` : 'Others (please specify)'
    : requestPurpose || 'Not selected'
  const fallbackQuery = search.trim() ? `&itemName=${encodeURIComponent(search.trim())}` : ''

  const setField = (key: string, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const updateRow = (key: string, index: number, field: string, value: string | number) => {
    setForm((current) => {
      const rows = current[key]
      return { ...current, [key]: Array.isArray(rows) ? (rows as FormRow[]).map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row) : [] }
    })
  }
  const updatePlannedRecipient = (itemIndex: number, recipientIndex: number, field: keyof PlannedRecipient, value: string) => {
    const recipients = plannedRecipientsFor(requestItems[itemIndex] || {})
    const updated = recipients.map((recipient, index) => index === recipientIndex
      ? { ...recipient, [field]: field === 'quantity' ? Number(value) : value }
      : recipient)
    updateRow('items', itemIndex, 'plannedRecipientsJson', JSON.stringify(updated))
  }
  const addPlannedRecipient = (itemIndex: number) => {
    const recipients = plannedRecipientsFor(requestItems[itemIndex] || {})
    updateRow('items', itemIndex, 'plannedRecipientsJson', JSON.stringify([
      ...recipients,
      { employeeCode: '', quantity: 1, useLocation: '', purpose: '' },
    ]))
  }
  const removePlannedRecipient = (itemIndex: number, recipientIndex: number) => {
    const recipients = plannedRecipientsFor(requestItems[itemIndex] || {})
    updateRow('items', itemIndex, 'plannedRecipientsJson', JSON.stringify(recipients.filter((_recipient, index) => index !== recipientIndex)))
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
      setError('Select at least one item from the catalog.')
      return
    }
    if (type === 'BORROWING' && selectedItems.some((item) => item.willReturn !== 'yes')) {
      setError('Confirm that every borrowed item will be returned. For items that need to be issued, choose “Request an item.”')
      return
    }
    if (type === 'PURCHASE_REQUISITION' && !requestDetailsAreComplete) {
      setError('Complete the requested items and request details before continuing.')
      return
    }
    setSaving(true)
    try {
      const currentIdentity = identity?.status === 'Verified' ? identity : await refreshIdentity()
      if (currentIdentity?.status !== 'Verified') {
        setError(currentIdentity?.status === 'Pending' ? 'Your identity verification is pending with GSO. Wait for approval before submitting.' : 'Complete your staff identity details before submitting a request.')
        return
      }
      const requestData = type === 'PURCHASE_REQUISITION'
        ? {
          ...form,
          purpose: form.purpose === 'Others' ? `Others: ${String(form.otherPurpose || '').trim()}` : form.purpose,
          items: ((form.items ?? []) as FormRow[]).map((item) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { plannedRecipientsJson, ...requestItem } = item
            return {
              ...requestItem,
              catalogItemId: item.catalogItemId && item.catalogItemId !== '__GENERAL__' ? String(item.catalogItemId) : null,
              itemNameId: item.itemNameId ? String(item.itemNameId) : null,
              plannedRecipients: plannedRecipientsFor(item),
            }
          }),
        }
        : type === 'BORROWING'
          ? {
            ...form,
            returnResponsibleName: String(form.returnResponsibleName || verifiedEmployeeName || currentIdentity.accountName).trim(),
            returnResponsibleContact: String(form.returnResponsibleContact || currentIdentity.contactNumber || '').trim(),
          }
          : form
      const request = await submitRequest(type, requestData)
      window.location.replace(`/requester/requests/${request.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request submission failed. Please try again.')
      void refreshIdentity()
    } finally {
      setSaving(false)
    }
  }

  if (!type) {
    return <div><a href="/requester/request-center" className="text-sm font-extrabold text-blue-700 hover:underline">Back to Request Center</a></div>
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {unifiedItemRequest ? 'Item request' : 'New school request'}</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{unifiedItemRequest ? 'Request item for issuance' : REQUEST_TYPE_LABELS[type]}</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">{unifiedItemRequest || type === 'PURCHASE_REQUISITION' ? 'Request department items. GSO checks stock and decides whether to issue or purchase them.' : type === 'BORROWING' ? 'Borrow reusable items and confirm when you will return them.' : 'Complete the form below. GSO will review your request.'}</p></div>
        </section>
        <a href="/requester/request-center" className="inline-flex items-center gap-2 text-xs font-extrabold text-blue-700 hover:underline">← Request Center</a>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {type === 'BORROWING' && <>
            <section aria-labelledby="borrow-items-step-title" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <RequestStepHeader
                step={1}
                status={borrowingStepStatus(1, canContinueToBorrow)}
                titleId="borrow-items-step-title"
                title="Choose items"
                description="Select reusable items and confirm each one will be returned."
              >
                <input type="search" className={`${inputClass} sm:w-64`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, code, or category" aria-label="Search the inventory catalog" />
              </RequestStepHeader>
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
                  return <button key={name} type="button" onClick={() => setItemName(name)} className={tileClass}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-900">{name}</span>
                      <span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">{new Set(assets.map(variantKey)).size} variant{new Set(assets.map(variantKey)).size === 1 ? '' : 's'} · {inStockCount(assets)} in stock</span>
                    </span>
                    <span className="text-base text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden="true">→</span>
                  </button>
                })}
                {nameGroups.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500 sm:col-span-2 lg:col-span-3">No items match in this category.</p>}
              </div>}

              {catalogLoaded && !searching && itemName && shownVariants.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-500">No matching reusable items.</p>}
              {catalogLoaded && shownVariants.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shownVariants.map(({ key, assets, asset, available }) => {
                  const selected = selectedItems.some((row) => row.itemId === asset.id)
                  const inStock = available > 0
                  const conditions = new Set(assets.map((entry) => entry.condition))
                  // Inside an item name every card shares the name, so the description becomes the title.
                  const title = !searching && hasDescription(asset) ? asset.description : asset.name
                  return <article key={key} className={`flex flex-col rounded-xl border p-4 transition ${selected ? 'border-blue-300 bg-blue-50/60' : inStock ? 'border-slate-200 bg-white hover:border-blue-200' : 'border-slate-200 bg-slate-50/70'}`}>
                    {searching && <p className="truncate text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{categoryOf(asset)}</p>}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`line-clamp-2 min-w-0 text-sm font-black ${inStock ? 'text-slate-900' : 'text-slate-600'}`} title={title}>{title}</h4>
                    </div>
                    {searching && hasDescription(asset) && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600" title={asset.description}>{asset.description}</p>}
                    <p className="mt-1.5 text-[0.65rem] font-semibold text-slate-400">{assets.length > 1 ? `${assets.length} ${asset.trackingMode === 'individual' ? 'units' : 'items'}` : asset.itemCode} · {conditions.size === 1 ? asset.condition : 'Mixed condition'}</p>
                    <div className="mt-3 flex flex-1 items-end justify-between gap-2">
                      <span className={`rounded-lg px-2 py-1 text-[0.62rem] font-extrabold ${inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200/70 text-slate-500'}`}>{inStock ? `${available} ${asset.unitOfMeasure} available` : 'Out of stock'}</span>
                      {inStock
                        ? <button type="button" aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Add'} ${asset.name}`} onClick={() => selected ? setForm((current) => ({ ...current, items: ((current.items ?? []) as FormRow[]).filter((row) => row.itemId !== asset.id) })) : addRow('items', { itemId: asset.id, quantity: 1, willReturn: '' })} className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-extrabold transition ${selected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-blue-200 text-blue-700 hover:bg-blue-50'}`}>{selected ? '✓ Added' : '+ Add'}</button>
                        : null}
                    </div>
                  </article>
                })}
              </div>}
              {catalogLoaded && !catalogError && visibleCatalog.length === 0 && <div role="status" className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-slate-800">{catalog.length ? `No reusable items match${search.trim() ? ` “${search.trim()}”` : ''}.` : 'No reusable items are listed yet.'}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">For items that should not be returned, submit an item request for GSO review.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={`/requester/requests/new?type=ITEM_REQUEST${fallbackQuery}`} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700">Request an item</a>
                </div>
              </div>}
            </section>

            {selectedItems.length > 0 && <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Return check</h3>
                  <p className="mt-1 text-xs text-slate-500">Confirm that each item will be returned to unlock Step 2.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-extrabold text-slate-600">{selectedItems.length} selected</span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedItems.map((row, index) => {
                  const asset = catalog.find((entry) => entry.id === row.itemId)
                  return <div key={row.itemId} className="grid items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2 md:grid-cols-[1fr_13rem_auto]">
                    <div className="min-w-0 self-center">
                      <p className="truncate text-sm font-extrabold text-slate-800">{asset?.name ?? 'Item'}</p>
                      {asset && <p className="mt-0.5 text-[0.65rem] text-slate-500">{asset.itemCode} · {asset.availableQuantity} {asset.unitOfMeasure} available</p>}
                    </div>
                    <Field label="Will you return this item after use?">
                      <select className={inputClass} value={String(row.willReturn || '')} onChange={(event) => { updateRow('items', index, 'willReturn', event.target.value); setError('') }} required>
                        <option value="">Select an answer</option>
                        <option value="yes">Yes, I will return it</option>
                        <option value="no">No, it needs to be issued</option>
                      </select>
                    </Field>
                    <button type="button" onClick={() => removeRow('items', index)} className="rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>
                    {row.willReturn === 'no' && asset && <div className="sm:col-span-2 md:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                      Step 2 is unavailable for items that will not be returned. <a href={itemRequestHref(asset, true)} className="font-extrabold text-blue-700 underline">Request this item for issuance</a> instead.
                    </div>}
                  </div>
                })}
              </div>
            </section>}

            <section aria-labelledby="borrow-details-step-title" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <RequestStepHeader
                step={2}
                status={borrowingStepStatus(2, borrowingDetailsAreComplete)}
                titleId="borrow-details-step-title"
                title="Borrow details"
                description="Set the quantity, schedule, use, and return contact."
              />
              {canContinueToBorrow ? <>
                <div className="mt-4 space-y-2">
                  {selectedItems.map((row, index) => {
                    const asset = catalog.find((entry) => entry.id === row.itemId)
                    return <div key={row.itemId} className="grid items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_auto]">
                      <div className="min-w-0 self-center"><p className="truncate text-sm font-extrabold text-slate-800">{asset?.name ?? 'Item'}</p>{asset && <p className="mt-0.5 text-[0.65rem] text-slate-500">{asset.itemCode} · {asset.availableQuantity} {asset.unitOfMeasure} available</p>}</div>
                      <Field label="Quantity"><input className={inputClass} type="number" min="1" max={asset?.availableQuantity || undefined} value={row.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field>
                      <button type="button" onClick={() => removeRow('items', index)} className="rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>
                    </div>
                  })}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Date needed"><input className={inputClass} type="date" min={today()} value={form.neededDate} onChange={(event) => setField('neededDate', event.target.value)} required /></Field>
                  <Field label="Expected return date"><input className={inputClass} type="date" min={form.neededDate || today()} value={form.returnDate} onChange={(event) => setField('returnDate', event.target.value)} required /></Field>
                  <Field label="Purpose">
                    <select className={inputClass} value={String(form.purpose || '')} onChange={(event) => { setField('purpose', event.target.value); if (event.target.value !== 'Other') setField('otherPurpose', '') }} required>
                      <option value="">Select a purpose</option>
                      {borrowingPurposeOptions.map((purpose) => <option key={purpose}>{purpose}</option>)}
                    </select>
                  </Field>
                  {form.purpose === 'Other' && <div className="sm:col-span-2"><Field label="Specify the purpose"><input className={inputClass} value={String(form.otherPurpose || '')} onChange={(event) => setField('otherPurpose', event.target.value)} placeholder="Describe why you need the item" required maxLength={1900} /></Field></div>}
                  <Field label="Place of use">
                    <select className={inputClass} value={String(form.useLocation || '')} onChange={(event) => setField('useLocation', event.target.value)} required>
                      <option value="">Select a location type</option>
                      {borrowingLocationOptions.map((location) => <option key={location}>{location}</option>)}
                    </select>
                  </Field>
                  <Field label={form.useLocation === 'Other' ? 'Specify the location' : 'Specific room or location'} hint="Add a building, room, or exact site.">
                    <input className={inputClass} value={String(form.specificLocation || '')} onChange={(event) => setField('specificLocation', event.target.value)} placeholder="e.g., Building A, Room 12" required maxLength={210} />
                  </Field>
                  <Field label="Person responsible for return" hint="Defaults to the requester. Change this if someone else will return the items.">
                    <input className={inputClass} value={String(form.returnResponsibleName || verifiedEmployeeName || '')} onChange={(event) => setField('returnResponsibleName', event.target.value)} placeholder="Full name" required maxLength={200} />
                  </Field>
                  <Field label="Return contact number" hint="Defaults to the requester's verified contact number.">
                    <input className={inputClass} type="tel" value={String(form.returnResponsibleContact || identity?.contactNumber || '')} onChange={(event) => setField('returnResponsibleContact', event.target.value)} placeholder="e.g., +63 9XX XXX XXXX" pattern="[0-9+(). -]{7,40}" title="Enter a valid phone number." required maxLength={40} />
                  </Field>
                  <Field label="Additional details (optional)" hint="Add a storage area or handoff note to help track the item.">
                    <textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} maxLength={2000} placeholder="Storage location, team, or handoff details" />
                  </Field>
                </div>
              </> : <div role="status" className="mt-4 grid min-h-32 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
                <p className="max-w-sm text-sm font-medium leading-relaxed text-slate-600">{selectedItems.length === 0 ? 'Choose an available item in Step 1 to continue.' : selectedItems.some((item) => item.willReturn === 'no') ? 'Items that will not be returned must be requested for issuance instead.' : 'Confirm that every selected item will be returned to unlock this step.'}</p>
              </div>}
            </section>

            {borrowingDetailsAreComplete && <section aria-labelledby="borrow-review-step-title" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <RequestStepHeader
                step={3}
                status={borrowingStepStatus(3)}
                titleId="borrow-review-step-title"
                title="Review borrowing"
                description="Confirm the items, schedule, and return contact before submitting."
              >
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">{selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} · {borrowingUnitCount} unit{borrowingUnitCount === 1 ? '' : 's'}</span>
              </RequestStepHeader>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-slate-100 px-3.5 py-2.5">
                <span className="text-xs font-bold text-slate-700">Requester</span>
                <span className="text-right text-sm font-extrabold text-slate-900">{verifiedEmployeeName || 'Not verified yet'}{verifiedDepartment ? <span className="mt-0.5 block text-xs font-semibold text-slate-600">{verifiedDepartment}</span> : null}</span>
              </div>
              {selectedItems.length > 0 ? <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-100 px-3.5">
                {selectedItems.map((row) => {
                  const asset = catalog.find((entry) => entry.id === row.itemId)
                  return <li key={row.itemId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-900">{asset?.name ?? 'Item'}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-600">{asset?.itemCode || 'Inventory item'} · {row.willReturn === 'yes' ? 'Will be returned' : row.willReturn === 'no' ? 'Needs issuance' : 'Return not confirmed'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold text-slate-800">Qty {row.quantity || 1}</span>
                  </li>
                })}
              </ul> : <div className="mt-2 grid min-h-28 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center"><p className="text-sm font-medium text-slate-600">Choose an available item in Step 1 to add it here.</p></div>}
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['Date needed', borrowingNeededDate || 'Not set'],
                  ['Expected return', borrowingReturnDate || 'Not set'],
                  ['Purpose', borrowingPurposeSummary],
                  ['Place of use', borrowingLocationSummary],
                  ['Return responsible', borrowingReturnerName || 'Not set'],
                  ['Return contact', borrowingReturnerContact || 'Not set'],
                ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                  <dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{value}</dd>
                </div>)}
              </dl>
              {String(form.remarks || '').trim() && <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"><p className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">Additional details</p><p className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{String(form.remarks).trim()}</p></div>}
              {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">{error}</p>}
              <div className="mt-4 border-t border-slate-200 pt-3">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button disabled={saving || identityLoading || identity?.status !== 'Verified' || !borrowingDetailsAreComplete} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 disabled:shadow-none">{saving ? 'Submitting…' : identityLoading || identity?.status !== 'Verified' ? 'Verification required' : 'Submit borrowing request'}</button>
                </div>
                <p className="mt-2 text-right text-xs font-semibold leading-relaxed text-slate-500">Review the details before submitting.</p>
              </div>
            </section>}
          </>}

          {type === 'FACILITY_USE' && <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
            <h2 className="text-lg font-black tracking-tight">Permit to use school facilities</h2><p className="mt-1 text-xs text-slate-500">Facility approval is subject to venue availability and school approval.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <div className="mt-3 rounded-xl border-2 border-slate-300 bg-slate-50/80 p-3">
              <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-extrabold text-slate-800">Equipment / materials</h2><p className="mt-1 text-[0.68rem] text-slate-500">Optional; add rows for equipment requested with the venue.</p></div><button type="button" onClick={() => addRow('equipment', { name: '', quantity: 1, unit: 'pcs' })} className="shrink-0 rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add item</button></div>
              <div className="mt-3 space-y-3">{(form.equipment ?? []).map((item: FormRow, index: number) => <div key={index} className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto]"><Field label="Equipment"><input className={inputClass} value={item.name} onChange={(event) => updateRow('equipment', index, 'name', event.target.value)} required /></Field><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('equipment', index, 'quantity', event.target.value)} required /></Field><Field label="Unit"><input className={inputClass} value={item.unit} onChange={(event) => updateRow('equipment', index, 'unit', event.target.value)} /></Field><button type="button" onClick={() => removeRow('equipment', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button></div>)}</div>
            </div>
          </section>}

          {type === 'JOB_REQUEST' && <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
            <h2 className="text-lg font-black tracking-tight">Job request</h2><p className="mt-1 text-xs text-slate-500">Describe the work requested and when it is needed.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Area / department"><input className={inputClass} value={form.departmentOrganization} onChange={(event) => setField('departmentOrganization', event.target.value)} required /></Field><Field label="Date required"><input className={inputClass} type="date" min={today()} value={form.requiredDate} onChange={(event) => setField('requiredDate', event.target.value)} required /></Field><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field></div>
            <div className="mt-3 rounded-xl border-2 border-slate-300 bg-slate-50/80 p-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Particulars / nature of work</h2><button type="button" onClick={() => addRow('tasks', { quantity: 1, particulars: '', natureOfWork: '', remarks: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add task</button></div><div className="mt-3 space-y-4">{(form.tasks ?? []).map((task: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={task.quantity} onChange={(event) => updateRow('tasks', index, 'quantity', event.target.value)} required /></Field><Field label="Particulars"><input className={inputClass} value={task.particulars} onChange={(event) => updateRow('tasks', index, 'particulars', event.target.value)} required /></Field>{(form.tasks?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('tasks', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div><Field label="Description / nature of work"><textarea className={`${textareaClass} mt-3`} value={task.natureOfWork} onChange={(event) => updateRow('tasks', index, 'natureOfWork', event.target.value)} required /></Field><Field label="Task remarks"><input className={`${inputClass} mt-3`} value={task.remarks} onChange={(event) => updateRow('tasks', index, 'remarks', event.target.value)} /></Field></div>)}</div></div>
          </section>}

          {type === 'PURCHASE_REQUISITION' && <>
            <section aria-labelledby="request-items-step-title" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <RequestStepHeader
                step={1}
                status={requestStepStatus(1, requestItemsAreComplete)}
                titleId="request-items-step-title"
                title="Choose items"
                description="Select each category, item, quantity, and specification."
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">{requestItems.length} item{requestItems.length === 1 ? '' : 's'} · {requestQuantityCount} units</span>
                  <button type="button" onClick={() => addRow('items', { quantity: 1, category: '', catalogItemId: '', itemNameId: '', itemName: '', description: '', plannedRecipientsJson: '[]' })} className="shrink-0 rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add item</button>
                </div>
              </RequestStepHeader>
              <div className="mt-4 space-y-3">
                {requestItems.map((item, index) => {
                  const matchingCatalogItems = purchaseCatalogItems.filter((asset) => Boolean(item.category) && catalogMatchesCategory(asset, String(item.category)))
                  const matchingManagedNames = purchaseItemNames.filter((saved) => Boolean(item.category) && purchaseCategoryForCatalogCategory(saved.category) === item.category)
                  const isGeneralItem = item.catalogItemId === '__GENERAL__'
                  const plannedRecipients = plannedRecipientsFor(item)
                  const plannedQuantity = plannedRecipients.reduce((sum, recipient) => sum + Number(recipient.quantity || 0), 0)
                  const unplannedQuantity = Math.max(Number(item.quantity || 0) - plannedQuantity, 0)
                  return <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="grid gap-3 sm:grid-cols-[14rem_1fr_8rem_auto]">
                      <Field label="Item category"><select className={inputClass} value={String(item.category || '')} onChange={(event) => { updateRow('items', index, 'category', event.target.value); updateRow('items', index, 'catalogItemId', ''); updateRow('items', index, 'itemNameId', ''); updateRow('items', index, 'itemName', '') }} required><option value="">Select category</option>{purchaseCategoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                      <Field label="Item name"><select className={inputClass} value={item.itemNameId ? `managed:${item.itemNameId}` : item.catalogItemId ? String(item.catalogItemId) : ''} onChange={(event) => { const value = event.target.value; const managed = value.startsWith('managed:') ? matchingManagedNames.find((saved) => saved.id === value.slice(8)) : undefined; const selected = matchingCatalogItems.find((asset) => String(asset.id) === value); if (value === '__GENERAL__') { updateRow('items', index, 'catalogItemId', '__GENERAL__'); updateRow('items', index, 'itemNameId', ''); updateRow('items', index, 'itemName', ''); updateRow('items', index, 'description', ''); return } if (managed) { updateRow('items', index, 'catalogItemId', ''); updateRow('items', index, 'itemNameId', managed.id); updateRow('items', index, 'itemName', managed.name); updateRow('items', index, 'description', ''); return } if (!selected) { updateRow('items', index, 'catalogItemId', ''); updateRow('items', index, 'itemNameId', ''); updateRow('items', index, 'itemName', ''); updateRow('items', index, 'description', ''); return } updateRow('items', index, 'catalogItemId', String(selected.id)); updateRow('items', index, 'itemNameId', ''); updateRow('items', index, 'category', purchaseCategoryForCatalogCategory(selected.category)); updateRow('items', index, 'itemName', selected.name); updateRow('items', index, 'description', selected.description) }} required disabled={!item.category}><option value="">{!item.category ? 'Choose a category first' : matchingManagedNames.length || matchingCatalogItems.length ? 'Select item' : 'No saved items'}</option><option value="__GENERAL__">General item / not listed</option>{matchingManagedNames.map((saved) => <option key={`managed-${saved.id}`} value={`managed:${saved.id}`}>{saved.name}</option>)}{matchingCatalogItems.filter((asset) => !matchingManagedNames.some((saved) => saved.name.trim().toLowerCase() === asset.name.trim().toLowerCase())).map((asset) => <option key={`stock-${asset.id}`} value={asset.id}>{asset.name}{hasDescription(asset) ? ` · ${asset.description}` : ''}</option>)}</select></Field>
                      <Field label="Quantity"><input className={inputClass} type="number" min="1" max="2147483647" step="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field>
                      {requestItems.length > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>}
                    </div>
                    <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[0.66rem] font-semibold text-emerald-800">GSO checks available stock first. Purchased items require GSO Head review.</p>
                    {isGeneralItem && <div className="mt-3 rounded-xl border-2 border-blue-200 bg-blue-50/50 p-3"><Field label="Proposed item name"><input className={inputClass} value={String(item.itemName || '')} onChange={(event) => updateRow('items', index, 'itemName', event.target.value)} placeholder="Type item name" required maxLength={250} /></Field></div>}
                    <Field label="Specifications"><textarea className={`${textareaClass} mt-3`} value={String(item.description || '')} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required maxLength={1000} /></Field>
                    <section className="mt-3 rounded-xl border border-blue-100 bg-white p-3" aria-label={`Planned recipients for item ${index + 1}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-800">Planned recipients <span className="font-semibold text-slate-400">(optional)</span></h3>
                          <p className="mt-1 max-w-2xl text-[0.68rem] leading-relaxed text-slate-500">Choose who is expected to use this item. GSO can confirm or adjust the barcode-to-employee assignment during Main Issuance.</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${unplannedQuantity === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{plannedQuantity} of {Number(item.quantity) || 0} planned</span>
                      </div>
                      {departmentStaffError && <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-800">Department staff list is unavailable. You may leave this blank; GSO can select recipients during Main Issuance.</p>}
                      {plannedRecipients.length > 0 && <div className="mt-3 space-y-3">
                        {plannedRecipients.map((recipient, recipientIndex) => {
                          const selectedStaff = departmentStaff.find((staff) => staff.employeeCode === recipient.employeeCode)
                          const otherAllocated = plannedRecipients.reduce((sum, entry, currentIndex) => sum + (currentIndex === recipientIndex ? 0 : Number(entry.quantity || 0)), 0)
                          const maxRecipientQuantity = Math.max(Number(item.quantity || 0) - otherAllocated, 1)
                          return <div key={`${index}-${recipientIndex}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_7rem_auto]">
                              <Field label={`Employee ${recipientIndex + 1}`}>
                                <select className={inputClass} value={recipient.employeeCode} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'employeeCode', event.target.value)} required>
                                  <option value="">Select department staff</option>
                                  {recipient.employeeCode && !departmentStaff.some((staff) => staff.employeeCode === recipient.employeeCode) && <option value={recipient.employeeCode} disabled>Unavailable employee · {recipient.employeeCode} · choose another</option>}
                                  {departmentStaff.map((staff) => <option key={staff.employeeCode} value={staff.employeeCode} disabled={plannedRecipients.some((entry, entryIndex) => entryIndex !== recipientIndex && entry.employeeCode === staff.employeeCode)}>{staff.employeeName} · {staff.employeeCode}</option>)}
                                </select>
                              </Field>
                              <Field label="Quantity"><input className={inputClass} type="number" min="1" max={maxRecipientQuantity} step="1" value={recipient.quantity} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'quantity', event.target.value)} required /></Field>
                              <button type="button" onClick={() => removePlannedRecipient(index, recipientIndex)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>
                            </div>
                            {selectedStaff && <p className="mt-2 text-[0.68rem] font-semibold text-slate-600">{selectedStaff.position} · {selectedStaff.email}</p>}
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <Field label="Actual use location"><input className={inputClass} value={recipient.useLocation} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'useLocation', event.target.value)} maxLength={200} placeholder="e.g. IT Office · Room 201" required /></Field>
                              <Field label="Intended use"><input className={inputClass} value={recipient.purpose} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'purpose', event.target.value)} maxLength={500} placeholder="e.g. Printing student records" required /></Field>
                            </div>
                          </div>
                        })}
                      </div>}
                      {plannedQuantity > Number(item.quantity) && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] font-bold text-rose-700">Recipient quantities exceed the requested quantity. Reduce the allocations before submitting.</p>}
                      {unplannedQuantity > 0 && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[0.68rem] font-semibold text-slate-600">{plannedRecipients.length > 0 ? `${unplannedQuantity} unit(s) not planned yet.` : 'No recipients planned yet.'} GSO will confirm or assign these during Main Issuance.</p>}
                      <button type="button" onClick={() => addPlannedRecipient(index)} disabled={departmentStaff.length === 0 || plannedQuantity >= Number(item.quantity || 0)} className="mt-3 rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">+ Add employee recipient</button>
                    </section>
                  </div>
                })}
              </div>
            </section>

            <section aria-labelledby="request-details-step-title" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <RequestStepHeader
                step={2}
                status={requestStepStatus(2, requestDetailsAreComplete)}
                titleId="request-details-step-title"
                title="Request details"
                description="Set the date, urgency, purpose, and requester confirmation."
              />
              {requestItemsAreComplete ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Requester"><input className={inputClass} value={verifiedEmployeeName || identity?.accountName || ''} readOnly aria-readonly="true" placeholder="GSO-verified identity required" /></Field>
                <Field label="Verified department"><input className={inputClass} value={verifiedDepartment} readOnly aria-readonly="true" placeholder="Set from verified employee record" /></Field>
                <Field label="Position"><input className={inputClass} value={verifiedPosition} readOnly aria-readonly="true" placeholder="Set from verified employee record" /></Field>
                <Field label="Request date"><input className={inputClass} value={requestDateLabel} readOnly aria-readonly="true" /></Field>
                <Field label="Date needed"><input className={inputClass} type="date" min={today()} value={String(form.requiredDate || '')} onChange={(event) => setField('requiredDate', event.target.value)} required /></Field>
                <Field label="Urgency"><select className={inputClass} value={requestUrgency} onChange={(event) => setField('urgency', event.target.value)} required><option value="Standard">Standard</option><option value="Urgent">Urgent</option></select></Field>
                {requestUrgency === 'Urgent' && <div className="sm:col-span-2"><Field label="Why is this urgent?"><input className={inputClass} value={requestUrgentReason} onChange={(event) => setField('urgentReason', event.target.value)} maxLength={500} required placeholder="When is it needed, and why?" /></Field><p className="mt-1.5 text-[0.65rem] font-medium text-amber-700">Urgent requests still follow the item's approval rules.</p></div>}
                <div className="sm:col-span-2">
                  <Field label="Purpose"><select className={inputClass} value={requestPurpose} onChange={(event) => { setField('purpose', event.target.value); if (event.target.value !== 'Others') setField('otherPurpose', '') }} required><option value="">Select purpose</option>{purchasePurposeOptions.map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select></Field>
                  {requestPurpose === 'Others' && <div className="mt-3"><Field label="Specify the purpose"><input className={inputClass} value={requestOtherPurpose} onChange={(event) => setField('otherPurpose', event.target.value)} required maxLength={1900} placeholder="Describe the other purpose" /></Field></div>}
                </div>
                <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                  <input type="checkbox" checked={Boolean(form.requesterCertification)} onChange={(event) => setField('requesterCertification', event.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                  <span className="text-xs font-semibold leading-relaxed text-slate-700">I confirm this request is accurate and needed by my department.</span>
                </label>
              </div> : <div role="status" className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center"><p className="max-w-sm text-sm font-medium leading-relaxed text-slate-600">Complete every item's category, name, quantity, and specifications in Step 1 to continue.</p></div>}
            </section>

            {requestDetailsAreComplete && <section aria-labelledby="request-review-step-title" className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
              <RequestStepHeader step={3} status={requestStepStatus(3)} titleId="request-review-step-title" title="Review request" description="Check the items and details before submitting to GSO Head.">
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">{requestItems.length} item{requestItems.length === 1 ? '' : 's'} · {requestQuantityCount} units</span>
              </RequestStepHeader>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-slate-100 px-3.5 py-2.5"><span className="text-xs font-bold text-slate-700">Requester</span><span className="text-right text-sm font-extrabold text-slate-900">{verifiedEmployeeName || identity?.accountName || 'Not verified yet'}{verifiedDepartment ? <span className="mt-0.5 block text-xs font-semibold text-slate-600">{verifiedDepartment}</span> : null}</span></div>
               <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-100 px-3.5">
                 {requestItems.map((item, index) => {
                   const plannedRecipients = plannedRecipientsFor(item)
                   const unplannedQuantity = Math.max(Number(item.quantity || 0) - plannedRecipients.reduce((sum, recipient) => sum + Number(recipient.quantity || 0), 0), 0)
                   return <li key={`${item.category}-${item.itemName}-${index}`} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="wrap-break-word text-sm font-extrabold text-slate-900">{String(item.itemName || 'Unnamed item')}</p><p className="mt-0.5 text-xs font-semibold text-slate-600">{String(item.category || 'No category')} · Qty {item.quantity}</p></div><span className="shrink-0 text-xs font-bold text-slate-500">{item.catalogItemId === '__GENERAL__' ? 'New item' : 'Catalog item'}</span></div><p className="mt-1.5 wrap-break-word text-xs leading-relaxed text-slate-600">{String(item.description || 'No specifications')}</p><div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5"><p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-blue-700">{plannedRecipients.length > 0 ? 'Planned recipients' : 'Recipient allocation'}</p>{plannedRecipients.length > 0 ? plannedRecipients.map((recipient) => { const staff = departmentStaff.find((entry) => entry.employeeCode === recipient.employeeCode); return <p key={recipient.employeeCode} className="mt-1 text-[0.68rem] font-semibold text-slate-700">{staff?.employeeName || recipient.employeeCode} · {recipient.quantity} · {recipient.useLocation} · {recipient.purpose}</p> }) : <p className="mt-1 text-[0.68rem] font-semibold text-slate-600">GSO will assign recipients during Main Issuance.</p>}{unplannedQuantity > 0 && plannedRecipients.length > 0 && <p className="mt-1 text-[0.68rem] font-semibold text-slate-500">{unplannedQuantity} unit(s) to be assigned by GSO.</p>}</div></li>
                 })}
              </ul>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ['Request date', requestDateLabel],
                  ['Date needed', String(form.requiredDate || 'Not set')],
                  ['Urgency', requestUrgency],
                  ['Purpose', requestPurposeSummary],
                ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 wrap-break-word text-xs font-semibold leading-relaxed text-slate-700">{value}</dd></div>)}
              </dl>
              {requestUrgency === 'Urgent' && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900"><span className="font-extrabold">Urgent reason: </span>{requestUrgentReason}</p>}
              {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">{error}</p>}
              <div className="mt-4 flex justify-end border-t border-slate-200 pt-3"><button disabled={saving || identityLoading || identity?.status !== 'Verified' || !requestDetailsAreComplete} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 disabled:shadow-none">{saving ? 'Submitting…' : identityLoading || identity?.status !== 'Verified' ? 'Verification required' : 'Submit to GSO Head'}</button></div>
            </section>}
          </>}

          {type === 'ISSUANCE_REQUEST' && <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
            <h2 className="text-lg font-black tracking-tight">Item issuance request</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Para sa item na wala sa borrowing catalog o kailangan mong hawakan nang pangmatagalan. Titingnan ng GSO kung may stock; kapag na-issue, makikita mo ito sa My Issued Items. Kung wala, maaaring payuhan ka ng GSO na mag-purchase requisition.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Needed date"><input className={inputClass} type="date" min={today()} value={form.neededDate} onChange={(event) => setField('neededDate', event.target.value)} required /></Field><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} placeholder="Saan at bakit mo ito kailangan" required /></Field><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field></div>
            <div className="mt-3 rounded-xl border-2 border-slate-300 bg-slate-50/80 p-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Requested items</h2><button type="button" onClick={() => addRow('items', { quantity: 1, description: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50">+ Add item</button></div><div className="mt-3 space-y-3">{(form.items ?? []).map((item: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field><Field label={`Item ${index + 1} description / specifications`}><textarea className={textareaClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required maxLength={1000} /></Field>{(form.items?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600 hover:bg-rose-50">Remove</button>}</div></div>)}</div></div>
          </section>}

          {type === 'LOSS_DAMAGE_REPORT' && <section className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-md shadow-slate-200/55 sm:p-5">
            <h2 className="text-lg font-black tracking-tight">Losses and damages report</h2><p className="mt-1 text-xs text-slate-500">This submits an incident for review. It does not automatically assign fault or a charge.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Incident type"><select className={inputClass} value={form.incidentType} onChange={(event) => setField('incidentType', event.target.value)}><option value="LOST">Lost</option><option value="DAMAGED">Damaged</option></select></Field><Field label="Key area / location"><input className={inputClass} value={form.keyArea} onChange={(event) => setField('keyArea', event.target.value)} required /></Field><Field label="Date of incident"><input className={inputClass} type="date" max={today()} value={form.incidentDate} onChange={(event) => setField('incidentDate', event.target.value)} required /></Field><Field label="Reported / responsible person"><input className={inputClass} value={form.responsiblePerson} onChange={(event) => setField('responsiblePerson', event.target.value)} required /></Field></div>
            <div className="mt-3 rounded-xl border-2 border-slate-300 bg-slate-50/80 p-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-extrabold text-slate-800">Affected property</h2><button type="button" onClick={() => addRow('items', { quantity: 1, description: '', assetCode: '', remarks: '' })} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-extrabold text-blue-700">+ Add item</button></div><div className="mt-3 space-y-3">{(form.items ?? []).map((item: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr_auto]"><Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field><Field label="Item / description"><input className={inputClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required /></Field><Field label="Asset/control number"><input className={inputClass} value={item.assetCode} onChange={(event) => updateRow('items', index, 'assetCode', event.target.value)} /></Field>{(form.items?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('items', index)} className="self-end rounded-xl border border-rose-100 px-3 py-2.5 text-xs font-extrabold text-rose-600">Remove</button>}</div><Field label="Item remarks"><input className={`${inputClass} mt-3`} value={item.remarks} onChange={(event) => updateRow('items', index, 'remarks', event.target.value)} /></Field></div>)}</div></div>
            <Field label="Incident details / remarks"><textarea className={`${textareaClass} mt-5`} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} required /></Field>
          </section>}

          {type !== 'BORROWING' && error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
          {type === 'BORROWING' && <div className="flex justify-end"><a href="/requester/request-center" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Cancel</a></div>}
          {type !== 'BORROWING' && <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><a href="/requester/request-center" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Cancel</a><button disabled={saving || identityLoading || identity?.status !== 'Verified'} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Submitting…' : identity?.status !== 'Verified' ? 'Verification required' : type === 'PURCHASE_REQUISITION' ? 'Submit to GSO Head' : 'Submit request'}</button></div>}
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
