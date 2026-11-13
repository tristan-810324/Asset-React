import { useEffect, useMemo, useState } from 'react'
import {
  listInventoryCategories,
  listInventoryItems,
  type InventoryCategory,
  type InventoryChangeRecord,
  type InventoryItemRecord,
} from '../gso/inventoryApi'

const conditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']
const statuses = ['Available', 'Issued', 'Reserved', 'Borrowed', 'Pending Approval']

function trackingLabel(item: InventoryItemRecord) {
  if (item.trackingMode === 'individual') return 'Individually tracked item'
  return item.issueBehavior === 'consumable' ? 'Consumable stock' : 'Reusable quantity stock'
}

function statusTone(status: string) {
  if (status === 'Available') return 'bg-emerald-50 text-emerald-700'
  if (status === 'Issued' || status === 'Borrowed') return 'bg-blue-50 text-blue-700'
  if (status === 'Reserved' || status === 'Pending Approval') return 'bg-violet-50 text-violet-700'
  return 'bg-amber-50 text-amber-800'
}

function conditionTone(condition: string) {
  if (condition === 'New' || condition === 'Good') return 'bg-sky-50 text-sky-700'
  if (condition === 'Fair' || condition === 'Under Maintenance') return 'bg-amber-50 text-amber-700'
  if (condition === 'Needs Repair' || condition === 'Unserviceable') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

function custodianLabel(item: InventoryItemRecord) {
  if (item.assignedTo?.trim()) return item.assignedTo
  if (item.condition === 'Needs Repair') return 'For Repair'
  if (item.condition === 'Under Maintenance') return 'Under Maintenance'
  if (item.condition === 'Unserviceable' || item.condition === 'Retired') return '—'
  return 'In Storage'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0)
  return `PHP ${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)}`
}

function formatTimestamp(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return 'Date not recorded'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

function changeSummary(change: InventoryChangeRecord) {
  if (change.action === 'issued') return 'Item issued'
  if (change.action === 'returned') return 'Item returned'
  if (change.action === 'employee_profile_updated') return 'Employee profile updated'
  const changedFields = [...new Set([...Object.keys(change.oldValues), ...Object.keys(change.newValues)])]
    .filter((field) => JSON.stringify(change.oldValues[field]) !== JSON.stringify(change.newValues[field]))
    .map((field) => field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()))
  return changedFields.length ? `Updated ${changedFields.join(', ')}` : 'Inventory record updated'
}

function escapeHTML(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
}

function downloadFile(fileName: string, contents: BlobPart[], mimeType: string) {
  const file = new Blob(contents, { type: mimeType })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function buildFilterSummary(filters: { date: string; category: string; itemName: string; condition: string; tracking: string; search: string }) {
  const activeFilters = [
    filters.date ? `Acquired: ${formatDate(filters.date)}` : '',
    filters.category !== 'all' ? `Category: ${filters.category}` : '',
    filters.itemName !== 'all' ? `Item: ${filters.itemName}` : '',
    filters.condition !== 'all' ? `Condition / status: ${filters.condition}` : '',
    filters.tracking !== 'all' ? `Tracking: ${filters.tracking}` : '',
    filters.search ? `Search: ${filters.search}` : '',
  ].filter(Boolean)
  return activeFilters.length ? activeFilters.join(' · ') : 'All inventory records'
}

function exportInventoryCsv(items: InventoryItemRecord[], filters: Parameters<typeof buildFilterSummary>[0]) {
  const rows = [
    ['Item Description', 'Item Name', 'Asset Code', 'Category', 'Tracking Mode', 'Date Acquired', 'Time Acquired', 'Unit Cost', 'Total Acquisition Cost', 'Current Value', 'Available Quantity', 'Total Quantity', 'Unit', 'Condition', 'Assigned / Custodian', 'Storage Location', 'Status', 'Active Filters'],
    ...items.map((item) => [
      item.description || item.itemName,
      item.itemName,
      item.itemCode,
      item.category,
      trackingLabel(item),
      formatDate(item.dateAcquired),
      item.timeAcquired || '',
      item.unitCost,
      item.acquisitionCost,
      item.currentValue ?? '',
      item.availableQuantity,
      item.quantity,
      item.unitOfMeasure,
      item.condition,
      custodianLabel(item),
      item.storageLocation,
      item.status,
      buildFilterSummary(filters),
    ]),
  ]
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const reportDate = new Date().toISOString().slice(0, 10)
  downloadFile(`GSO_Inventory_Master_List_${reportDate}.csv`, ['\uFEFF', csv], 'text/csv;charset=utf-8')
}

function exportInventoryWord(items: InventoryItemRecord[], filters: Parameters<typeof buildFilterSummary>[0]) {
  const reportDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date())
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const availableQuantity = items.reduce((sum, item) => sum + Number(item.availableQuantity || 0), 0)
  const rows = items.map((item, index) => `<tr style="background:${index % 2 ? '#f8fafc' : '#ffffff'};page-break-inside:avoid;">
    <td><strong>${escapeHTML(item.description || item.itemName)}</strong><br><span>${escapeHTML(item.itemName)} · ${escapeHTML(item.itemCode)}</span><br><span>${escapeHTML(item.category)} · ${escapeHTML(trackingLabel(item))}</span></td>
    <td>${escapeHTML(formatDate(item.dateAcquired))}<br><span>${escapeHTML(item.timeAcquired || 'Time not recorded')}</span></td>
    <td>Unit ${escapeHTML(formatMoney(item.unitCost))}<br><span>Total ${escapeHTML(formatMoney(item.acquisitionCost))}</span></td>
    <td><strong>${escapeHTML(String(item.availableQuantity))} available / ${escapeHTML(String(item.quantity))} ${escapeHTML(item.unitOfMeasure)}</strong><br><span>${escapeHTML(item.condition)}</span></td>
    <td>${escapeHTML(custodianLabel(item))}<br><span>${escapeHTML(item.storageLocation || 'Location not recorded')}</span></td>
    <td>${escapeHTML(item.status)}</td>
  </tr>`).join('')
  const reportHTML = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>GSO Inventory Master List</title><style>@page Section1{size:11in 8.5in;mso-page-orientation:landscape;margin:.4in}div.Section1{page:Section1}body{font-family:Arial,sans-serif;color:#172033;font-size:9pt}table{width:100%;border-collapse:collapse}thead{display:table-header-group}th{background:#09244a;color:white;text-align:left;padding:8px;border:1px solid #09244a}td{padding:7px;border:1px solid #dbe3ef;vertical-align:top}td span{font-size:8pt;color:#64748b}</style></head><body><div class="Section1"><h1 style="color:#09244a;margin-bottom:4px">Full Inventory Master List</h1><p style="color:#64748b;margin-top:0">Generated ${escapeHTML(reportDate)} · ${escapeHTML(buildFilterSummary(filters))}</p><table style="margin:14px 0"><tr><td><strong>${items.length}</strong><br>Records</td><td><strong>${totalQuantity.toLocaleString('en-PH')}</strong><br>Total stock</td><td><strong>${availableQuantity.toLocaleString('en-PH')}</strong><br>Available units</td></tr></table><table><thead><tr><th>Item description</th><th>Acquired</th><th>Value</th><th>Stock / condition</th><th>Assigned / custodian</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No inventory records match the selected filters.</td></tr>'}</tbody></table></div></body></html>`
  downloadFile(`GSO_Inventory_Master_List_${new Date().toISOString().slice(0, 10)}.doc`, ['\uFEFF', reportHTML], 'application/msword;charset=utf-8')
}

function InventoryItemDetails({ item, onClose }: { item: InventoryItemRecord; onClose: () => void }) {
  const history = [...item.changeHistory].sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="inventory-item-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
        <div className="min-w-0"><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-600">Inventory item</p><h2 id="inventory-item-title" className="mt-1 truncate text-lg font-black text-slate-900">{item.description || item.itemName}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{item.itemCode} · {item.category}</p></div>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Close</button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Item details">
          {[
            ['Item name', item.itemName],
            ['Description', item.description || 'Not provided'],
            ['Tracking mode', trackingLabel(item)],
            ['Date acquired', formatDate(item.dateAcquired)],
            ['Unit cost', formatMoney(item.unitCost)],
            ['Total acquisition cost', formatMoney(item.acquisitionCost)],
            ['Current value', formatMoney(item.currentValue)],
            ['Stock', `${item.availableQuantity} available / ${item.quantity} ${item.unitOfMeasure}`],
            ['Condition', item.condition],
            ['Assigned / custodian', custodianLabel(item)],
            ['Storage location', item.storageLocation || 'Not recorded'],
            ['Status', item.status],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5"><p className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1.5 wrap-break-word text-xs font-bold text-slate-800">{value}</p></article>)}
        </section>
        <section className="rounded-2xl border-2 border-slate-300/80 bg-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Condition and activity history</h3><p className="mt-1 text-xs text-slate-500">Recorded changes for this inventory item.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-extrabold text-slate-600">{history.length} record{history.length === 1 ? '' : 's'}</span></div>
          {history.length ? <ol className="mt-4 space-y-3">{history.map((change, index) => <li key={`${change.changedAt}-${index}`} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" /><div className="min-w-0"><p className="text-xs font-extrabold text-slate-800">{changeSummary(change)}</p><p className="mt-1 text-[0.68rem] font-medium text-slate-600">{change.reason || 'No additional details.'}</p><p className="mt-1 text-[0.62rem] font-semibold text-slate-400">{formatTimestamp(change.changedAt)} · {change.changedBy || 'User not recorded'}</p></div></li>)}</ol> : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-xs font-semibold text-slate-500">No condition or activity changes have been recorded.</p>}
        </section>
      </div>
    </section>
  </div>
}

export default function GsoHeadItemMaster() {
  const [items, setItems] = useState<InventoryItemRecord[]>([])
  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [itemName, setItemName] = useState('all')
  const [conditionStatus, setConditionStatus] = useState('all')
  const [trackingMode, setTrackingMode] = useState('all')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [selectedItem, setSelectedItem] = useState<InventoryItemRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([listInventoryItems(), listInventoryCategories()])
      .then(([inventory, categoryRows]) => {
        if (!active) return
        setItems(inventory)
        setCategories(categoryRows)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load inventory master data.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const availableItemNames = useMemo(() => [...new Set(items
    .filter((item) => category === 'all' || item.category === category)
    .map((item) => item.itemName)
    .filter(Boolean))].sort((left, right) => left.localeCompare(right)), [category, items])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items.filter((item) => {
      const matchesSearch = !query || [item.description, item.itemName, item.itemCode, item.category, item.storageLocation, item.assignedTo || '']
        .some((value) => value.toLocaleLowerCase().includes(query))
      const matchesCategory = category === 'all' || item.category === category
      const matchesName = itemName === 'all' || item.itemName === itemName
      const matchesConditionStatus = conditionStatus === 'all' || item.condition === conditionStatus || item.status === conditionStatus
      const matchesTracking = trackingMode === 'all'
        || (trackingMode === 'individual' && item.trackingMode === 'individual')
        || (trackingMode === 'quantity' && item.trackingMode === 'quantity')
      const matchesDate = !acquiredDate || item.dateAcquired?.slice(0, 10) === acquiredDate
      return matchesSearch && matchesCategory && matchesName && matchesConditionStatus && matchesTracking && matchesDate
    })
  }, [acquiredDate, category, conditionStatus, itemName, items, search, trackingMode])

  const exportFilters = { date: acquiredDate, category, itemName, condition: conditionStatus, tracking: trackingMode, search: search.trim() }
  return <div className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
    <section className="flex flex-col gap-5 border-b border-slate-200 px-5 py-5 sm:px-7 sm:py-6 xl:flex-row xl:items-center xl:justify-between" aria-label="Inventory report controls">
      <div className="min-w-0"><h2 className="text-lg font-black tracking-tight text-slate-900">Full Inventory Master List</h2><p className="mt-1 text-sm text-slate-500">Select a row to see its details and condition history. Exports include only the rows shown.</p><span className="mt-3 inline-flex rounded-xl bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700">{loading ? 'Loading inventory…' : `${filteredItems.length.toLocaleString('en-PH')} item${filteredItems.length === 1 ? '' : 's'} found`}</span></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-44"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-500">Filter by date</span><input type="date" value={acquiredDate} onChange={(event) => setAcquiredDate(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
        <button type="button" onClick={() => exportInventoryCsv(filteredItems, exportFilters)} disabled={loading || filteredItems.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-extrabold uppercase text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"><span aria-hidden="true">▤</span> Generate CSV</button>
        <button type="button" onClick={() => exportInventoryWord(filteredItems, exportFilters)} disabled={loading || filteredItems.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-extrabold uppercase text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"><span aria-hidden="true">▤</span> Generate Word</button>
      </div>
    </section>

    <section className="grid gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 sm:px-7" aria-label="Inventory filters">
      <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Search inventory</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Item name, code, or assignee" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
      <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setItemName('all') }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="all">All categories</option>{categories.map((row) => <option key={row.id} value={row.name}>{row.name}</option>)}</select></label>
      <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Specific item name</span><select value={itemName} onChange={(event) => setItemName(event.target.value)} disabled={category === 'all'} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"><option value="all">{category === 'all' ? 'Choose a category first' : 'All item names'}</option>{availableItemNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Condition / status</span><select value={conditionStatus} onChange={(event) => setConditionStatus(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="all">All conditions &amp; statuses</option><optgroup label="Condition">{conditions.map((value) => <option key={value} value={value}>{value}</option>)}</optgroup><optgroup label="Status">{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</optgroup></select></label>
      <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Tracking mode</span><select value={trackingMode} onChange={(event) => setTrackingMode(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="all">All stock types</option><option value="individual">Individually tracked items</option><option value="quantity">Track as quantity</option></select></label>
    </section>

    {error && <p role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    <div className="max-h-[70vh] overflow-auto">
      <table className="min-w-265 w-full text-left">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-400"><tr><th className="px-5 py-4">Item description</th><th className="px-4 py-4">Acquired</th><th className="px-4 py-4">Value</th><th className="px-4 py-4">Stock / condition</th><th className="px-4 py-4">Assigned / custodian</th><th className="px-4 py-4">Status</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? <tr><td colSpan={6} className="px-5 py-14 text-center text-sm font-semibold text-slate-500">Loading inventory…</td></tr>
            : error ? null
              : filteredItems.length === 0 ? <tr><td colSpan={6} className="px-5 py-14 text-center"><p className="text-sm font-extrabold text-slate-700">No inventory items found</p><p className="mt-1 text-xs text-slate-500">Try changing or clearing the selected filters.</p></td></tr>
                : filteredItems.map((item) => <tr key={item.id} className="cursor-pointer transition hover:bg-blue-50/45" onClick={() => setSelectedItem(item)}>
                  <td className="max-w-90 px-5 py-4"><button type="button" onClick={() => setSelectedItem(item)} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-yellow-400 bg-[#102f78] text-[0.65rem] font-black text-white">{item.itemName.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'IT'}</span><span className="min-w-0"><span className="block line-clamp-2 text-xs font-extrabold leading-relaxed text-slate-900">{item.description || item.itemName}</span><span className="mt-1 block truncate text-xs font-bold text-blue-700">{item.itemName}</span><span className="mt-1 block text-[0.65rem] font-semibold text-slate-400">{item.itemCode}</span><span className="mt-1 flex flex-wrap gap-1"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-500">{item.category}</span><span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[0.58rem] font-bold text-blue-700">{trackingLabel(item)}</span></span></span></span></button></td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-slate-700">{formatDate(item.dateAcquired)}<span className="mt-1 block text-[0.65rem] font-medium text-slate-400">{item.timeAcquired || 'Time not recorded'}</span></td>
                  <td className="whitespace-nowrap px-4 py-4"><span className="block text-xs font-bold text-slate-700">Unit {formatMoney(item.unitCost)}</span><span className="mt-1 block text-[0.65rem] text-slate-500">Acquired {formatMoney(item.acquisitionCost)}</span></td>
                  <td className="px-4 py-4"><span className="block whitespace-nowrap text-xs font-extrabold text-slate-700">{item.availableQuantity} available / {item.quantity} total {item.unitOfMeasure}</span><span className={`mt-1.5 inline-flex rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${conditionTone(item.condition)}`}>{item.condition}</span></td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-600">{custodianLabel(item)}</td>
                  <td className="px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${statusTone(item.status)}`}>{item.status}</span></td>
                </tr>)}
        </tbody>
      </table>
    </div>
    {selectedItem && <InventoryItemDetails item={selectedItem} onClose={() => setSelectedItem(null)} />}
  </div>
}
