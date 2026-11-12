import { apiRequest } from '../auth/authApi'

export type InventoryCategory = {
  id: string
  name: string
}

export type InventoryCategoryItemName = {
  id: string
  categoryId: string
  category?: string
  name: string
  approvalPolicy: 'GSO_HEAD' | 'STAFF_ISSUE'
  staffIssueMaxQuantity: number | null
  policyUpdatedAt?: string
  policyUpdatedBy?: string | null
  createdAt: string
}

export type InventoryChangeRecord = {
  action: 'updated' | 'issued' | 'returned' | 'employee_profile_updated'
  reason: string
  oldValues: Record<string, unknown>
  newValues: Record<string, unknown>
  changedAt: string
  changedBy: string | null
}

export type InventoryTrackingMode = 'individual' | 'quantity'
export type InventoryIssueBehavior = 'consumable' | 'returnable'

export type InventoryAssetTag = {
  tagCode: string
  unitNumber: number
  serialNumber: string | null
  location: string
  condition: string
  lifecycleStatus: string
  custodyStatus: string
}

export type InventoryReceiptRecord = {
  id: string
  quantity: number
  unitCost: number | string
  totalCost: number | string
  dateAcquired: string | null
  timeAcquired: string | null
  referenceNumber: string
  createdAt: string
}

export type PurchaseStockReconciliation = {
  deliveries: Array<{
    lineId: string
    itemId: string
    quantity: number
  }>
  readyRequests: Array<{
    id: string
    referenceNo: string
  }>
}

// Dates are Manila wall-clock text ("YYYY-MM-DDTHH:mm"), or a plain date on older and requester records.
export type InventoryCurrentBorrower = {
  id: string
  borrowerName: string
  reference: string
  department: string | null
  state: 'Borrowed' | 'Reserved' | 'For repair'
  quantity: number
  issuedAt: string
  useAt: string | null
  expectedReturnAt: string | null
  useLocation: string | null
  purpose: string | null
  isOverdue: boolean
}

export type InventoryItemRecord = {
  id: string
  itemCode: string
  category: string
  itemName: string
  description: string
  trackingMode: InventoryTrackingMode
  issueBehavior: InventoryIssueBehavior
  serialNumber: string | null
  storageLocation: string
  assetTags: InventoryAssetTag[]
  receiptHistory: InventoryReceiptRecord[]
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
  currentBorrowers: InventoryCurrentBorrower[]
  purchaseReconciliation?: PurchaseStockReconciliation
}

export type NewInventoryItem = {
  itemCode: string
  category: string
  itemName: string
  description: string
  trackingMode: InventoryTrackingMode
  issueBehavior: InventoryIssueBehavior
  serialNumber?: string | null
  receiptReference?: string
  storageLocation?: string
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

export async function listInventoryCategoryItemNames() {
  const result = await apiRequest<{ itemNames: InventoryCategoryItemName[] }>('/inventory/item-names')
  return result.itemNames
}

export async function updateInventoryCategoryItemNamePolicy(
  id: string,
  change: { approvalPolicy: 'GSO_HEAD' | 'STAFF_ISSUE'; staffIssueMaxQuantity: number | null; reason: string },
) {
  const result = await apiRequest<{ itemName: Partial<InventoryCategoryItemName> }>(
    `/inventory/item-names/${encodeURIComponent(id)}/policy`,
    { method: 'PATCH', body: JSON.stringify(change) },
  )
  return result.itemName
}

export async function createInventoryCategoryItemName(categoryId: string, name: string) {
  const result = await apiRequest<{ itemName: InventoryCategoryItemName }>(`/inventory/categories/${encodeURIComponent(categoryId)}/item-names`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return result.itemName
}

export async function deleteInventoryCategoryItemName(id: string) {
  const result = await apiRequest<{ itemName: InventoryCategoryItemName }>(`/inventory/item-names/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  return result.itemName
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

export async function createInventoryItems(items: NewInventoryItem[]) {
  const result = await apiRequest<{ items: InventoryItemRecord[] }>('/inventory/items/bulk', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
  return result.items
}

export async function updateInventoryItem(id: string, item: UpdatedInventoryItem) {
  const result = await apiRequest<{ item: InventoryItemRecord }>(`/inventory/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  })
  return result.item
}

export async function restockInventoryItem(
  id: string,
  receipt: {
    quantity: number
    unitCost: number
    dateAcquired: string
    timeAcquired: string
    condition: string
    receiptReference: string
  },
) {
  const result = await apiRequest<{ item: InventoryItemRecord }>(`/inventory/items/${encodeURIComponent(id)}/restock`, {
    method: 'POST',
    body: JSON.stringify(receipt),
  })
  return result.item
}
