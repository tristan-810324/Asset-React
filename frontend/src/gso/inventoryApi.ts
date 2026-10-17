import { apiRequest } from '../auth/authApi'

export type InventoryCategory = {
  id: string
  name: string
}

export type InventoryChangeRecord = {
  action: 'updated' | 'issued' | 'returned' | 'employee_profile_updated'
  reason: string
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  changedAt: string
  changedBy: string | null
}

export type InventoryItemRecord = {
  id: string
  itemCode: string
  category: string
  description: string
  dateAcquired: string | null
  timeAcquired: string | null
  unitCost: number | string
  acquisitionCost: number | string
  currentValue: number | string | null
  quantity: number
  availableQuantity: number
  unitOfMeasure: string
  condition: string
  status: string
  assignedTo: string | null
  dateIssued: string | null
  timeIssued: string | null
  createdAt: string
  createdBy: string | null
  changeHistory: InventoryChangeRecord[]
}

export type NewInventoryItem = {
  itemCode: string
  category: string
  description: string
  dateAcquired: string
  timeAcquired: string
  unitCost: number
  acquisitionCost: number
  currentValue: number | null
  quantity: number
  unitOfMeasure: string
  condition: string
}

export type UpdatedInventoryItem = NewInventoryItem & {
  reason: string
}

export type InventoryCategoryChange = {
  name?: string
  reason: string
}

export async function listInventoryCategories() {
  const result = await apiRequest<{ categories: InventoryCategory[] }>('/inventory/categories')
  return result.categories
}

export async function createInventoryCategory(name: string) {
  const result = await apiRequest<{ category: InventoryCategory }>('/inventory/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return result.category
}

export async function renameInventoryCategory(id: string, change: InventoryCategoryChange) {
  const result = await apiRequest<{ category: InventoryCategory }>(`/inventory/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(change),
  })
  return result.category
}

export async function deleteInventoryCategory(id: string, reason: string) {
  const result = await apiRequest<{ category: InventoryCategory }>(`/inventory/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  })
  return result.category
}

export async function listInventoryItems() {
  const result = await apiRequest<{ items: InventoryItemRecord[] }>('/inventory/items')
  return result.items
}

export async function createInventoryItem(item: NewInventoryItem) {
  const result = await apiRequest<{ item: InventoryItemRecord }>('/inventory/items', {
    method: 'POST',
    body: JSON.stringify(item),
  })
  return result.item
}

export async function updateInventoryItem(id: string, item: UpdatedInventoryItem) {
  const result = await apiRequest<{ item: InventoryItemRecord }>(`/inventory/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  })
  return result.item
}
