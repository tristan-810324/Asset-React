import { useEffect, useMemo, useState } from 'react'
import {
  listInventoryCategories,
  listInventoryItems,
  type InventoryCategory,
  type InventoryItemRecord,
} from '../gso/inventoryApi'

const conditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']
const statusTone = (status: string) => status === 'Available'
  ? 'bg-emerald-50 text-emerald-700'
  : status === 'Issued' || status === 'Borrowed'
    ? 'bg-blue-50 text-blue-700'
    : status === 'Reserved' || status === 'Pending Approval'
      ? 'bg-violet-50 text-violet-700'
      : 'bg-amber-50 text-amber-800'

export default function GsoHeadItemMaster() {
  const [items, setItems] = useState<InventoryItemRecord[]>([])
  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [conditionStatus, setConditionStatus] = useState('all')
  const [stockType, setStockType] = useState('all')
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

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return items.filter((item) => {
      const matchesSearch = [item.itemName, item.description, item.itemCode, item.storageLocation, item.assignedTo || '']
        .some((value) => value.toLocaleLowerCase().includes(query))
      const matchesCategory = category === 'all' || item.category === category
      const matchesCondition = conditionStatus === 'all'
        || item.condition === conditionStatus
        || item.status === conditionStatus
      const matchesStockType = stockType === 'all'
        || (stockType === 'individual' && item.trackingMode === 'individual')
        || (stockType === 'consumable' && item.trackingMode === 'quantity' && item.issueBehavior === 'consumable')
        || (stockType === 'reusable' && item.trackingMode === 'quantity' && item.issueBehavior === 'returnable')
      return matchesSearch && matchesCategory && matchesCondition && matchesStockType
    })
  }, [category, conditionStatus, items, search, stockType])

  const totalAvailable = items.reduce((sum, item) => sum + Number(item.availableQuantity || 0), 0)
  const availableRecords = items.filter((item) => item.availableQuantity > 0).length
  return (
    <div className="mt-6 space-y-4">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Inventory summary">
        {[
          { label: 'Inventory records', value: items.length, detail: 'Saved item records', tone: 'border-slate-300/80 bg-white text-slate-900' },
          { label: 'Available units', value: totalAvailable.toLocaleString('en-PH'), detail: `${availableRecords} records with stock`, tone: 'border-blue-200 bg-blue-50/80 text-blue-900' },
          { label: 'Categories', value: categories.length, detail: 'In Item Master Data', tone: 'border-indigo-200 bg-indigo-50/70 text-indigo-900' },
        ].map((metric) => <article key={metric.label} className={`rounded-2xl border-2 p-4 shadow-md shadow-slate-300/25 ring-1 ring-slate-900/5 ${metric.tone}`}><p className="text-xs font-bold opacity-70">{metric.label}</p><p className="mt-1 text-2xl font-black tracking-tight">{loading ? '—' : metric.value}</p><p className="mt-2 border-t border-current/10 pt-2 text-[0.65rem] font-medium opacity-70">{metric.detail}</p></article>)}
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/30 ring-1 ring-slate-900/5" aria-label="Item master inventory">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
          <div><h2 className="text-base font-black tracking-tight text-slate-900">Item Master Data</h2><p className="mt-1 text-xs text-slate-500">View inventory stock, condition, valuation, and current assignment.</p></div>
          <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[0.62rem] font-extrabold text-blue-700">Read only · {filteredItems.length} shown</span>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Search inventory</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, code, location, or assignee" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
          <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="all">All categories</option>{categories.map((row) => <option key={row.id || row.name}>{row.name}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Condition / status</span><select value={conditionStatus} onChange={(event) => setConditionStatus(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="all">All conditions &amp; statuses</option><optgroup label="Condition">{conditions.map((value) => <option key={value}>{value}</option>)}</optgroup><optgroup label="Status">{['Available', 'Issued', 'Reserved', 'Borrowed', 'Pending Approval'].map((value) => <option key={value}>{value}</option>)}</optgroup></select></label>
          <label className="block"><span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-600">Stock type</span><select value={stockType} onChange={(event) => setStockType(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="all">All stock types</option><option value="individual">Track each item separately</option><option value="consumable">Consumable stock</option><option value="reusable">Reusable stock</option></select></label>
        </div>

        {error && <p role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
        <div className="max-h-[68vh] overflow-auto">
          <table className="min-w-230 w-full text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3 sm:px-5">Item</th><th className="px-4 py-3">Category / type</th><th className="px-4 py-3">Acquired</th><th className="px-4 py-3">Value</th><th className="px-4 py-3">Stock / condition</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-12 text-center text-xs font-semibold text-slate-500">Loading inventory…</td></tr>
                : error ? null
                  : filteredItems.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-xs font-semibold text-slate-500">No inventory items match these filters.</td></tr>
                    : filteredItems.map((item) => <tr key={item.id} className="transition hover:bg-blue-50/40">
                      <td className="max-w-72 px-4 py-3.5 sm:px-5"><p className="line-clamp-2 text-xs font-extrabold leading-relaxed text-slate-800">{item.description || item.itemName}</p>{item.description && item.description.toLocaleLowerCase() !== item.itemName.toLocaleLowerCase() && <p className="mt-1 truncate text-[0.68rem] font-bold text-blue-700">{item.itemName}</p>}<p className="mt-1 text-[0.62rem] font-bold text-slate-400">{item.itemCode}</p><p className="mt-1 text-[0.62rem] text-slate-500">{item.storageLocation}</p></td>
                      <td className="px-4 py-3.5"><p className="text-xs font-bold text-slate-700">{item.category}</p><span className="mt-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-600">{item.trackingMode === 'individual' ? 'Individually tracked item' : item.issueBehavior === 'consumable' ? 'Consumable stock' : 'Reusable stock'}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-700">{item.dateAcquired || '—'}<span className="mt-1 block text-[0.62rem] text-slate-400">{item.timeAcquired || ''}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-700">Unit ₱{Number(item.unitCost || 0).toLocaleString('en-PH')}<span className="mt-1 block text-[0.62rem] text-slate-500">Total ₱{Number(item.acquisitionCost || 0).toLocaleString('en-PH')}</span></td>
                      <td className="px-4 py-3.5"><p className="whitespace-nowrap text-xs font-extrabold text-slate-700">{item.availableQuantity} available / {item.quantity} {item.unitOfMeasure}</p><span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[0.58rem] font-extrabold text-slate-700">{item.condition}</span></td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">{item.assignedTo || '—'}</td>
                      <td className="px-4 py-3.5"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6rem] font-extrabold ${statusTone(item.status)}`}>{item.status}</span></td>
                    </tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[0.65rem] font-medium text-slate-500">Inventory changes and issuance are managed by GSO Staff in their Item Master workspace.</p>
    </div>
  )
}
