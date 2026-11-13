import type { PurchaseRequisitionLine, ServiceRequest, StaffRoute } from '../requesters/requesterApi'

// The three routes an item can take, with the rule behind each. Shared by GSO Staff and GSO Head.
export const ROUTES: Record<StaffRoute, { step: string; label: string; who: string; rule: string; tone: string; solid: string }> = {
  ISSUE: {
    step: '1',
    label: 'Issue from stock',
    who: 'GSO Staff issues',
    rule: 'Enough stock, and GSO Staff chose to issue it.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    solid: 'bg-emerald-600 text-white',
  },
  HEAD_ISSUE: {
    step: '2',
    label: 'GSO Head approval',
    who: 'Head approves, then staff issues',
    rule: 'In stock, but GSO Staff asked the GSO Head to check it first.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    solid: 'bg-amber-500 text-white',
  },
  PURCHASE: {
    step: '3',
    label: 'Purchase approval',
    who: 'Head approves, then GSO Staff buys',
    rule: 'Not enough stock. GSO Staff buy the shortage and link the delivery before issuance.',
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    solid: 'bg-indigo-600 text-white',
  },
}

export const LINE_STATUS: Record<string, { label: string; tone: string }> = {
  WAITING_STAFF_REVIEW: { label: 'Stock check', tone: 'bg-blue-50 text-blue-700' },
  WAITING_GSO_HEAD: { label: 'Waiting for GSO Head', tone: 'bg-amber-50 text-amber-800' },
  NEEDS_INFORMATION: { label: 'Waiting for requester', tone: 'bg-amber-50 text-amber-800' },
  READY_FOR_STAFF: { label: 'Reserved for request', tone: 'bg-emerald-50 text-emerald-700' },
  PARTIAL_STOCK: { label: 'Partial delivery · waiting for rest', tone: 'bg-amber-50 text-amber-800' },
  WAITING_FINANCE: { label: 'Approved for purchase', tone: 'bg-indigo-50 text-indigo-700' },
  WAITING_FOR_PURCHASE: { label: 'Waiting for full quantity', tone: 'bg-indigo-50 text-indigo-700' },
  HANDOVER_PENDING: { label: 'Handover pending', tone: 'bg-sky-50 text-sky-700' },
  PARTIALLY_ISSUED: { label: 'Partly issued', tone: 'bg-emerald-50 text-emerald-700' },
  ISSUED: { label: 'Issued', tone: 'bg-slate-100 text-slate-700' },
  REJECTED: { label: 'Declined', tone: 'bg-rose-50 text-rose-700' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
}

// A purchase line is not issuable until its complete requested quantity is in stock.
export function purchaseLineReadyForIssuance(line: PurchaseRequisitionLine) {
  return ['READY_FOR_STAFF', 'PARTIALLY_ISSUED'].includes(line.routeStatus)
    && Number(line.financeQuantity || 0) === 0
    && Number(line.reservedQuantity || 0) >= Number(line.requestedQuantity || 0)
}

// A request enters Main Issuance only when every requested line is fully reserved.
export function purchaseRequisitionReadyForIssuance(request: ServiceRequest) {
  const lines = linesOf(request)
  const complete = lines.length > 0 && lines.every((line) => (
    ['READY_FOR_STAFF', 'PARTIALLY_ISSUED', 'HANDOVER_PENDING', 'ISSUED'].includes(line.routeStatus)
      && Number(line.financeQuantity || 0) === 0
      && Number(line.reservedQuantity || 0) >= Number(line.requestedQuantity || 0)
  ))
  return complete && lines.some(purchaseLineReadyForIssuance)
}

export const FINANCE_STATUSES = ['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed', 'Sent to Finance']

export const linesOf = (request: ServiceRequest) => request.purchaseLines || []
export const countLines = (request: ServiceRequest, statuses: string[]) => linesOf(request).filter((line) => statuses.includes(line.routeStatus)).length
export const countIssuableLines = (request: ServiceRequest) => purchaseRequisitionReadyForIssuance(request)
  ? linesOf(request).filter(purchaseLineReadyForIssuance).length
  : 0

// What a waiting item asks the GSO Head to approve, and why it could not go straight to GSO Staff.
export function headApproval(line: PurchaseRequisitionLine): { route: StaffRoute; reason: string } {
  if (line.financeQuantity > 0) {
    return {
      route: 'PURCHASE',
      reason: line.reservedQuantity > 0
        ? `Only ${line.reservedQuantity} in stock. ${line.reservedQuantity} held for this request; ${line.financeQuantity} to buy.`
        : `No usable stock. All ${line.financeQuantity} must be bought.`,
    }
  }
  if (line.approvalPolicy === 'GSO_HEAD') {
    return { route: 'HEAD_ISSUE', reason: 'This item requires GSO Head approval; the decision covers the complete request.' }
  }
  if (line.staffIssueMaxQuantity !== null && line.requestedQuantity > line.staffIssueMaxQuantity) {
    return { route: 'HEAD_ISSUE', reason: `This request exceeds the ${line.staffIssueMaxQuantity}-unit GSO Staff limit; the decision covers the complete request.` }
  }
  return { route: 'HEAD_ISSUE', reason: 'GSO Staff asked for approval; the decision covers the complete request.' }
}

// Whether GSO Staff may still choose between issuing an item now and asking the GSO Head.
export const staffDecides = (options: StaffRoute[]) => options.includes('ISSUE') && options.includes('HEAD_ISSUE')

// GSO Staff physically handed the GSO Head-approved PDF to Finance, so they can buy the items and link deliveries.
export function deliveryOpen(request: ServiceRequest) {
  return request.status === 'Sent to Finance'
}

export function canRecordDelivery(line: PurchaseRequisitionLine) {
  return line.financeQuantity > 0 && !['HANDOVER_PENDING', 'REJECTED', 'CANCELLED'].includes(line.routeStatus)
}

export function formText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

const CATEGORIES: Record<string, { label: string; inventory: string[] }> = {
  OFFICE_SUPPLIES: { label: 'Office supplies', inventory: ['office_supplies'] },
  OFFICE_EQUIPMENT: { label: 'Office equipment', inventory: ['office_equipment'] },
  MACHINERY_PARTS: { label: 'Machineries / parts', inventory: ['machinery_parts', 'machineries_parts'] },
  COMPUTER_PERIPHERALS: { label: 'Peripherals / computer parts', inventory: ['computer_parts_peripherals', 'computer_peripherals', 'peripherals_computer_parts'] },
  TOOLS_EQUIPMENT: { label: 'Tools and equipment', inventory: ['tools_equipment', 'tools_and_equipment'] },
  ELECTRICAL_SUPPLIES: { label: 'Electrical supplies', inventory: ['electrical_supplies'] },
  OTHER_CONSUMABLES: { label: 'Other consumables', inventory: ['other_consumables'] },
  OTHER: { label: 'Others', inventory: ['other', 'others'] },
  PUBLICATIONS: { label: 'Publications', inventory: ['publications'] },
}

const normalizeCategory = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export const categoryLabel = (value: string) => CATEGORIES[value]?.label || value

// Whether an Item Master Data category is the one a requisition item asked for.
export function inventoryCategoryMatches(category: string, line: PurchaseRequisitionLine) {
  return (CATEGORIES[line.category]?.inventory || [normalizeCategory(line.category)]).includes(normalizeCategory(category))
}

// The Item Master Data category a requisition category points to, matched by name.
export function matchingInventoryCategory<T extends { name: string }>(requisitionCategory: string, inventoryCategories: T[]) {
  const names = CATEGORIES[requisitionCategory]?.inventory || [normalizeCategory(requisitionCategory)]
  return inventoryCategories.find((category) => names.includes(normalizeCategory(category.name)))
}

// Same name-and-category match the server uses when it reserves stock for a requested item.
export function inventoryMatchesLine(item: { itemName: string; category: string }, line: PurchaseRequisitionLine) {
  return item.itemName.trim().toLowerCase() === line.itemName.trim().toLowerCase() && inventoryCategoryMatches(item.category, line)
}
