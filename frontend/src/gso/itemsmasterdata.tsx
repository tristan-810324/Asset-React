import React, { useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  createInventoryCategory,
  createInventoryItem,
  deleteInventoryCategory,
  listInventoryCategories,
  listInventoryItems,
  renameInventoryCategory,
  updateInventoryItem,
  type InventoryCategory,
  type InventoryChangeRecord,
  type InventoryItemRecord,
} from './inventoryApi'

type ItemHistoryEntry = {
  previous: string
  next: string
  changedAt: string
  by: string
  note: string
  tone: string
}

type InventoryItem = {
  id?: string
  code: string
  name: string
  initials: string
  category: string
  acquired: string
  time: string
  dateIssued: string
  timeIssued: string
  unitCost: string
  acquisitionCost: string
  currentValue: string
  condition: string
  conditionTone: string
  quantity: string
  unit: string
  assignedTo: string
  status: string
  statusTone: string
  history: ItemHistoryEntry[]
  dateAcquiredValue?: string | null
  timeAcquiredValue?: string | null
  unitCostValue?: number | string
  acquisitionCostValue?: number | string
  currentValueValue?: number | string | null
  quantityValue?: number
  unitOfMeasureValue?: string
  changeHistory?: InventoryChangeRecord[]
}

const conditions = ['New', 'Good', 'Fair', 'Needs Repair', 'Under Maintenance', 'Unserviceable', 'Retired']

function toneForCondition(condition: string) {
  const tones: Record<string, string> = {
    New: 'bg-sky-50 text-sky-700',
    Good: 'bg-emerald-50 text-emerald-700',
    Fair: 'bg-amber-50 text-amber-700',
    'Needs Repair': 'bg-rose-50 text-rose-700',
    'Under Maintenance': 'bg-amber-50 text-amber-700',
    Unserviceable: 'bg-rose-50 text-rose-700',
    Retired: 'bg-slate-100 text-slate-600',
  }
  return tones[condition] || 'bg-slate-100 text-slate-600'
}

function formatAcquiredDate(value: string | null) {
  if (!value) return 'N/A'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? 'N/A'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

function formatAcquiredTime(value: string | null) {
  if (!value) return 'N/A'
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return value
  const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]))
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatMoney(value: number | string | null, emptyValue = 'PHP 0.00') {
  if (value === null || value === '') return emptyValue
  const amount = Number(value)
  return Number.isFinite(amount) ? `PHP ${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(amount)}` : emptyValue
}

function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  const dateText = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
  const timeText = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
  return `${dateText} · ${timeText}`
}

function mapInventoryRecord(record: InventoryItemRecord): InventoryItem {
  const conditionTone = toneForCondition(record.condition)
  const statusTone = record.status === 'Available'
    ? 'bg-emerald-50 text-emerald-700'
    : record.status === 'Issued'
      ? 'bg-blue-50 text-blue-700'
      : record.status === 'Reserved'
        ? 'bg-violet-50 text-violet-700'
        : 'bg-amber-50 text-amber-700'

  return {
    id: record.id,
    code: record.itemCode,
    name: record.description,
    initials: record.description.trim().slice(0, 2).toUpperCase() || 'IT',
    category: record.category,
    acquired: formatAcquiredDate(record.dateAcquired),
    time: formatAcquiredTime(record.timeAcquired),
    dateIssued: record.dateIssued || '—',
    timeIssued: record.timeIssued || '—',
    unitCost: formatMoney(record.unitCost),
    acquisitionCost: formatMoney(record.acquisitionCost),
    currentValue: formatMoney(record.currentValue, '—'),
    condition: record.condition,
    conditionTone,
    quantity: String(record.quantity),
    unit: record.unitOfMeasure,
    assignedTo: record.assignedTo || (record.status === 'Available' ? 'In Storage' : '—'),
    status: record.status,
    statusTone,
    dateAcquiredValue: record.dateAcquired,
    timeAcquiredValue: record.timeAcquired,
    unitCostValue: record.unitCost,
    acquisitionCostValue: record.acquisitionCost,
    currentValueValue: record.currentValue,
    quantityValue: record.quantity,
    unitOfMeasureValue: record.unitOfMeasure,
    changeHistory: record.changeHistory || [],
    history: [],
  }
}

export default function ItemsMasterData() {
  // View mode tab state
  const [activeTab, setActiveTab] = useState<'add_and_view' | 'full_inventory'>('add_and_view')

  // Dynamic categories state
  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryManagerError, setCategoryManagerError] = useState('')
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryReason, setEditingCategoryReason] = useState('')
  const [categoryToDelete, setCategoryToDelete] = useState<InventoryCategory | null>(null)
  const [categoryDeleteReason, setCategoryDeleteReason] = useState('')
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)

  // Selected item modal state
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showItemEditModal, setShowItemEditModal] = useState(false)
  const [isUpdatingItem, setIsUpdatingItem] = useState(false)
  const [itemEditError, setItemEditError] = useState('')
  const [editFormData, setEditFormData] = useState({
    itemCode: '',
    category: '',
    description: '',
    dateAcquired: '',
    timeAcquired: '',
    unitCost: '',
    acquisitionCost: '',
    currentValue: '',
    quantity: '',
    unitOfMeasure: '',
    condition: 'New',
    reason: '',
  })

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  const [selectedConditionFilter, setSelectedConditionFilter] = useState('all')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all')

  // Add Item form state
  const [formData, setFormData] = useState({
    itemCode: '',
    category: '',
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
  const [items, setItems] = useState<InventoryItem[]>([])
  const [isSavingItem, setIsSavingItem] = useState(false)
  const [inventoryLoadError, setInventoryLoadError] = useState('')

  useEffect(() => {
    let isMounted = true

    Promise.all([listInventoryItems(), listInventoryCategories()])
      .then(([records, categoryRecords]) => {
        if (!isMounted) return
        const savedItems = records.map(mapInventoryRecord)
        setItems(savedItems)
        setCategories(categoryRecords)
        setFormData((current) => categoryRecords.some((category) => category.name === current.category)
          ? current
          : { ...current, category: categoryRecords[0]?.name || '' })
        setInventoryLoadError('')
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setInventoryLoadError(error instanceof Error ? error.message : 'Unable to load inventory from the database.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

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
      category: categories[0]?.name || '',
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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return

    setIsSavingCategory(true)
    setCategoryManagerError('')
    try {
      const category = await createInventoryCategory(name)
      setCategories((current) => [...current, category])
      setFormData((prev) => ({ ...prev, category: category.name }))
      setNewCategoryName('')
    } catch (error) {
      setCategoryManagerError(error instanceof Error ? error.message : 'Unable to add the category.')
    } finally {
      setIsSavingCategory(false)
    }
  }

  const handleRenameCategory = async (e: React.FormEvent, category: InventoryCategory) => {
    e.preventDefault()
    const name = editingCategoryName.trim()
    const reason = editingCategoryReason.trim()
    if (!category.id || !name || !reason) return

    setIsSavingCategory(true)
    setCategoryManagerError('')
    try {
      const renamed = await renameInventoryCategory(category.id, { name, reason })
      setCategories((current) => current.map((entry) => entry.id === renamed.id ? renamed : entry))
      setItems((current) => current.map((item) => item.category === category.name ? { ...item, category: renamed.name } : item))
      setSelectedItem((current) => current?.category === category.name ? { ...current, category: renamed.name } : current)
      setFormData((current) => current.category === category.name ? { ...current, category: renamed.name } : current)
      setEditFormData((current) => current.category === category.name ? { ...current, category: renamed.name } : current)
      setSelectedCategoryFilter((current) => current === category.name ? renamed.name : current)
      setEditingCategoryId(null)
      setEditingCategoryName('')
      setEditingCategoryReason('')
    } catch (error) {
      setCategoryManagerError(error instanceof Error ? error.message : 'Unable to rename the category.')
    } finally {
      setIsSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryToDelete?.id || !categoryDeleteReason.trim()) return

    setIsDeletingCategory(true)
    setCategoryManagerError('')
    try {
      await deleteInventoryCategory(categoryToDelete.id, categoryDeleteReason.trim())
      const remainingCategories = categories.filter((entry) => entry.id !== categoryToDelete.id)
      const fallbackCategory = remainingCategories.find((entry) => entry.name === 'Others')?.name
        || remainingCategories[0]?.name
        || ''
      setCategories(remainingCategories)
      setSelectedCategoryFilter((current) => current === categoryToDelete.name ? 'all' : current)
      setFormData((current) => current.category === categoryToDelete.name ? { ...current, category: fallbackCategory } : current)
      setEditFormData((current) => current.category === categoryToDelete.name ? { ...current, category: fallbackCategory } : current)
      setCategoryToDelete(null)
      setCategoryDeleteReason('')
    } catch (error) {
      setCategoryManagerError(error instanceof Error ? error.message : 'Unable to delete the category.')
    } finally {
      setIsDeletingCategory(false)
    }
  }

  const beginEditSelectedItem = () => {
    if (!selectedItem?.id) return
    setEditFormData({
      itemCode: selectedItem.code,
      category: selectedItem.category,
      description: selectedItem.name,
      dateAcquired: selectedItem.dateAcquiredValue || '',
      timeAcquired: selectedItem.timeAcquiredValue || '',
      unitCost: String(selectedItem.unitCostValue ?? 0),
      acquisitionCost: String(selectedItem.acquisitionCostValue ?? 0),
      currentValue: selectedItem.currentValueValue === null || selectedItem.currentValueValue === undefined
        ? ''
        : String(selectedItem.currentValueValue),
      quantity: String(selectedItem.quantityValue ?? 1),
      unitOfMeasure: selectedItem.unitOfMeasureValue || 'piece',
      condition: selectedItem.condition,
      reason: '',
    })
    setItemEditError('')
    setShowItemEditModal(true)
  }

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditFormData((current) => ({ ...current, [name]: value }))
  }

  const handleUpdateSelectedItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem?.id) return
    if (!editFormData.itemCode.trim() || !editFormData.description.trim() || !editFormData.reason.trim()) {
      setItemEditError('Enter the item code, item description, and reason for the change.')
      return
    }

    setIsUpdatingItem(true)
    setItemEditError('')
    try {
      const savedRecord = await updateInventoryItem(selectedItem.id, {
        itemCode: editFormData.itemCode.trim(),
        category: editFormData.category,
        description: editFormData.description.trim(),
        dateAcquired: editFormData.dateAcquired,
        timeAcquired: editFormData.timeAcquired,
        unitCost: editFormData.unitCost ? Number(editFormData.unitCost) : 0,
        acquisitionCost: editFormData.acquisitionCost ? Number(editFormData.acquisitionCost) : 0,
        currentValue: editFormData.currentValue ? Number(editFormData.currentValue) : null,
        quantity: editFormData.quantity ? Number(editFormData.quantity) : 1,
        unitOfMeasure: editFormData.unitOfMeasure.trim() || 'piece',
        condition: editFormData.condition,
        reason: editFormData.reason.trim(),
      })
      const updatedItem = mapInventoryRecord(savedRecord)
      setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item))
      setSelectedItem(updatedItem)
      setShowItemEditModal(false)
    } catch (error) {
      setItemEditError(error instanceof Error ? error.message : 'Unable to update the inventory item.')
    } finally {
      setIsUpdatingItem(false)
    }
  }

  const handleSaveItem = async () => {
    if (!formData.itemCode.trim() || !formData.description.trim()) {
      alert('Enter the item code and item description.')
      return
    }

    setIsSavingItem(true)
    try {
      const savedRecord = await createInventoryItem({
        itemCode: formData.itemCode.trim(),
        category: formData.category,
        description: formData.description.trim(),
        dateAcquired: formData.dateAcquired,
        timeAcquired: formData.timeAcquired,
        unitCost: formData.unitCost ? Number(formData.unitCost) : 0,
        acquisitionCost: formData.acquisitionCost ? Number(formData.acquisitionCost) : 0,
        currentValue: formData.currentValue ? Number(formData.currentValue) : null,
        quantity: formData.quantity ? Number(formData.quantity) : 1,
        unitOfMeasure: formData.unitOfMeasure.trim() || 'piece',
        condition: formData.condition || 'New',
      })
      const newItem = mapInventoryRecord(savedRecord)
      setItems((current) => [newItem, ...current.filter((item) => item.code.toLowerCase() !== newItem.code.toLowerCase())])
      setInventoryLoadError('')
      handleClearForm()
      alert('The item was saved to the GSO inventory successfully!')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save the item. Please try again.')
    } finally {
      setIsSavingItem(false)
    }
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
    <GsoPageFrame
      activePage="Item Master Data"
      searchPlaceholder="Item name, code, or assigned recipient"
    >
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
              + Master Inventory List ({items.length})
          </button>
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
                  <option key={category.id || category.name} value={category.name}>
                    {category.name}
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
              disabled={isSavingItem}
              className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-extrabold text-white transition hover:bg-blue-700 shadow-sm shadow-blue-600/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingItem ? 'Saving...' : 'Save item'}
            </button>
          </div>
        </section>
      )}

      {/* SEARCH AND FILTER CONTROL SECTION */}
      <section className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/55 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Search inventory
            </span>
            <div className="relative">
              <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10.75" cy="10.75" r="5.75" />
                <path d="m15.1 15.1 4.15 4.15" />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Item name, code, or assigned recipient"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-xs font-semibold text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>
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
                <option key={category.id || category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Condition
            </span>
            <select
              value={selectedConditionFilter}
              onChange={(event) => setSelectedConditionFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Conditions</option>
              {conditions.map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-500">
              Status
            </span>
            <select
              value={selectedStatusFilter}
              onChange={(event) => setSelectedStatusFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Issued">Issued</option>
              <option value="Reserved">Reserved</option>
              <option value="Borrowed">Borrowed</option>
            </select>
          </label>
        </div>
      </section>

      {/* MODAL FOR ADDING AND MANAGING CATEGORIES */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Manage Inventory Categories</h3>
            <p className="mt-1 text-xs text-slate-500">Add categories, rename them with a reason, or remove unused categories.</p>
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
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingCategory ? 'Saving...' : 'Add Category'}
                </button>
              </div>
            </form>

            {categoryManagerError && (
              <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {categoryManagerError}
              </p>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Existing Categories</h4>
              <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                {categories.map((category) => (
                  <div key={category.id || category.name} className="rounded-xl border border-slate-100 p-3">
                    {editingCategoryId === category.id && Boolean(category.id) ? (
                      <form onSubmit={(e) => handleRenameCategory(e, category)} className="space-y-2">
                        <label className="block">
                          <span className="mb-1 block text-[0.62rem] font-bold text-slate-500">Updated category name</span>
                          <input
                            type="text"
                            required
                            maxLength={120}
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[0.62rem] font-bold text-slate-500">Reason for renaming</span>
                          <textarea
                            required
                            maxLength={1000}
                            value={editingCategoryReason}
                            onChange={(e) => setEditingCategoryReason(e.target.value)}
                            placeholder="Why does this category name need to change?"
                            className="min-h-16 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingCategoryId(null); setCategoryManagerError('') }}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingCategory}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-60"
                          >
                            {isSavingCategory ? 'Saving...' : 'Save name'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">{category.name}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={!category.id || isSavingCategory}
                            onClick={() => {
                              setEditingCategoryId(category.id)
                              setEditingCategoryName(category.name)
                              setEditingCategoryReason('')
                              setCategoryManagerError('')
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[0.65rem] font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            disabled={!category.id || isSavingCategory || categories.length <= 1}
                            onClick={() => {
                              setCategoryToDelete(category)
                              setCategoryDeleteReason('')
                              setCategoryManagerError('')
                            }}
                            className="rounded-lg border border-rose-100 px-2.5 py-1.5 text-[0.65rem] font-bold text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCategoryModal(false); setCategoryManagerError(''); setEditingCategoryId(null) }}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600"
                >
                  Done
                </button>
              </div>
          </div>
        </div>
      )}

      {categoryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleDeleteCategory} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-black text-slate-900">Delete “{categoryToDelete.name}”?</h3>
            <p className="mt-1 text-xs text-slate-500">A category can only be removed after all inventory items are moved to another category.</p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Reason for deletion</span>
              <textarea
                required
                maxLength={1000}
                value={categoryDeleteReason}
                onChange={(e) => setCategoryDeleteReason(e.target.value)}
                className="min-h-20 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            {categoryManagerError && (
              <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {categoryManagerError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingCategory}
                onClick={() => { setCategoryToDelete(null); setCategoryManagerError('') }}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeletingCategory}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
              >
                {isDeletingCategory ? 'Deleting...' : 'Delete Category'}
              </button>
            </div>
          </form>
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
            {inventoryLoadError && (
              <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
                {inventoryLoadError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                    No items match your search query.
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

            {selectedItem.changeHistory && selectedItem.changeHistory.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Item Change History</h4>
                <p className="mt-0.5 text-[0.7rem] text-slate-400">Recorded reasons for edits to this inventory item.</p>
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {selectedItem.changeHistory.map((change, index) => (
                    <div key={`${change.changedAt}-${index}`} className="rounded-xl border border-slate-100 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-700">{change.reason}</p>
                      <p className="mt-1 text-[0.62rem] font-bold text-slate-400">
                        By {change.changedBy || 'GSO Staff'} · {formatCreatedAt(change.changedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-between gap-3">
              {selectedItem.id ? (
                <button
                  type="button"
                  onClick={beginEditSelectedItem}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100"
                >
                  Edit Information
                </button>
              ) : <span />}
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

      {showItemEditModal && selectedItem?.id && (
        <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm">
          <form onSubmit={handleUpdateSelectedItem} className="my-6 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Edit Inventory Item</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">{selectedItem.code} · {selectedItem.name}</p>
              </div>
              <button
                type="button"
                disabled={isUpdatingItem}
                onClick={() => { setShowItemEditModal(false); setItemEditError('') }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {itemEditError && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {itemEditError}
              </p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item Code</span>
                <input name="itemCode" required maxLength={100} value={editFormData.itemCode} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Category</span>
                <select name="category" value={editFormData.category} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                  {categories.map((category) => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Item Description</span>
                <input name="description" required maxLength={500} value={editFormData.description} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Date Acquired</span>
                <input type="date" name="dateAcquired" value={editFormData.dateAcquired} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Time Acquired</span>
                <input type="time" name="timeAcquired" value={editFormData.timeAcquired} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Cost per Unit</span>
                <input type="number" min="0" step="0.01" name="unitCost" value={editFormData.unitCost} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Acquisition Cost</span>
                <input type="number" min="0" step="0.01" name="acquisitionCost" value={editFormData.acquisitionCost} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Current Assessed Value</span>
                <input type="number" min="0" step="0.01" name="currentValue" value={editFormData.currentValue} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Quantity</span>
                <input type="number" min="0" step="1" name="quantity" value={editFormData.quantity} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Unit of Measure</span>
                <input name="unitOfMeasure" maxLength={60} value={editFormData.unitOfMeasure} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Condition</span>
                <select name="condition" value={editFormData.condition} onChange={handleEditInputChange} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                  {conditions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[0.65rem] font-bold text-slate-600">Why are you changing this information? (Required)</span>
                <textarea
                  name="reason"
                  required
                  maxLength={1000}
                  value={editFormData.reason}
                  onChange={handleEditInputChange}
                  placeholder="For example: The original item code was entered incorrectly."
                  className="min-h-24 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isUpdatingItem}
                onClick={() => { setShowItemEditModal(false); setItemEditError('') }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingItem}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdatingItem ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </GsoPageFrame>
  )
}
