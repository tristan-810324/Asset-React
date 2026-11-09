import type { ServiceRequest } from './requesterApi'

export type DashboardRequestItem = {
  itemName: string
  description: string
  quantity: string
  category: string
  catalogItemCode: string
  intendedStaff: string[]
}

export function requestStatusLabel(request: ServiceRequest) {
  if (request.status === 'Submitted' || request.status === 'Under Review') return 'Pending'
  if (request.status === 'GSO Endorsed') return 'Endorsed'
  if (request.status === 'Finance Handoff Pending') return 'Sending to Finance'
  if (request.status === 'Finance Handoff Failed') return 'Finance email failed'
  if (request.status === 'Sent to Finance') return 'Being purchased'
  if (request.status === 'Cancelled') return 'Cancelled'
  return request.status
}

export function requestStatusTone(request: ServiceRequest) {
  if (request.status === 'Rejected' || request.status === 'Finance Handoff Failed') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (request.status === 'Cancelled') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (request.status === 'Approved' || request.status === 'GSO Endorsed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (request.status === 'Needs Information') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (request.status === 'Sent to Finance' || request.status === 'Finance Handoff Pending') return 'border-sky-200 bg-sky-50 text-sky-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export function getRequestItems(request: ServiceRequest): DashboardRequestItem[] {
  const formItems = request.formData.items
  if (Array.isArray(formItems) && formItems.length > 0) {
    return formItems.slice(0, 6).map((value, index) => {
      const item = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
      const linkedAsset = request.assets[index]
      const itemName = String(item.itemName || item.name || linkedAsset?.itemName || `Item ${index + 1}`)
      const description = String(item.description || '')
      const quantity = String(item.quantity ?? linkedAsset?.quantity ?? '')
      const category = String(item.category || '')
      const catalogItemCode = String(item.catalogItemCode || '')
      const intendedStaff = Array.isArray(item.intendedStaff)
        ? item.intendedStaff.flatMap((entry) => {
          if (typeof entry !== 'object' || entry === null) return []
          const employeeName = (entry as Record<string, unknown>).employeeName
          return typeof employeeName === 'string' && employeeName.trim() ? [employeeName] : []
        })
        : []
      return { itemName, description, quantity, category, catalogItemCode, intendedStaff }
    })
  }
  return request.assets.slice(0, 6).map((asset) => ({
    itemName: asset.itemName,
    description: '',
    quantity: String(asset.quantity),
    category: '',
    catalogItemCode: asset.itemCode,
    intendedStaff: [] as string[],
  }))
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
