import React, { useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'

const initialCategories = [
  'Office Supplies',
  'Office Equipment',
  'Machinery/ Parts',
  'Computer Parts/ Peripherals',
  'Tools/ Equipment',
  'Publications',
  'Electrical Supplies',
  'Other Consumables',
  'Others',
]

const conditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']

const initialItems = [
  {
    code: 'AST-LTP-0142',
    name: 'Lenovo ThinkPad E14',
    initials: 'LT',
    category: 'Office Equipment',
    acquired: 'Oct 08, 2026',
    time: '9:20 AM',
    dateIssued: 'Oct 08, 2026',
    timeIssued: '10:30 AM',
    unitCost: 'PHP 58,500',
    acquisitionCost: 'PHP 58,500',
    currentValue: 'PHP 48,000',
    condition: 'Good',
    conditionTone: 'bg-emerald-50 text-emerald-700',
    quantity: '1',
    unit: 'unit',
    assignedTo: 'Juan Dela Cruz (Registrar)',
    status: 'Issued',
    statusTone: 'bg-blue-50 text-blue-700',
    history: [
      {
        previous: 'New',
        next: 'Good',
        changedAt: 'Oct 08, 2026 · 9:20 AM',
        by: 'GSO Admin',
        note: 'Initial cataloging and deployment to Registrar.',
        tone: 'bg-emerald-50 text-emerald-700',
      },
    ],
  },
  {
    code: 'AST-PRJ-0031',
    name: 'Epson EB-X06 Projector',
    initials: 'PJ',
    category: 'Office Equipment',
    acquired: 'Jul 22, 2026',
    time: '2:15 PM',
    dateIssued: '—',
    timeIssued: '—',
    unitCost: 'PHP 37,900',
    acquisitionCost: 'PHP 37,900',
    currentValue: 'PHP 34,000',
    condition: 'Fair',
    conditionTone: 'bg-amber-50 text-amber-700',
    quantity: '1',
    unit: 'unit',
    assignedTo: 'Unassigned (GSO Storage)',
    status: 'Available',
    statusTone: 'bg-emerald-50 text-emerald-700',
    history: [
      {
        previous: 'Good',
        next: 'Fair',
        changedAt: 'Oct 11, 2026 · 10:15 AM',
        by: 'Marco Villanueva',
        note: 'Image flicker noted during inspection.',
        tone: 'bg-amber-50 text-amber-700',
      },
    ],
  },
  {
    code: 'CSM-INK-0124',
    name: 'Printer Ink Cartridge',
    initials: 'IN',
    category: 'Other Consumables',
    acquired: 'Aug 05, 2026',
    time: '10:00 AM',
    dateIssued: '—',
    timeIssued: '—',
    unitCost: 'PHP 1,250',
    acquisitionCost: 'PHP 5,000',
    currentValue: '—',
    condition: 'New',
    conditionTone: 'bg-sky-50 text-sky-700',
    quantity: '4',
    unit: 'cartridges',
    assignedTo: 'Unassigned (GSO Storage)',
    status: 'Available',
    statusTone: 'bg-emerald-50 text-emerald-700',
    history: [
      {
        previous: '—',
        next: 'New',
        changedAt: 'Aug 05, 2026 · 10:00 AM',
        by: 'GSO Inventory',
        note: 'Stock batch received.',
        tone: 'bg-sky-50 text-sky-700',
      },
    ],
  },
  {
    code: 'AST-CHR-0208',
    name: 'Ergonomic Office Chair',
    initials: 'CH',
    category: 'Office Equipment',
    acquired: 'Nov 09, 2025',
    time: '11:30 AM',
    dateIssued: 'Nov 10, 2025',
    timeIssued: '2:00 PM',
    unitCost: 'PHP 8,700',
    acquisitionCost: 'PHP 8,700',
    currentValue: 'PHP 6,500',
    condition: 'Needs Repair',
    conditionTone: 'bg-rose-50 text-rose-700',
    quantity: '1',
    unit: 'unit',
    assignedTo: 'Maria Santos (IT Dept)',
    status: 'Reserved',
    statusTone: 'bg-violet-50 text-violet-700',
    history: [
      {
        previous: 'Good',
        next: 'Needs Repair',
        changedAt: 'Oct 10, 2026 · 3:40 PM',
        by: 'Liza Mendoza',
        note: 'Wheel assembly requires service.',
        tone: 'bg-rose-50 text-rose-700',
      },
    ],
  },
]

export default function ItemsMasterData() {
  // View mode tab state
  const [activeTab, setActiveTab] = useState<'add_and_view' | 'full_inventory'>('add_and_view')

  // Dynamic categories state
  const [categories, setCategories] = useState<string[]>(initialCategories)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // Selected item modal state
  const [selectedItem, setSelectedItem] = useState<typeof initialItems[0] | null>(null)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  const [selectedConditionFilter, setSelectedConditionFilter] = useState('all')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all')
  const [acquiredFrom, setAcquiredFrom] = useState('')
  const [acquiredTo, setAcquiredTo] = useState('')

  // Add Item form state
  const [formData, setFormData] = useState({
    itemCode: '',
    category: 'Others',
    description: '',
    dateAcquired: '',
    timeAcquired: '',
    unitCost: '',
    acquisitionCost: '',
    currentValue: '',
    quantity: '',
    unitOfMeasure: '',
    condition: '',
    picture: null as File | null,
  })

  // Items list state
  const [items, setItems] = useState(initialItems)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({ ...prev, picture: e.target.files![0] }))
    }
  }

  const handleClearForm = () => {
    setFormData({
      itemCode: '',
      category: 'Others',
      description: '',
      dateAcquired: '',
      timeAcquired: '',
      unitCost: '',
      acquisitionCost: '',
      currentValue: '',
      quantity: '',
      unitOfMeasure: '',
      condition: '',
      picture: null,
    })
  }

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault()
    if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
      const updated = [...categories, newCategoryName.trim()]
      setCategories(updated)
      setFormData((prev) => ({ ...prev, category: newCategoryName.trim() }))
      setNewCategoryName('')
      setShowCategoryModal(false)
    }
  }

  const handleSaveItem = () => {
    if (!formData.itemCode || !formData.description) {
      alert('Pakilagay ang Item Code at Item Description.')
      return
    }

    const newItem = {
      code: formData.itemCode,
      name: formData.description,
      initials: formData.description.slice(0, 2).toUpperCase() || 'IT',
      category: formData.category || 'Others',
      acquired: formData.dateAcquired || 'N/A',
      time: formData.timeAcquired || 'N/A',
      dateIssued: '—',
      timeIssued: '—',
      unitCost: formData.unitCost ? `PHP ${Number(formData.unitCost).toLocaleString()}` : 'PHP 0.00',
      acquisitionCost: formData.acquisitionCost ? `PHP ${Number(formData.acquisitionCost).toLocaleString()}` : 'PHP 0.00',
      currentValue: formData.currentValue ? `PHP ${Number(formData.currentValue).toLocaleString()}` : '—',
      condition: formData.condition || 'New',
      conditionTone: 'bg-emerald-50 text-emerald-700',
      quantity: formData.quantity || '1',
      unit: formData.unitOfMeasure || 'piece',
      assignedTo: 'Unassigned (GSO Storage)',
      status: 'Available',
      statusTone: 'bg-emerald-50 text-emerald-700',
      history: [
        {
          previous: '—',
          next: formData.condition || 'New',
          changedAt: `${formData.dateAcquired || 'Today'} · ${formData.timeAcquired || 'Just now'}`,
          by: 'GSO Staff',
          note: 'Newly cataloged inventory item in GSO Storage.',
          tone: 'bg-emerald-50 text-emerald-700',
        },
      ],
    }

    setItems([newItem, ...items])
    handleClearForm()
    alert('Matagumpay na naisave ang bagong item sa GSO Inventory!')
  }

  // Filter logic for searching
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.assignedTo.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter
    const matchesCondition = selectedConditionFilter === 'all' || item.condition === selectedConditionFilter
    const matchesStatus = selectedStatusFilter === 'all' || item.status === selectedStatusFilter

    return matchesSearch && matchesCategory && matchesCondition && matchesStatus
  })

  return (
    <GsoPageFrame activePage="Item Master Data" searchPlaceholder="Search item name, code, or custodian...">
      {/* HEADER SECTION */}
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
              Inventory workspace
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Item Master Data</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
              Catalog assets and consumable stock with their condition, quantity, valuation, and current availability status.
            </p>
          </div>
          <span className="rounded-xl border border-white/10 bg-white/8 px-3.5 py-2 text-xs font-bold text-blue-100">
            Catalog · Assets · Stock
          </span>
        </div>

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="relative mt-6 flex gap-2 border-t border-blue-400/20 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('add_and_view')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'add_and_view'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            + Add & Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('full_inventory')}
            className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
              activeTab === 'full_inventory'
                ? 'bg-white text-blue-950 shadow-md'
                : 'bg-white/10 text-blue-100 hover:bg-white/20'
            }`}
          >
            📋 Master Inventory List ({items.length})
          </button>
        </div>
      </section>

      {/* SEARCH AND FILTER CONTROL SECTION */}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.85fr_0.85fr]">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Search inventory
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Item name, code, or assigned recipient"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">Category</span>
              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className="text-[0.65rem] font-extrabold text-blue-600 hover:underline"
              >
                + New Category
              </button>
            </div>
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Acquired from
            </span>
            <input
              type="date"
              value={acquiredFrom}
              onChange={(e) => setAcquiredFrom(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Acquired to
            </span>
            <input
              type="date"
              value={acquiredTo}
              onChange={(e) => setAcquiredTo(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </div>
      </section>

      {/* TAB 1: ADD ITEM FORM SECTION */}
      {activeTab === 'add_and_view' && (
        <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/30 p-5 shadow-sm shadow-slate-200/55 sm:p-6">
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-black text-slate-900">Add an inventory item</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Record catalog details, acquisition, condition, and quantity.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 sm:self-auto"
            >
              <span>+ Add New Category</span>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item code</span>
              <input
                type="text"
                name="itemCode"
                value={formData.itemCode}
                onChange={handleInputChange}
                placeholder="e.g. AST-EQP-0001"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Category</span>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item description</span>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Item name or description"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Date of acquisition</span>
              <input
                type="date"
                name="dateAcquired"
                value={formData.dateAcquired}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Time of acquisition</span>
              <input
                type="time"
                name="timeAcquired"
                value={formData.timeAcquired}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Cost per unit</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="unitCost"
                value={formData.unitCost}
                onChange={handleInputChange}
                placeholder="0.00"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Acquisition cost</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="acquisitionCost"
                value={formData.acquisitionCost}
                onChange={handleInputChange}
                placeholder="Historical total cost"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">
                Current assessed value (optional)
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="currentValue"
                value={formData.currentValue}
                onChange={handleInputChange}
                placeholder="Current value"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Quantity</span>
              <input
                type="number"
                min="0"
                step="1"
                name="quantity"
                value={formData.quantity}
                onChange={handleInputChange}
                placeholder="Enter quantity"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Unit of measure</span>
              <input
                type="text"
                name="unitOfMeasure"
                value={formData.unitOfMeasure}
                onChange={handleInputChange}
                placeholder="Piece, box, ream, set..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Condition</span>
              <select
                name="condition"
                value={formData.condition}
                onChange={handleInputChange}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                <option value="" disabled>
                  Select condition
                </option>
                {conditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {condition}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2 xl:col-span-2">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Picture (optional)</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block h-10 w-full rounded-lg border border-slate-200 bg-white text-[0.65rem] text-slate-600 file:mr-3 file:h-full file:border-0 file:bg-slate-50 file:px-3 file:text-[0.65rem] file:font-bold"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClearForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Clear form
            </button>
            <button
              type="button"
              onClick={handleSaveItem}
              className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700 shadow-sm shadow-blue-600/20"
            >
              Save item
            </button>
          </div>
        </section>
      )}

      {/* MODAL FOR CREATING NEW CATEGORY */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Add New Category</h3>
            <p className="mt-1 text-xs text-slate-500">
              Create a custom inventory category for GSO items.
            </p>
            <form onSubmit={handleAddCategory} className="mt-4">
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Category Name</span>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Sports Equipment"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
                >
                  Add Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVENTORY LIST TABLE */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/55">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-900">
              {activeTab === 'add_and_view' ? 'Recent Inventory Preview' : 'Full Inventory Master List'}
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Click on any row to open full item details and condition history log.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* INLINE CONDITION FILTER */}
            <select
              value={selectedConditionFilter}
              onChange={(e) => setSelectedConditionFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Conditions</option>
              {conditions.map((cond) => (
                <option key={cond} value={cond}>
                  Condition: {cond}
                </option>
              ))}
            </select>

            {/* INLINE STATUS FILTER */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All Statuses</option>
              <option value="Available">Status: Available</option>
              <option value="Issued">Status: Issued</option>
              <option value="Reserved">Status: Reserved</option>
              <option value="Borrowed">Status: Borrowed</option>
            </select>

            <span className="rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
              {filteredItems.length} item(s) found
            </span>

            {activeTab === 'add_and_view' && (
              <button
                type="button"
                onClick={() => setActiveTab('full_inventory')}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700"
              >
                See All Items →
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-245 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Item</th>
                <th className="px-5 py-3.5">Acquired</th>
                <th className="px-5 py-3.5">Value</th>
                <th className="px-5 py-3.5">Stock / condition</th>
                <th className="px-5 py-3.5">Assigned / Custodian</th>
                <th className="px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr
                  key={`${item.code}-${index}`}
                  onClick={() => setSelectedItem(item)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50"
                >
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex min-w-52 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[0.65rem] font-black text-blue-700">
                        {item.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-extrabold text-slate-800">{item.name}</span>
                        <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code}</span>
                        <span className="mt-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-500">
                          {item.category}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">
                    {item.acquired}
                    <span className="mt-1 block text-[0.65rem] font-medium text-slate-400">{item.time}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span className="block text-xs font-bold text-slate-700">Unit {item.unitCost}</span>
                    <span className="mt-1 block text-[0.65rem] text-slate-500">Acquired {item.acquisitionCost}</span>
                    <span className="mt-1 block text-[0.62rem] text-slate-400">Assessed {item.currentValue}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="block whitespace-nowrap text-xs font-extrabold text-slate-700">
                      {item.quantity} <span className="font-medium text-slate-500">{item.unit}</span>
                    </span>
                    <span className={`mt-1.5 inline-flex rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${item.conditionTone}`}>
                      {item.condition}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-600">{item.assignedTo}</td>
                  <td className="px-5 py-4 sm:px-6">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold ${item.statusTone}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs font-semibold text-slate-400">
                    Walang item na tumutugma sa iyong search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* POP-UP MODAL FOR ITEM DETAILS AND CONDITION HISTORY */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="my-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-xs font-black text-blue-700">
                  {selectedItem.initials}
                </span>
                <div>
                  <h3 className="text-base font-black text-slate-900">{selectedItem.name}</h3>
                  <p className="text-xs font-bold text-slate-400">{selectedItem.code} · {selectedItem.category}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content Grid */}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.62rem] font-extrabold uppercase text-slate-400">Acquisition & Stock</span>
                <p className="mt-1.5 text-xs font-bold text-slate-700">Date Acquired: {selectedItem.acquired} ({selectedItem.time})</p>
                <p className="mt-1 text-xs font-bold text-slate-700">Quantity: {selectedItem.quantity} {selectedItem.unit}</p>
                <p className="mt-1 text-xs font-bold text-slate-700">Custodian: {selectedItem.assignedTo}</p>
                {/* SEPARATE FIELD FOR ISSUANCE DATE AND TIME */}
                <p className="mt-1.5 border-t border-slate-200/60 pt-1.5 text-xs font-bold text-blue-800">
                  Date Issued: {selectedItem.dateIssued !== '—' ? `${selectedItem.dateIssued} (${selectedItem.timeIssued})` : 'Not Issued (In Storage)'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="block text-[0.62rem] font-extrabold uppercase text-slate-400">Valuation & Status</span>
                <p className="mt-1.5 text-xs font-bold text-slate-700">Unit Cost: {selectedItem.unitCost}</p>
                <p className="mt-1 text-xs font-bold text-slate-700">Total Cost: {selectedItem.acquisitionCost}</p>
                <p className="mt-1 text-xs font-bold text-slate-700">Current Value: {selectedItem.currentValue}</p>
              </div>
            </div>

            {/* Status & Condition Badges */}
            <div className="mt-4 flex gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${selectedItem.conditionTone}`}>
                Condition: {selectedItem.condition}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${selectedItem.statusTone}`}>
                Status: {selectedItem.status}
              </span>
            </div>

            {/* Embedded Condition History Section */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Item Condition History</h4>
              <p className="mt-0.5 text-[0.7rem] text-slate-400">Audit logs of previous condition updates for this specific asset.</p>

              <div className="mt-3 space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {selectedItem.history && selectedItem.history.length > 0 ? (
                  selectedItem.history.map((log, idx) => (
                    <div key={idx} className="flex items-start justify-between rounded-xl border border-slate-100 bg-white p-3 shadow-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[0.65rem] font-bold text-slate-400">{log.previous}</span>
                          <span className="text-[0.65rem] text-slate-300">→</span>
                          <span className={`rounded-md px-2 py-0.5 text-[0.62rem] font-extrabold ${log.tone}`}>
                            {log.next}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 font-medium">{log.note}</p>
                        <p className="mt-1 text-[0.62rem] font-bold text-slate-400">By {log.by}</p>
                      </div>
                      <span className="text-[0.62rem] font-semibold text-slate-400 whitespace-nowrap">{log.changedAt}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic">No condition history recorded yet.</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </GsoPageFrame>
  )
}