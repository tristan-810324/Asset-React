import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { ProgressPath } from '../components/requestpath'
import { listFacilityVenues, type FacilityVenue } from '../facilities/facilityOptionsApi'
import { listCatalogAssets, listMyIssuanceActivity, listPurchaseItemNames, REQUEST_TYPE_LABELS, submitRequest, type CatalogAsset, type PurchaseItemName, type RequestType, type RequesterIssuanceApproval } from './requesterApi'

type FormRow = Record<string, string | number>
// Items are assigned to a room under the requester's name. Older drafts that say "employee" are read as rooms.
type PlannedDistributionDestination = 'department_location'
type PlannedRecipient = {
  destinationType: PlannedDistributionDestination
  employeeCode: string
  quantity: number
  useLocation: string
  purpose: string
  building: string
  room: string
}
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
  participants?: string
  venue?: string
  serviceCategory?: string
  serviceRoute?: ServiceRoute
  location?: string
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

// A venue that asks for details is sent to GSO as "Venue – detail", so the same room matches when GSO checks for conflicts.
function facilityVenueText(option: FacilityVenue | undefined, detail: string) {
  if (!option) return ''
  if (!option.requiresDetail) return option.label
  return detail.trim() ? `${option.label} – ${detail.trim()}` : ''
}

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

type ServiceRoute = 'GSO' | 'ITSS'
type ServiceCategoryOption = {
  value: string
  label: string
  route: ServiceRoute
  group: 'Facilities' | 'IT support'
  description: string
  urgent?: boolean
}

// The server remains the source of truth for routing. This client-side map only
// previews the destination before a requester submits the form.
const serviceCategoryOptions: ServiceCategoryOption[] = [
  { value: 'ELECTRICAL_LIGHTING', label: 'Electrical & Lighting', route: 'GSO', group: 'Facilities', description: 'Lights, outlets, switches, or wiring concerns.' },
  { value: 'PLUMBING_WATER', label: 'Plumbing & Water', route: 'GSO', group: 'Facilities', description: 'Leaks, faucets, drainage, or water concerns.' },
  { value: 'FURNITURE_CARPENTRY', label: 'Furniture & Carpentry', route: 'GSO', group: 'Facilities', description: 'Chairs, tables, doors, cabinets, or fixtures.' },
  { value: 'BUILDING_REPAIR', label: 'Classroom / Building Repair', route: 'GSO', group: 'Facilities', description: 'Ceilings, walls, windows, flooring, air-conditioning, or projector mounts.' },
  { value: 'CLEANING_SANITATION', label: 'Cleaning & Sanitation', route: 'GSO', group: 'Facilities', description: 'Cleaning, waste, sanitation, grounds, or pests.' },
  { value: 'EVENT_SETUP_MOVING', label: 'Event Setup & Moving', route: 'GSO', group: 'Facilities', description: 'Room setup or moving approved furniture and equipment.' },
  { value: 'SAFETY_HAZARD', label: 'Safety Hazard', route: 'GSO', group: 'Facilities', description: 'Unsafe conditions requiring urgent facilities attention.', urgent: true },
  { value: 'COMPUTER_DEVICE', label: 'Computer & Device', route: 'ITSS', group: 'IT support', description: 'PCs, monitors, keyboards, mice, or lab devices.' },
  { value: 'NETWORK_CONNECTIVITY', label: 'Network & Connectivity', route: 'ITSS', group: 'IT support', description: 'Wi-Fi, LAN, internet, or network access.' },
  { value: 'SOFTWARE_ACCESS', label: 'Software & Access', route: 'ITSS', group: 'IT support', description: 'Software installation, logins, accounts, or permissions.' },
  { value: 'PERIPHERALS_PRINTING', label: 'Printing & Peripherals', route: 'ITSS', group: 'IT support', description: 'Printers, scanners, technical projector, and related peripherals.' },
  { value: 'OTHER_GENERAL', label: 'Other General Service', route: 'GSO', group: 'Facilities', description: 'A facilities concern not listed above; GSO can reroute it if needed.' },
  { value: 'OTHERS', label: 'Others', route: 'GSO', group: 'Facilities', description: 'Type what the service is in the box below. GSO reads it and can reroute it if needed.' },
]

const serviceCategoryByValue = new Map(serviceCategoryOptions.map((option) => [option.value, option]))

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

// The facility date and time must still be ahead: no past dates, and a time today must not have passed (Manila time).
const nowTime = () => {
  const date = new Date()
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function facilityScheduleProblem(date: string, startTime: string, endTime: string) {
  if (!date) return ''
  if (date < today()) return 'That date has passed. Pick today or a later date.'
  if (date === today() && startTime && startTime <= nowTime()) return 'That start time has already passed. Pick a later time.'
  if (startTime && endTime && endTime <= startTime) return 'The end time must be after the start time.'
  return ''
}

type ItemPrefill = {
  name?: string
  description?: string
  category?: string
  catalogItemId?: string
}

function initialForm(type: RequestType, prefill: ItemPrefill = {}): FormValues {
  if (type === 'BORROWING') return { purpose: '', otherPurpose: '', neededDate: '', returnDate: '', useLocation: '', specificLocation: '', returnResponsibleName: '', returnResponsibleContact: '', remarks: '', items: [] }
  if (type === 'FACILITY_USE') return { departmentOrganization: '', activity: '', purpose: '', activityType: 'CURRICULAR', otherActivityType: '', date: '', startTime: '', endTime: '', participants: '', venue: '', venueChoice: '', venueDetail: '', equipment: [], wantsItems: false }
  if (type === 'JOB_REQUEST') return { departmentOrganization: '', serviceCategory: '', serviceRoute: 'GSO', location: '', purpose: '', requiredDate: '', remarks: '' }
  if (type === 'PURCHASE_REQUISITION') return { purpose: '', otherPurpose: '', requiredDate: today(), urgency: 'Standard', urgentReason: '', requesterCertification: false, items: [{ quantity: 1, category: prefill.category || '', catalogItemId: prefill.catalogItemId || '', itemNameId: '', itemName: prefill.name || '', description: prefill.description || '', plannedRecipientsJson: '[]' }], remarks: '' }
  if (type === 'ISSUANCE_REQUEST') return { purpose: '', neededDate: '', remarks: '', items: [{ quantity: 1, description: prefill.name || '' }] }
  return { incidentType: 'LOST', keyArea: '', incidentDate: '', responsiblePerson: '', items: [], remarks: '' }
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

const formCardClass = 'rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5'
const addButtonClass = 'shrink-0 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-50'
const removeButtonClass = 'h-12 shrink-0 rounded-xl border border-rose-100 bg-white px-4 text-xs font-extrabold text-rose-600 transition hover:bg-rose-50'

// A titled group inside a request form. The optional action sits at the top right of the group.
function FormGroup({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

const inputClass = 'h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'
const textareaClass = 'min-h-20 w-full resize-y rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'

function plannedDestinationType(_value: unknown): PlannedDistributionDestination {
  return 'department_location'
}

function plannedRecipientsFor(item: FormRow): PlannedRecipient[] {
  try {
    const value: unknown = JSON.parse(String(item.plannedRecipientsJson || '[]'))
    if (!Array.isArray(value)) return []
    return value.flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
      const recipient = candidate as Record<string, unknown>
      const destinationType = plannedDestinationType(recipient.destinationType)
      const building = typeof recipient.building === 'string' ? recipient.building : ''
      const room = typeof recipient.room === 'string' ? recipient.room : ''
      const parsed: PlannedRecipient = {
        destinationType,
        employeeCode: typeof recipient.employeeCode === 'string' ? recipient.employeeCode : '',
        quantity: Number(recipient.quantity) || 0,
        useLocation: typeof recipient.useLocation === 'string' ? recipient.useLocation : '',
        purpose: typeof recipient.purpose === 'string' ? recipient.purpose : '',
        building,
        room,
      }
      // Same rule as the editor: keep typed spaces; the server trims on submit.
      const location = parsed.destinationType === 'department_location'
        ? [parsed.building, parsed.room].filter((part) => part.trim()).join(' · ')
        : parsed.useLocation
      return [{ ...parsed, useLocation: location }]
    })
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
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [search, setSearch] = useState(() => (params.get('q') || '').slice(0, 100))
  const [category, setCategory] = useState('')
  const [itemName, setItemName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [facilityVenues, setFacilityVenues] = useState<FacilityVenue[] | null>(null)
  const [facilityListError, setFacilityListError] = useState('')
  // The items issued to the requester, for the Loss / Damage Report picker.
  const [issuedBatches, setIssuedBatches] = useState<RequesterIssuanceApproval[] | null>(null)
  const [issuedError, setIssuedError] = useState('')
  // The group whose units are listed for picking (one at a time).
  const [openGroupKey, setOpenGroupKey] = useState('')
  // Groups the held items under the room they are assigned to, or the person they are assigned to.
  const [lossGroupBy, setLossGroupBy] = useState<'room' | 'person'>('room')

  const verifiedEmployeeName = [identity?.firstName, identity?.middleName, identity?.lastName, identity?.suffix]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ') || identity?.accountName || ''
  const verifiedDepartment = identity?.matchedDepartment || identity?.department || ''
  const verifiedPosition = identity?.matchedPosition || identity?.position || ''
  // The venue list comes from GSO, so it is loaded only for the facilities request form.
  useEffect(() => {
    if (type !== 'FACILITY_USE') return undefined
    let active = true
    listFacilityVenues()
      .then((venues) => { if (active) setFacilityVenues(venues) })
      .catch(() => { if (active) setFacilityListError('The venue list could not be loaded. Refresh the page to try again.') })
    return () => { active = false }
  }, [type])
  useEffect(() => {
    if (type !== 'LOSS_DAMAGE_REPORT') return undefined
    let active = true
    listMyIssuanceActivity()
      .then((batches) => { if (active) setIssuedBatches(batches) })
      .catch(() => { if (active) setIssuedError('Your issued items could not be loaded. Refresh the page to try again.') })
    return () => { active = false }
  }, [type])
  // Items still with the requester: one choice per tagged unit, or one per stock line with the quantity still out.
  // Consumables are left out because they are used up, not returned.
  const heldItems = useMemo(() => (issuedBatches ?? []).flatMap((batch) => batch.items
    .filter((item) => item.issueBehavior !== 'consumable' && (item.status ?? batch.status) === 'Issued')
    .flatMap((item) => {
      const outstanding = Number(item.quantity) - Number(item.returnedQuantity || 0)
      if (outstanding <= 0) return []
      const place = item.recipientLocation || ''
      const person = item.recipientEmployeeName ? `${item.recipientEmployeeName} · ${item.recipientEmployeeCode}` : item.recipientEmployeeCode || ''
      const units = (item.tags ?? []).filter((tag) => tag.custodyStatus !== 'Available')
      if (item.trackingMode === 'individual' && units.length > 0) {
        return units.map((tag) => ({ key: `${item.issuanceId}:${tag.tagCode}`, issuanceId: item.issuanceId, tagCode: tag.tagCode, name: item.itemName, code: tag.tagCode, unit: item.unitOfMeasure, outstanding: 1, place, person, itemNumber: Number(tag.unitNumber) || 0 }))
      }
      return [{ key: item.issuanceId, issuanceId: item.issuanceId, tagCode: '', name: item.itemName, code: item.itemCode, unit: item.unitOfMeasure, outstanding, place, person, itemNumber: 0 }]
    })), [issuedBatches])
  const requestDateLabel = useMemo(() => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date()), [])

  useEffect(() => {
    if (!type || !['BORROWING', 'PURCHASE_REQUISITION', 'FACILITY_USE'].includes(type)) return
    listCatalogAssets({ includeUnstocked: type === 'FACILITY_USE' })
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
    return () => { active = false }
  }, [type])

  // The verified department is already known, so these forms start with it; the requester can still add a year, section, or area.
  useEffect(() => {
    if (!verifiedDepartment || (type !== 'FACILITY_USE' && type !== 'JOB_REQUEST')) return
    // Identity loads after the form opens, so the department is copied in once it arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((current) => current.departmentOrganization ? current : { ...current, departmentOrganization: verifiedDepartment })
  }, [type, verifiedDepartment])

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
      && plannedQuantity === quantity
      && plannedRecipients.every((recipient) => {
        const hasBaseDetails = Number.isInteger(Number(recipient.quantity))
          && Number(recipient.quantity) > 0
        if (recipient.destinationType === 'department_location') {
          return hasBaseDetails && Boolean(recipient.building.trim()) && Boolean(recipient.room.trim())
        }
        return false
      })
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
    const updated = recipients.map((recipient, index) => {
      if (index !== recipientIndex) return recipient
      const next = { ...recipient, [field]: field === 'quantity' ? Number(value) : value } as PlannedRecipient
      // Keep typed spaces while editing; trimming happens when the value is read for submit and validation.
      const location = next.destinationType === 'department_location'
        ? [next.building, next.room].filter((part) => part.trim()).join(' · ')
        : next.useLocation
      return { ...next, useLocation: location }
    })
    updateRow('items', itemIndex, 'plannedRecipientsJson', JSON.stringify(updated))
  }
  const addPlannedRecipient = (itemIndex: number) => {
    const recipients = plannedRecipientsFor(requestItems[itemIndex] || {})
    const requestedQuantity = Number(requestItems[itemIndex]?.quantity || 0)
    const assignedQuantity = recipients.reduce((sum, recipient) => sum + Number(recipient.quantity || 0), 0)
    const remainingQuantity = requestedQuantity - assignedQuantity
    if (!Number.isInteger(remainingQuantity) || remainingQuantity < 1) return
    updateRow('items', itemIndex, 'plannedRecipientsJson', JSON.stringify([
      ...recipients,
      { destinationType: 'department_location', employeeCode: '', quantity: remainingQuantity, useLocation: '', purpose: '', building: '', room: '' },
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
  // Units with the same name and unit form one group. Tagged units are chosen one by one; a stock line is one count.
  const heldGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; unit: string; stock: boolean; units: typeof heldItems; total: number; place: string; person: string }>()
    for (const held of heldItems) {
      const stock = !held.tagCode
      // One card per item, room, and person, even when several issuances hold it.
      const key = [stock ? 'stock' : 'units', held.name, held.unit, held.place, held.person].join('|')
      const group = groups.get(key) ?? { key, name: held.name, unit: held.unit, stock, units: [], total: 0, place: held.place, person: held.person }
      group.units.push(held)
      group.total += held.outstanding
      groups.set(key, group)
    }
    return [...groups.values()]
  }, [heldItems])
  type HeldGroup = (typeof heldGroups)[number]
  const heldSections = useMemo(() => {
    const sections = new Map<string, HeldGroup[]>()
    for (const group of heldGroups) {
      const label = lossGroupBy === 'room' ? (group.place || 'Location not recorded') : (group.person || 'Not assigned')
      sections.set(label, [...(sections.get(label) ?? []), group])
    }
    return [...sections.entries()]
  }, [heldGroups, lossGroupBy])

  const selectedIn = (groupKey: string) => ((form.items ?? []) as FormRow[]).filter((row) => row.groupKey === groupKey)
  const countIn = (groupKey: string) => selectedIn(groupKey).reduce((sum, row) => sum + Number(row.quantity), 0)
  const selectedTotal = ((form.items ?? []) as FormRow[]).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  // The asset-tag picker opens as a pop-up once "I know the asset tag" is chosen, for lost and damaged items alike.
  const openTagGroup = heldGroups.find((group) => group.key === openGroupKey && !group.stock) ?? null
  // "Reported / responsible person" follows the grouping: the requester's own name for rooms,
  // and the assigned person's name when the selected items all belong to one person.
  const selectedPersonNames = [...new Set(heldGroups.filter((group) => countIn(group.key) > 0)
    .map((group) => group.person.split(' · ')[0]))]
  const responsibleFromSelection = lossGroupBy === 'room'
    ? verifiedEmployeeName
    : selectedPersonNames.length === 1 ? selectedPersonNames[0] : ''
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (type !== 'LOSS_DAMAGE_REPORT' || !responsibleFromSelection) return
    setForm((current) => (current.responsiblePerson === responsibleFromSelection ? current : { ...current, responsiblePerson: responsibleFromSelection }))
  }, [type, responsibleFromSelection])
  const heldRow = (held: (typeof heldItems)[number], groupKey: string, quantity: number): FormRow => ({
    key: held.key, groupKey, issuanceId: held.issuanceId, tagCode: held.tagCode, quantity,
    maxQuantity: held.outstanding, unit: held.unit, description: held.name, assetCode: held.code, remarks: '',
  })
  // Sets how many of a group are reported. Units are added in code order and dropped from the end.
  const setGroupCount = (group: HeldGroup, wanted: number) => setForm((current) => {
    const rows = Array.isArray(current.items) ? current.items as FormRow[] : []
    const others = rows.filter((row) => row.groupKey !== group.key)
    const mine = rows.filter((row) => row.groupKey === group.key)
    const count = Math.max(0, Math.min(wanted, group.total))
    if (group.stock || !mine.some((row) => Boolean(row.tagCode))) {
      // A merged card splits its count back over the issuances it covers, never above what each still holds.
      const bySource = new Map<string, { held: (typeof heldItems)[number]; outstanding: number }>()
      for (const held of group.units) {
        const entry = bySource.get(held.issuanceId)
        if (entry) entry.outstanding += held.outstanding
        else bySource.set(held.issuanceId, { held, outstanding: held.outstanding })
      }
      let remaining = count
      const allocated: FormRow[] = []
      for (const { held, outstanding } of bySource.values()) {
        const take = Math.min(remaining, outstanding)
        if (take <= 0) continue
        remaining -= take
        const row = { ...heldRow(held, group.key, take), maxQuantity: outstanding }
        allocated.push(group.stock ? row : { ...row, key: `unknown:${group.key}:${held.issuanceId}`, tagCode: '', assetCode: '', identityUnknown: 'true' })
      }
      return { ...current, items: [...others, ...allocated] }
    }
    const chosen = new Set(mine.map((row) => row.key))
    const added = group.units
      .filter((held) => !chosen.has(held.key))
      .slice(0, Math.max(0, count - mine.length))
      .map((held) => heldRow(held, group.key, 1))
    return { ...current, items: [...others, ...mine.slice(0, count), ...added] }
  })
  // Select all picks every tag of the group, not the unidentified count.
  const selectAllUnits = (group: HeldGroup) => setForm((current) => {
    const rows = Array.isArray(current.items) ? current.items as FormRow[] : []
    return { ...current, items: [...rows.filter((row) => row.groupKey !== group.key), ...group.units.map((held) => heldRow(held, group.key, 1))] }
  })
  const toggleUnit = (group: HeldGroup, held: (typeof heldItems)[number]) => setForm((current) => {
    const rows = Array.isArray(current.items) ? current.items as FormRow[] : []
    return rows.some((row) => row.key === held.key)
      ? { ...current, items: rows.filter((row) => row.key !== held.key) }
      // Picking a tag replaces the group's count with the picked tags.
      : { ...current, items: [...rows.filter((row) => row.groupKey !== group.key || row.tagCode), heldRow(held, group.key, 1)] }
  })

  // The venue text sent to GSO is built from the choice; a "specify" venue is only sent once its detail is typed.
  // Choices are option ids from the GSO venue list.
  const venueOptions = facilityVenues ?? []
  const setVenue = (choiceId: string, detail: string) => setForm((current) => ({ ...current, venueChoice: choiceId, venueDetail: detail, venue: facilityVenueText(venueOptions.find((option) => option.id === choiceId), detail) }))
  // Everything in the Item Master except consumables can be borrowed for an event; units under repair cannot.
  const facilityItems = useMemo(() => catalog.filter((asset) => asset.issueBehavior !== 'consumable' && !['Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired'].includes(asset.condition)), [catalog])
  const facilityCategories = useMemo(() => [...new Set(facilityItems.map(categoryOf))].sort((a, b) => a.localeCompare(b)), [facilityItems])
  const facilityNamesFor = (category: string) => [...new Set(facilityItems.filter((asset) => categoryOf(asset) === category).map((asset) => asset.name))].sort((a, b) => a.localeCompare(b))
  // Units with the same description are one model. The option keeps the unit with the most stock, and counts all of them.
  const facilityModelsFor = (category: string, name: string) => {
    const units = new Map<string, CatalogAsset[]>()
    for (const asset of facilityItems) {
      if (categoryOf(asset) !== category || asset.name !== name) continue
      const key = (asset.description || '').trim().toLowerCase()
      units.set(key, [...(units.get(key) ?? []), asset])
    }
    return [...units.values()].map((group) => {
      const unit = [...group].sort((left, right) => right.availableQuantity - left.availableQuantity || Number(left.id) - Number(right.id))[0]
      return { id: unit.id, label: unit.description || unit.name, inStock: group.reduce((total, asset) => total + asset.availableQuantity, 0) }
    }).sort((left, right) => left.label.localeCompare(right.label))
  }
  const setEquipmentRow = (index: number, changes: FormRow) => setForm((current) => ({
    ...current,
    equipment: ((current.equipment ?? []) as FormRow[]).map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row),
  }))
  // The stock shown in the picker. A quantity above it is flagged before the request is sent.
  const facilityStockFor = (row: FormRow) => {
    const itemId = String(row.itemId || '')
    return itemId ? facilityModelsFor(String(row.category || ''), String(row.itemName || '')).find((model) => model.id === itemId) ?? null : null
  }
  const facilityShortages = ((form.equipment ?? []) as FormRow[]).flatMap((row) => {
    const model = facilityStockFor(row)
    return model && Number(row.quantity) > model.inStock ? [`${model.label} (only ${model.inStock} in stock)`] : []
  })
  const selectedServiceCategory = serviceCategoryByValue.get(String(form.serviceCategory || ''))
  const jobRequestIsComplete = Boolean(
    selectedServiceCategory
    && String(form.departmentOrganization || '').trim()
    && String(form.location || '').trim()
    && String(form.requiredDate || '') >= today()
    && String(form.purpose || '').trim()
    && (form.serviceCategory !== 'OTHERS' || String(form.serviceOther || '').trim()),
  )

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
      setError('Complete every item assignment and request detail before continuing.')
      return
    }
    if (type === 'FACILITY_USE' && facilityScheduleProblem(String(form.date || ''), String(form.startTime || ''), String(form.endTime || ''))) {
      setError(facilityScheduleProblem(String(form.date || ''), String(form.startTime || ''), String(form.endTime || '')))
      return
    }
    if (type === 'FACILITY_USE' && facilityShortages.length > 0) {
      setError(`Not enough stock: ${facilityShortages.join(', ')}. Lower the quantity or remove the item.`)
      return
    }
    if (type === 'JOB_REQUEST' && !jobRequestIsComplete) {
      setError('Choose a service category and complete the location, target date, and request details.')
      return
    }
    if (type === 'LOSS_DAMAGE_REPORT') {
      const reported = (form.items ?? []) as FormRow[]
      if (reported.length === 0) {
        setError('Pick at least one item issued to you.')
        return
      }
      const missingUnitTags = reported.some((row) => {
        const group = heldGroups.find((heldGroup) => heldGroup.key === row.groupKey)
        return group && !group.stock && row.identityUnknown !== 'true' && !row.tagCode
      })
      if (missingUnitTags) {
        setError('Choose the exact asset tag for each affected item, or leave it for GSO to identify.')
        return
      }
      const tooMany = reported.find((row) => Number(row.quantity) > Number(row.maxQuantity))
      if (tooMany) {
        setError(`${tooMany.description}: you only have ${tooMany.maxQuantity} ${tooMany.unit}.`)
        return
      }
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
          : type === 'FACILITY_USE'
            ? { ...form, equipment: ((form.equipment ?? []) as FormRow[]).map((row) => ({ itemId: String(row.itemId), quantity: Number(row.quantity) })) }
            : type === 'LOSS_DAMAGE_REPORT'
              ? { ...form, items: ((form.items ?? []) as FormRow[]).map((row) => ({ issuanceId: String(row.issuanceId), tagCode: String(row.tagCode || ''), quantity: Number(row.quantity), identityUnknown: row.identityUnknown === 'true', remarks: String(row.remarks || '') })) }
              : type === 'JOB_REQUEST'
                // The job form has no work items; leftover rows from an earlier form must not be sent.
                ? { ...form, tasks: undefined }
                : form
      const request = await submitRequest(type, requestData)
      // The details page shows a "Request submitted" alert for this flag.
      window.location.replace(`/requester/requests/${request.id}?submitted=1`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request submission failed. Please try again.')
      void refreshIdentity()
    } finally {
      setSaving(false)
    }
  }

  const equipmentRows = (form.equipment ?? []) as FormRow[]
  const chosenVenue = venueOptions.find((option) => option.id === String(form.venueChoice || ''))
  if (!type) {
    return <div><a href="/requester/request-center" className="text-sm font-extrabold text-blue-700 hover:underline">Back to Request Center</a></div>
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
          <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-white/10 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {unifiedItemRequest ? 'Item request' : 'New school request'}</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{unifiedItemRequest ? 'Request item for issuance' : REQUEST_TYPE_LABELS[type]}</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">{unifiedItemRequest || type === 'PURCHASE_REQUISITION' ? 'Request department items. GSO checks stock and decides whether to issue or purchase them.' : type === 'BORROWING' ? 'Borrow reusable items and confirm when you will return them.' : type === 'JOB_REQUEST' ? 'Choose a category and tell us where the problem is.' : 'Complete the form below. GSO will review your request.'}</p></div>
        </section>
        <a href="/requester/request-center" className="inline-flex items-center gap-2 text-xs font-extrabold text-blue-700 hover:underline">← Request Center</a>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {(type === 'BORROWING' || type === 'PURCHASE_REQUISITION') && <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5"><ProgressPath steps={type === 'BORROWING' ? ['Items', 'Borrow details', 'Review'] : ['Items', 'Details', 'Review']} current={(type === 'BORROWING' ? borrowingCurrentStep : requestCurrentStep) - 1} /></section>}
          {type === 'BORROWING' && <>
            <section aria-labelledby="borrow-items-step-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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

            {selectedItems.length > 0 && <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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

            <section aria-labelledby="borrow-details-step-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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

            {borrowingDetailsAreComplete && <section aria-labelledby="borrow-review-step-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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

          {type === 'FACILITY_USE' && <section className={formCardClass}>
            <h2 className="text-lg font-black tracking-tight">Permit to use school facilities</h2>
            <p className="mt-1 text-xs text-slate-500">Facility approval is subject to venue availability and school approval.</p>
            {!facilityVenues && !facilityListError && <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-500">Loading venues…</p>}
            {facilityListError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">{facilityListError}</p>}
            <div className="mt-5 space-y-4">
              <FormGroup title="Activity">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Department / year & section / organization"><input className={inputClass} value={form.departmentOrganization} onChange={(event) => setField('departmentOrganization', event.target.value)} required /></Field>
                  <Field label="Activity"><input className={inputClass} value={form.activity} onChange={(event) => setField('activity', event.target.value)} required /></Field>
                  <Field label="Nature of activity"><select className={inputClass} value={form.activityType} onChange={(event) => setField('activityType', event.target.value)}><option value="CURRICULAR">Curricular</option><option value="CO_CURRICULAR">Co-curricular</option><option value="OTHER">Others</option></select></Field>
                  <Field label="How many participants?"><input className={inputClass} type="number" min="1" step="1" inputMode="numeric" placeholder="An estimate is fine, e.g. 50" value={form.participants} onChange={(event) => setField('participants', event.target.value)} /></Field>
                  {form.activityType === 'OTHER' && <div className="sm:col-span-2"><Field label="Please specify the nature of activity"><input className={inputClass} value={form.otherActivityType} onChange={(event) => setField('otherActivityType', event.target.value)} required /></Field></div>}
                  <div className="sm:col-span-2"><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} required /></Field></div>
                </div>
              </FormGroup>

              <FormGroup title="Schedule and venue" hint="Pick a venue from the list. Choose a lab or Others to type the exact room.">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Date needed"><input className={inputClass} type="date" min={today()} value={form.date} onChange={(event) => setField('date', event.target.value)} required /></Field>
                  <Field label="Start time" hint={facilityScheduleProblem(String(form.date || ''), String(form.startTime || ''), String(form.endTime || '')) || undefined}><input className={inputClass} type="time" min={form.date === today() ? nowTime() : undefined} value={form.startTime} onChange={(event) => setField('startTime', event.target.value)} required /></Field>
                  <Field label="End time"><input className={inputClass} type="time" min={form.startTime || undefined} value={form.endTime} onChange={(event) => setField('endTime', event.target.value)} required /></Field>
                  <div className={chosenVenue?.requiresDetail ? 'sm:col-span-2' : 'sm:col-span-3'}><Field label="Venue"><select className={inputClass} value={String(form.venueChoice || '')} onChange={(event) => setVenue(event.target.value, String(form.venueDetail || ''))} required><option value="">Select venue</option>{venueOptions.map((option) => <option key={option.id} value={option.id}>{option.requiresDetail ? `${option.label} (specify)` : option.label}</option>)}</select></Field></div>
                  {chosenVenue?.requiresDetail && <Field label={chosenVenue.detailLabel ?? 'Details'}><input className={inputClass} value={String(form.venueDetail || '')} onChange={(event) => setVenue(chosenVenue.id, event.target.value)} maxLength={150} required /></Field>}
                </div>
              </FormGroup>

              <FormGroup title="Items needed" hint="Optional. Tick the box only if this activity needs equipment or materials." action={form.wantsItems === true ? <button type="button" onClick={() => addRow('equipment', { category: '', itemName: '', itemId: '', quantity: 1 })} className={addButtonClass}>+ Add item</button> : undefined}>
                <label className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-bold text-slate-800">
                  <input type="checkbox" checked={form.wantsItems === true} onChange={(event) => setForm((current) => ({ ...current, wantsItems: event.target.checked, equipment: event.target.checked ? current.equipment : [] }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
                  <span>This activity needs items from the Item Master<span className="mt-0.5 block text-xs font-medium text-slate-500">Leave this unticked if you need no equipment or materials.</span></span>
                </label>
                {form.wantsItems === true && (
                  <>
                    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-amber-900">Borrowed items must be returned after the event. Return them to GSO as soon as the activity ends.</p>
                    {catalogError && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{catalogError}</p>}
                    {equipmentRows.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-500">No items added yet.</p> : <div className="space-y-3">{equipmentRows.map((item, index) => {
                      const category = String(item.category || '')
                      const itemName = String(item.itemName || '')
                      const itemId = String(item.itemId || '')
                      const stock = facilityStockFor(item)
                      const short = Boolean(stock && Number(item.quantity) > stock.inStock)
                      return <div key={index} className={`rounded-xl border bg-white p-3 sm:p-4 ${short ? 'border-rose-300' : 'border-slate-200'}`}>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Category"><select className={inputClass} value={category} onChange={(event) => setEquipmentRow(index, { category: event.target.value, itemName: '', itemId: '' })} required><option value="">Select category</option>{facilityCategories.map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
                          <Field label="Item name"><select className={inputClass} value={itemName} disabled={!category} onChange={(event) => setEquipmentRow(index, { itemName: event.target.value, itemId: '' })} required><option value="">Select item name</option>{facilityNamesFor(category).map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>
                        </div>
                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          <div className="min-w-0 flex-1"><Field label="Item description"><select className={inputClass} value={itemId} disabled={!itemName} onChange={(event) => setEquipmentRow(index, { itemId: event.target.value })} required><option value="">Select description</option>{facilityModelsFor(category, itemName).map((model) => <option key={model.id} value={model.id} disabled={model.inStock === 0 || equipmentRows.some((other, otherIndex) => otherIndex !== index && String(other.itemId) === model.id)}>{`${model.label} · ${model.inStock > 0 ? `${model.inStock} in stock` : 'out of stock'}`}</option>)}</select></Field></div>
                          <div className="w-36"><Field label="Quantity"><input className={`${inputClass} ${short ? 'border-rose-400 ring-2 ring-rose-100' : ''}`} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('equipment', index, 'quantity', event.target.value)} aria-invalid={short} required /></Field></div>
                          <button type="button" onClick={() => removeRow('equipment', index)} className={removeButtonClass}>Remove</button>
                        </div>
                        {short && stock && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] font-bold text-rose-700">{stock.inStock > 0 ? `Only ${stock.inStock} in stock. Lower the quantity.` : 'Out of stock. Choose another item.'}</p>}
                      </div>
                    })}</div>}
                  </>
                )}
              </FormGroup>
            </div>
          </section>}

          {type === 'JOB_REQUEST' && <section className={formCardClass}>
            <h2 className="text-lg font-black tracking-tight">Job / Service Request</h2>
            <div className="mt-5 space-y-4">
              <FormGroup title="Service routing">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Service category">
                    <select
                      className={inputClass}
                      value={String(form.serviceCategory || '')}
                      onChange={(event) => {
                        const option = serviceCategoryByValue.get(event.target.value)
                        setForm((current) => ({ ...current, serviceCategory: event.target.value, serviceRoute: option?.route || 'GSO' }))
                      }}
                      required
                    >
                      <option value="">Choose a category</option>
                      <optgroup label="Facilities service">
                        {serviceCategoryOptions.filter((option) => option.group === 'Facilities').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </optgroup>
                      <optgroup label="Computer Laboratory / ITSS Support">
                        {serviceCategoryOptions.filter((option) => option.group === 'IT support').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </optgroup>
                    </select>
                  </Field>
                  <Field label="Target date">
                    <input className={inputClass} type="date" min={today()} value={String(form.requiredDate || '')} onChange={(event) => setField('requiredDate', event.target.value)} required />
                  </Field>
                </div>
                {form.serviceCategory === 'OTHERS' && (
                  <Field label="Describe the service">
                    <input className={inputClass} value={String(form.serviceOther || '')} onChange={(event) => setField('serviceOther', event.target.value)} required maxLength={200} placeholder="e.g. Replace the school bell in Building B" />
                  </Field>
                )}
                {selectedServiceCategory?.urgent && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-amber-900"><span className="font-extrabold">Urgent:</span> for an immediate danger, follow the campus emergency procedure first.</p>}
              </FormGroup>

              <FormGroup title="Request details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Department / office"><input className={inputClass} value={String(form.departmentOrganization || '')} onChange={(event) => setField('departmentOrganization', event.target.value)} required placeholder="e.g. College of Education" /></Field>
                  <Field label="Location"><input className={inputClass} value={String(form.location || '')} onChange={(event) => setField('location', event.target.value)} required placeholder="e.g. Main Building, Room 204" /></Field>
                  <div className="sm:col-span-2"><Field label="What needs attention?"><textarea className={textareaClass} value={String(form.purpose || '')} onChange={(event) => setField('purpose', event.target.value)} required maxLength={2000} placeholder="e.g. Three lights near the entrance flicker." /></Field></div>
                </div>
              </FormGroup>

            </div>
          </section>}

          {type === 'PURCHASE_REQUISITION' && <>
            <section aria-labelledby="request-items-step-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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
                    <section className="mt-3 rounded-xl border border-blue-100 bg-white p-3" aria-label={`Assignment for item ${index + 1}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-800">Assign every requested unit</h3>
                          <p className="mt-1 max-w-2xl text-[0.68rem] leading-relaxed text-slate-500">Choose the room where each group of units will be kept. You stay accountable as the requesting Employee Head.</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${Number(item.quantity) > 0 && plannedQuantity === Number(item.quantity) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{plannedQuantity} of {Number(item.quantity) || 0} assigned</span>
                      </div>
                      {plannedRecipients.length === 0 && <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
                        <p className="text-xs font-bold text-slate-700">No room yet</p>
                        <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-500">Add the room where the {Number(item.quantity) || 0} unit(s) will be kept.</p>
                      </div>}
                      {plannedRecipients.length > 0 && <div className="mt-3 space-y-3">
                        {plannedRecipients.map((recipient, recipientIndex) => {
                          const otherAllocated = plannedRecipients.reduce((sum, entry, currentIndex) => sum + (currentIndex === recipientIndex ? 0 : Number(entry.quantity || 0)), 0)
                          const maxRecipientQuantity = Math.max(Number(item.quantity || 0) - otherAllocated, 1)
                          return <div key={`${index}-${recipientIndex}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <p className="text-xs font-extrabold text-slate-800">Room {recipientIndex + 1}</p>
                              <button type="button" onClick={() => removePlannedRecipient(index, recipientIndex)} className="rounded-lg px-2.5 py-1.5 text-[0.68rem] font-extrabold text-rose-600 transition hover:bg-rose-50">Remove room</button>
                            </div>

                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <Field label="Units in this room"><input className={inputClass} type="number" min="1" max={maxRecipientQuantity} step="1" value={recipient.quantity} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'quantity', event.target.value)} required /></Field>
                              <Field label="Building / unit"><input className={inputClass} value={recipient.building} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'building', event.target.value)} maxLength={100} placeholder="e.g. College of Accountancy" required /></Field>
                              <Field label="Room / exact area"><input className={inputClass} value={recipient.room} onChange={(event) => updatePlannedRecipient(index, recipientIndex, 'room', event.target.value)} maxLength={100} placeholder="e.g. Room 201" required /></Field>
                            </div>
                            <p className="mt-1.5 text-[0.68rem] text-slate-500">Up to {maxRecipientQuantity} unit(s) can still go to this room.</p>

                            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[0.68rem] leading-relaxed text-emerald-900"><span className="font-extrabold">Accountable: {verifiedEmployeeName || 'Requesting department head'}</span> (Department Head). You stay responsible for these units.</p>
                          </div>
                        })}
                      </div>}
                      {plannedQuantity > Number(item.quantity) && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] font-bold text-rose-700">Assigned quantities exceed the requested quantity. Reduce the assignments before submitting.</p>}
                      {unplannedQuantity > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[0.68rem] font-semibold text-amber-800">{plannedRecipients.length > 0 ? `${unplannedQuantity} unit(s) still need a room.` : `Assign all ${Number(item.quantity) || 0} requested unit(s) to a room.`} GSO cannot complete missing assignments for you.</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => addPlannedRecipient(index)} disabled={plannedQuantity >= Number(item.quantity || 0)} className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">{plannedRecipients.length ? '+ Add another room' : '+ Assign a room'}</button>
                        {plannedRecipients.length > 0 && plannedQuantity === Number(item.quantity) && <span className="text-[0.68rem] font-semibold text-emerald-700">All units have a room.</span>}
                      </div>
                    </section>
                  </div>
                })}
              </div>
            </section>

            <section aria-labelledby="request-details-step-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
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
                {requestUrgency === 'Urgent' && <div className="sm:col-span-2"><Field label="Why is this urgent?"><input className={inputClass} value={String(form.urgentReason || '')} onChange={(event) => setField('urgentReason', event.target.value)} maxLength={500} required placeholder="When is it needed, and why?" /></Field><p className="mt-1.5 text-[0.65rem] font-medium text-amber-700">Urgent requests still follow the item's approval rules.</p></div>}
                <div className="sm:col-span-2">
                  <Field label="Purpose"><select className={inputClass} value={requestPurpose} onChange={(event) => { setField('purpose', event.target.value); if (event.target.value !== 'Others') setField('otherPurpose', '') }} required><option value="">Select purpose</option>{purchasePurposeOptions.map(([value, label]) => <option key={value} value={label}>{label}</option>)}</select></Field>
                  {requestPurpose === 'Others' && <div className="mt-3"><Field label="Specify the purpose"><input className={inputClass} value={String(form.otherPurpose || '')} onChange={(event) => setField('otherPurpose', event.target.value)} required maxLength={1900} placeholder="Describe the other purpose" /></Field></div>}
                </div>
                <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                  <input type="checkbox" checked={Boolean(form.requesterCertification)} onChange={(event) => setField('requesterCertification', event.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                  <span className="text-xs font-semibold leading-relaxed text-slate-700">I confirm this request is accurate and needed by my department.</span>
                </label>
              </div> : <div role="status" className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center"><p className="max-w-sm text-sm font-medium leading-relaxed text-slate-600">Complete every item's details and assign its full quantity in Step 1 to continue.</p></div>}
            </section>

            {requestDetailsAreComplete && <section aria-labelledby="request-review-step-title" className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 sm:p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
              <RequestStepHeader step={3} status={requestStepStatus(3)} titleId="request-review-step-title" title="Review request" description="Review the assigned employees and rooms before submitting to GSO Head.">
                <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-800">{requestItems.length} item{requestItems.length === 1 ? '' : 's'} · {requestQuantityCount} units</span>
              </RequestStepHeader>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-slate-100 px-3.5 py-2.5"><span className="text-xs font-bold text-slate-700">Requester</span><span className="text-right text-sm font-extrabold text-slate-900">{verifiedEmployeeName || identity?.accountName || 'Not verified yet'}{verifiedDepartment ? <span className="mt-0.5 block text-xs font-semibold text-slate-600">{verifiedDepartment}</span> : null}</span></div>
               <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-100 px-3.5">
                 {requestItems.map((item, index) => {
                   const plannedRecipients = plannedRecipientsFor(item)
                    return <li key={`${item.category}-${item.itemName}-${index}`} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="wrap-break-word text-sm font-extrabold text-slate-900">{String(item.itemName || 'Unnamed item')}</p><p className="mt-0.5 text-xs font-semibold text-slate-600">{String(item.category || 'No category')} · Qty {item.quantity}</p></div><span className="shrink-0 text-xs font-bold text-slate-500">{item.catalogItemId === '__GENERAL__' ? 'New item' : 'Catalog item'}</span></div><p className="mt-1.5 wrap-break-word text-xs leading-relaxed text-slate-600">{String(item.description || 'No specifications')}</p><div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5"><p className="text-[0.62rem] font-extrabold uppercase tracking-wide text-blue-700">Final item assignment</p>{plannedRecipients.map((recipient, recipientIndex) => <p key={recipientIndex} className="mt-1 text-[0.68rem] font-semibold text-slate-700"><span className="font-extrabold">Assigned room</span> · {verifiedEmployeeName || 'Department Head'} · Head accountable · {recipient.quantity} · {[recipient.building, recipient.room].filter(Boolean).join(' · ') || 'Location not set'}</p>)}</div></li>
                 })}
              </ul>
              <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 px-3.5">
                {[
                  ['Request date', requestDateLabel],
                  ['Date needed', String(form.requiredDate || 'Not set')],
                  ['Urgency', requestUrgency],
                  ['Purpose', requestPurposeSummary],
                ].map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-4 py-2"><dt className="text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt><dd className="text-right wrap-break-word text-xs font-semibold text-slate-700">{value}</dd></div>)}
              </dl>
              {requestUrgency === 'Urgent' && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900"><span className="font-extrabold">Urgent reason: </span>{requestUrgentReason}</p>}
              {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700">{error}</p>}
            </section>}
          </>}

          {type === 'ISSUANCE_REQUEST' && <section className={formCardClass}>
            <h2 className="text-lg font-black tracking-tight">Item issuance request</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">For items that are not in the borrowing catalog, or that you need to keep long term. GSO checks stock; once issued, it shows in My Issued Items.</p>
            <div className="mt-5 space-y-4">
              <FormGroup title="Request details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Needed date"><input className={inputClass} type="date" min={today()} value={form.neededDate} onChange={(event) => setField('neededDate', event.target.value)} required /></Field>
                  <div className="sm:col-span-2"><Field label="Purpose"><textarea className={textareaClass} value={form.purpose} onChange={(event) => setField('purpose', event.target.value)} placeholder="Where and why you need it" required /></Field></div>
                  <div className="sm:col-span-2"><Field label="Remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} /></Field></div>
                </div>
              </FormGroup>

              <FormGroup title="Requested items" action={<button type="button" onClick={() => addRow('items', { quantity: 1, description: '' })} className={addButtonClass}>+ Add item</button>}>
                <div className="space-y-3">{(form.items ?? []).map((item: FormRow, index: number) => <div key={index} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Item {index + 1}</span>
                    {(form.items?.length ?? 0) > 1 && <button type="button" onClick={() => removeRow('items', index)} className={removeButtonClass}>Remove</button>}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                    <Field label="Quantity"><input className={inputClass} type="number" min="1" value={item.quantity} onChange={(event) => updateRow('items', index, 'quantity', event.target.value)} required /></Field>
                    <Field label="Description / specifications"><textarea className={textareaClass} value={item.description} onChange={(event) => updateRow('items', index, 'description', event.target.value)} required maxLength={1000} /></Field>
                  </div>
                </div>)}</div>
              </FormGroup>
            </div>
          </section>}

          {type === 'LOSS_DAMAGE_REPORT' && <section className={formCardClass}>
            <h2 className="text-lg font-black tracking-tight">Losses and damages report</h2>
            <p className="mt-1 text-xs text-slate-500">This submits an incident for review. It does not automatically assign fault or a charge.</p>
            <div className="mt-5 space-y-4">
              <FormGroup title="Incident">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Incident type"><select className={inputClass} value={form.incidentType} onChange={(event) => {
                    const nextType = event.target.value
                    setField('incidentType', nextType)
                  }}><option value="LOST">Lost</option><option value="DAMAGED">Damaged</option></select></Field>
                  <Field label="Date of incident"><input className={inputClass} type="date" max={today()} value={form.incidentDate} onChange={(event) => setField('incidentDate', event.target.value)} required /></Field>
                  <Field label="Key area / location"><input className={inputClass} value={form.keyArea} onChange={(event) => setField('keyArea', event.target.value)} required /></Field>
                  <Field label="Reported / responsible person"><input className={inputClass} value={form.responsiblePerson} onChange={(event) => setField('responsiblePerson', event.target.value)} required /></Field>
                </div>
              </FormGroup>

              <FormGroup title="Affected property" hint="Choose the item and how many were affected. If you do not know the asset tag of a unit, do not guess.">
                {issuedError && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{issuedError}</p>}
                {heldGroups.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                  <span>Group by</span>
                  {(['room', 'person'] as const).map((mode) => <button key={mode} type="button" aria-pressed={lossGroupBy === mode} onClick={() => setLossGroupBy(mode)} className={`rounded-full px-3 py-1.5 transition ${lossGroupBy === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{mode === 'room' ? 'Assigned room' : 'Assigned person'}</button>)}
                </div>}
                {issuedBatches === null && !issuedError
                  ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-500">Loading your issued items…</p>
                  : heldGroups.length === 0
                    ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-500">No items are issued to you right now.</p>
                    : <div className="space-y-4">{heldSections.map(([label, groups]) => <div key={label}>
                      <p className="mb-2 text-xs font-extrabold text-slate-700">{label} <span className="font-semibold text-slate-500">· {groups.length} item{groups.length === 1 ? '' : 's'}</span></p>
                      <div className="grid gap-3 sm:grid-cols-2">{groups.map((group) => {
                      const count = countIn(group.key)
                      const lost = form.incidentType === 'LOST'
                      // Asset tags are optional: a group with picked tags is counted by those tags; otherwise GSO identifies the units.
                      const knownMode = !group.stock && selectedIn(group.key).some((row) => Boolean(row.tagCode))
                      return <div key={group.key} className={`rounded-xl border-2 bg-white p-3 transition ${count > 0 ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-extrabold text-slate-900">{group.name}</p>
                            <p className="text-xs text-slate-500">{group.total} {group.unit} issued to you{lossGroupBy === 'room' ? ` · ${group.person || 'no assignee recorded'}` : ` · ${group.place || 'location not recorded'}`}</p>
                          </div>
                          {knownMode
                            ? <span className="shrink-0 text-xs font-bold text-slate-600">{count} selected</span>
                            : <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-600">
                              {lost ? 'How many were lost?' : 'How many affected?'}
                              <input type="number" min={0} max={group.total} value={count} onChange={(event) => setGroupCount(group, Number(event.target.value) || 0)} className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                            </label>}
                        </div>
                        {!group.stock && <button type="button" onClick={() => setOpenGroupKey(group.key)} className="mt-2 text-xs font-extrabold text-blue-700 hover:text-blue-900">{knownMode ? `${countIn(group.key)} of ${group.total} selected · ` : ''}Choose asset tags (if you know them)</button>}
                        {!group.stock && !knownMode && <p className="mt-1.5 text-[0.68rem] leading-relaxed text-slate-500">GSO identifies the exact unit during review.</p>}
                      </div>
                    })}</div>
                    </div>)}</div>}

                {openTagGroup && <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onClick={() => setOpenGroupKey('')}>
                  <section role="dialog" aria-modal="true" aria-labelledby="asset-tag-picker-title" onClick={(event) => event.stopPropagation()} className="flex max-h-[94vh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30">
                    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
                      <div className="min-w-0">
                        <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Asset tags</p>
                        <h2 id="asset-tag-picker-title" className="mt-0.5 truncate text-base font-black text-slate-900 sm:text-lg">{openTagGroup.name}</h2>
                        <p className="mt-1 text-xs text-slate-600">Select the exact unit(s) by asset tag.</p>
                      </div>
                      <button type="button" onClick={() => setOpenGroupKey('')} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">Close</button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-8 sm:py-6">
                      <div className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <h3 className="text-sm font-extrabold text-slate-900">{countIn(openTagGroup.key)} of {openTagGroup.total} selected</h3>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => selectAllUnits(openTagGroup)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50">Select all</button>
                            <button type="button" onClick={() => setGroupCount(openTagGroup, 0)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50">Clear</button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {[...openTagGroup.units].sort((a, b) => a.itemNumber - b.itemNumber || a.code.localeCompare(b.code)).map((held) => {
                            const checked = selectedIn(openTagGroup.key).some((row) => row.key === held.key)
                            return <label key={held.key} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition ${checked ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleUnit(openTagGroup, held)} className="h-4 w-4 shrink-0 accent-blue-600" />
                              <span className="min-w-0">
                        <span className="block text-[0.65rem] font-extrabold text-blue-700">ITEM {held.itemNumber}</span>
                        <span className="block break-all font-mono text-xs font-bold text-slate-900">{held.code}</span>
                      </span>
                            </label>
                          })}
                        </div>
                      </div>
                    </div>
                    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
                      <p className="text-xs font-semibold text-slate-500">Unselected units are not reported.</p>
                      <button type="button" onClick={() => setOpenGroupKey('')} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">Done</button>
                    </footer>
                  </section>
                </div>}

                {selectedTotal > 0 && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">In this report · {selectedTotal} selected</p>
                  <ul className="mt-2 space-y-1.5">
                    {heldGroups.filter((group) => countIn(group.key) > 0).map((group) => <li key={group.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-bold text-slate-800">{group.name} <span className="font-semibold text-slate-500">× {countIn(group.key)}</span></span>
                      <button type="button" onClick={() => setGroupCount(group, 0)} className="shrink-0 text-xs font-extrabold text-rose-600 hover:text-rose-800">Remove</button>
                    </li>)}
                  </ul>
                </div>}
              </FormGroup>

              <Field label="Incident details / remarks"><textarea className={textareaClass} value={form.remarks} onChange={(event) => setField('remarks', event.target.value)} required /></Field>
            </div>
          </section>}

          {type !== 'BORROWING' && error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
          {type === 'BORROWING' && <div className="flex justify-end"><a href="/requester/request-center" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Cancel</a></div>}
          {type !== 'BORROWING' && <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><a href="/requester/request-center" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-xs font-extrabold text-slate-600 hover:bg-slate-50">Cancel</a><button disabled={saving || identityLoading || identity?.status !== 'Verified' || (type === 'PURCHASE_REQUISITION' && !requestDetailsAreComplete) || (type === 'FACILITY_USE' && !facilityVenues)} type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Submitting…' : identity?.status !== 'Verified' ? 'Verification required' : type === 'PURCHASE_REQUISITION' ? 'Submit to GSO Head' : 'Submit request'}</button></div>}
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
