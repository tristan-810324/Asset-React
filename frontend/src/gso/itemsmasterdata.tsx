import React, { useEffect, useState } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import {
  createInventoryCategory,
  createInventoryCategoryItemName,
  createInventoryItem,
  createInventoryItems,
  deleteInventoryCategory,
  deleteInventoryCategoryItemName,
  listInventoryCategories,
  listInventoryCategoryItemNames,
  listInventoryItems,
  restockInventoryItem,
  renameInventoryCategory,
  updateInventoryItem,
  type InventoryCategory,
  type InventoryCategoryItemName,
  type InventoryChangeRecord,
  type InventoryAssetTag,
  type InventoryItemRecord,
  type InventoryReceiptRecord,
  type InventoryTrackingMode,
} from './inventoryApi'
import { addGsoNotification } from './notificationStore'

type ItemHistoryEntry = {
  previous: string
  next: string
  changedAt: string
  by: string
  actorLabel?: string
  note: string
  tone: string
}

type InventoryItem = {
  id?: string
  code: string
  name: string
  description: string
  trackingMode: InventoryTrackingMode
  manufacturerSerialNumber: string | null
  storageLocation: string
  assetTags: InventoryAssetTag[]
  receiptHistory: InventoryReceiptRecord[]
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
  availableQuantity: string
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
const addItemConditionOptions = ['New', 'Good', 'Fair']
const unitOfMeasureOptions = ['piece', 'unit', 'box', 'pack', 'ream', 'set', 'pair', 'roll', 'bottle', 'carton', 'bundle']

function categoryItemNameOptionsFor(
  categoryName: string,
  categories: InventoryCategory[],
  itemNames: InventoryCategoryItemName[],
) {
  const categoryId = categories.find((category) => category.name === categoryName)?.id
  return categoryId ? itemNames.filter((itemName) => itemName.categoryId === categoryId) : []
}

function categoryInitials(category: string) {
  const initials = (category.match(/[A-Za-z0-9]+/g) || [])
    .map((word) => word[0])
    .join('')
    .toUpperCase()
  return initials.slice(0, 4) || 'OTH'
}

const MAX_INDIVIDUAL_ITEMS_PER_SAVE = 500

function inventoryItemCodeRange(category: string, quantity: number, inventoryItems: InventoryItem[]) {
  if (!category || !Number.isInteger(quantity) || quantity < 1) return null
  const prefix = `AST-${categoryInitials(category)}-`
  const codePattern = new RegExp(`^${prefix}(\\d+)(?:\\s*[–-]\\s*${prefix}(\\d+))?$`, 'i')
  const highestNumber = inventoryItems.reduce((highest, item) => {
    const match = item.code.match(codePattern)
    return match ? Math.max(highest, Number(match[2] || match[1])) : highest
  }, 0)
  const firstNumber = highestNumber + 1
  const lastNumber = highestNumber + quantity
  const formatCode = (number: number) => `${prefix}${String(number).padStart(4, '0')}`
  const firstCode = formatCode(firstNumber)
  const lastCode = formatCode(lastNumber)
  return {
    prefix,
    firstNumber,
    lastNumber,
    firstCode,
    lastCode,
    display: quantity > 1 ? `${firstCode} – ${lastCode}` : firstCode,
  }
}

function inventoryItemCodes(category: string, quantity: number, inventoryItems: InventoryItem[]) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_INDIVIDUAL_ITEMS_PER_SAVE) return []
  const range = inventoryItemCodeRange(category, quantity, inventoryItems)
  if (!range) return []
  return Array.from({ length: quantity }, (_, index) => `${range.prefix}${String(range.firstNumber + index).padStart(4, '0')}`)
}

function nextInventoryItemCode(category: string, inventoryItems: InventoryItem[]) {
  return inventoryItemCodeRange(category, 1, inventoryItems)?.firstCode || ''
}

function calculateAcquisitionCost(quantity: string | number, unitCost: string | number) {
  const normalizedQuantity = quantity === '' ? 1 : Number(quantity)
  const normalizedUnitCost = unitCost === '' ? 0 : Number(unitCost)
  const total = normalizedQuantity * normalizedUnitCost
  return Number.isFinite(total) ? Math.round((total + Number.EPSILON) * 100) / 100 : 0
}

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

function assignedCustodianForList(item: Pick<InventoryItem, 'assignedTo' | 'condition'>) {
  const hasCustodian = item.assignedTo.trim() !== ''
    && item.assignedTo !== 'In Storage'
    && item.assignedTo !== '—'

  if (hasCustodian) return item.assignedTo

  const condition = item.condition.trim().toLowerCase()
  if (condition === 'needs repair') return 'For Repair'
  if (condition === 'under maintenance') return 'Under Maintenance'
  if (condition === 'unserviceable' || condition === 'retired') return '—'
  return item.assignedTo
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

function downloadInventoryFile(fileName: string, content: BlobPart[], mimeType: string) {
  const file = new Blob(content, { type: mimeType })
  const fileUrl = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = fileUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(fileUrl), 0)
}

function generateInventorySpreadsheet(data: InventoryItem[], selectedDate: string) {
  if (data.length === 0) {
    alert('There is no inventory data to export to Excel.')
    return
  }

  const escapeHTML = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
  const totalQuantity = data.reduce((total, item) => total + (Number(item.quantityValue ?? item.quantity) || 0), 0)
  const availableQuantity = data.reduce((total, item) => total + (Number(item.availableQuantity) || 0), 0)
  const needsAttentionCount = data.filter((item) => {
    const condition = item.condition.toLowerCase()
    return condition.includes('repair') || condition.includes('maintenance') || condition === 'unserviceable'
  }).length
  const generatedAt = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date())

  const reportRows = data.map((item, index) => {
    const rowBackground = index % 2 === 0 ? '#ffffff' : '#f1f5f9'
    const conditionColor = item.conditionTone.includes('emerald')
      ? '#047857'
      : item.conditionTone.includes('sky')
        ? '#0369a1'
        : item.conditionTone.includes('amber')
          ? '#b45309'
          : item.conditionTone.includes('rose')
            ? '#be123c'
            : '#475569'
    const conditionBackground = item.conditionTone.includes('emerald')
      ? '#ecfdf5'
      : item.conditionTone.includes('sky')
        ? '#f0f9ff'
        : item.conditionTone.includes('amber')
          ? '#fffbeb'
          : item.conditionTone.includes('rose')
            ? '#fff1f2'
            : '#f1f5f9'
    const statusStyle = item.statusTone.includes('emerald')
      ? 'background:#ecfdf5;color:#047857;'
      : item.statusTone.includes('blue')
        ? 'background:#eff6ff;color:#1d4ed8;'
        : item.statusTone.includes('violet')
          ? 'background:#f5f3ff;color:#6d28d9;'
          : 'background:#fffbeb;color:#b45309;'

    return `<tr style="background:${rowBackground};">
      <td style="width:250px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong style="color:#0f172a;">${escapeHTML(item.name)}</strong><br>
        <span style="font-size:10pt;color:#475569;">${escapeHTML(item.code)}</span><br>
        <span style="font-size:9pt;color:#64748b;">${escapeHTML(item.category)}</span><br>
        <span style="font-size:9pt;color:#1d4ed8;font-weight:bold;">${item.trackingMode === 'individual' ? 'Per-unit asset' : 'Bulk quantity'}</span>
      </td>
      <td style="width:150px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong>${escapeHTML(item.acquired)}</strong><br>
        <span style="font-size:10pt;color:#64748b;">${escapeHTML(item.time)}</span>
      </td>
      <td style="width:180px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong style="color:#0f172a;">Unit ${escapeHTML(item.unitCost)}</strong><br>
        <span style="font-size:9pt;color:#475569;">Acquired ${escapeHTML(item.acquisitionCost)}</span>
      </td>
      <td style="width:220px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong>${escapeHTML(item.availableQuantity)} available / ${escapeHTML(item.quantity)} total ${escapeHTML(item.unit)}</strong><br>
        <span style="display:inline-block;margin-top:5px;padding:4px 7px;background:${conditionBackground};color:${conditionColor};font-weight:bold;">${escapeHTML(item.condition)}</span>
      </td>
      <td style="width:260px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">${escapeHTML(assignedCustodianForList(item))}</td>
      <td style="width:140px;padding:10px;border:1px solid #dbe3ef;vertical-align:top;">
        <span style="${statusStyle}display:inline-block;padding:4px 7px;font-weight:bold;">${escapeHTML(item.status)}</span>
      </td>
    </tr>`
  }).join('')

  const dateSummary = selectedDate
    ? `Filtered by acquisition date: ${escapeHTML(formatAcquiredDate(selectedDate))}`
    : 'Includes the records matching the selected filters'
  const workbookHTML = `<!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <meta name="ProgId" content="Excel.Sheet">
        <title>Inventory Master List Report</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; color: #1e293b; }
          table { border-collapse: collapse; }
          .report-table { table-layout: fixed; width: 1200px; }
          .report-table th { padding: 10px; background: #09244a; color: #ffffff; border: 1px solid #09244a; text-align: left; }
          .summary td { padding: 10px 14px; border: 1px solid #dbe3ef; }
          .report-table td { mso-number-format: "\\@"; }
        </style>
      </head>
      <body>
        <table style="width:1200px;margin-bottom:14px;border-collapse:collapse;">
          <tr><td colspan="6" style="padding:18px 20px;background:#09244a;color:#ffffff;">
            <div style="font-size:10pt;font-weight:bold;letter-spacing:1px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
            <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Inventory Master List Report</h1>
            <div style="font-size:10pt;color:#dbeafe;">Generated ${escapeHTML(generatedAt)} · ${dateSummary}</div>
          </td></tr>
        </table>
        <table class="summary" style="width:1200px;margin-bottom:16px;border-collapse:collapse;">
          <tr>
            <td style="width:25%;background:#f8fafc;"><div style="font-size:9pt;color:#64748b;">TOTAL ITEMS</div><strong style="font-size:16pt;color:#09244a;">${data.length}</strong></td>
            <td style="width:25%;background:#eff6ff;"><div style="font-size:9pt;color:#1d4ed8;">TOTAL STOCK</div><strong style="font-size:16pt;color:#1d4ed8;">${totalQuantity}</strong></td>
            <td style="width:25%;background:#ecfdf5;"><div style="font-size:9pt;color:#047857;">AVAILABLE QUANTITY</div><strong style="font-size:16pt;color:#047857;">${availableQuantity}</strong></td>
            <td style="width:25%;background:#fff1f2;"><div style="font-size:9pt;color:#be123c;">NEEDS ATTENTION</div><strong style="font-size:16pt;color:#be123c;">${needsAttentionCount}</strong></td>
          </tr>
        </table>
        <table class="report-table">
          <colgroup>
            <col style="width:250px;"><col style="width:150px;"><col style="width:180px;">
            <col style="width:220px;"><col style="width:260px;"><col style="width:140px;">
          </colgroup>
          <thead><tr>
            <th>Item</th><th>Acquired</th><th>Value</th>
            <th>Stock / Condition</th><th>Assigned / Custodian</th><th>Status</th>
          </tr></thead>
          <tbody>${reportRows}</tbody>
        </table>
      </body>
    </html>`

  downloadInventoryFile(
    `Inventory_Master_List_Styled_Report_${new Date().toISOString().slice(0, 10)}.xls`,
    ['\uFEFF', workbookHTML],
    'application/vnd.ms-excel;charset=utf-8',
  )
}

function generateInventoryWord(data: InventoryItem[], selectedDate: string) {
  if (data.length === 0) {
    alert('There is no inventory data to export to Word.')
    return
  }

  const escapeHTML = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
  const totalQuantity = data.reduce((total, item) => total + (Number(item.quantityValue) || 0), 0)
  const availableQuantity = data.reduce((total, item) => total + (Number(item.availableQuantity) || 0), 0)
  const generatedAt = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date())

  const reportRows = data.map((item, index) => {
    const rowBackground = index % 2 === 0 ? '#ffffff' : '#f8fafc'
    const conditionTone = item.conditionTone.includes('emerald')
      ? { background: '#ecfdf5', color: '#047857' }
      : item.conditionTone.includes('sky')
        ? { background: '#f0f9ff', color: '#0369a1' }
        : item.conditionTone.includes('amber')
          ? { background: '#fffbeb', color: '#b45309' }
          : item.conditionTone.includes('rose')
            ? { background: '#fff1f2', color: '#be123c' }
            : { background: '#f1f5f9', color: '#475569' }
    const statusColor = item.statusTone.includes('emerald')
      ? '#047857'
      : item.statusTone.includes('blue')
        ? '#1d4ed8'
        : item.statusTone.includes('rose')
          ? '#be123c'
          : '#475569'

    return `<tr style="background:${rowBackground};page-break-inside:avoid;">
      <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong style="color:#0f172a;">${escapeHTML(item.name)}</strong><br>
        <span style="font-size:9pt;color:#475569;">Code: ${escapeHTML(item.code)}</span><br>
        <span style="font-size:9pt;color:#64748b;">${escapeHTML(item.category)}</span><br>
        <span style="font-size:9pt;color:#1d4ed8;font-weight:bold;">${item.trackingMode === 'individual' ? 'Per-unit asset' : 'Bulk quantity'}</span>
      </td>
      <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;white-space:nowrap;">
        <strong>${escapeHTML(item.acquired)}</strong><br>
        <span style="font-size:9pt;color:#64748b;">${escapeHTML(item.time)}</span>
      </td>
      <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong>Unit ${escapeHTML(item.unitCost)}</strong><br>
        <span style="font-size:9pt;color:#475569;">Acquired ${escapeHTML(item.acquisitionCost)}</span>
      </td>
      <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">
        <strong>${escapeHTML(item.availableQuantity)} available / ${escapeHTML(item.quantity)} total ${escapeHTML(item.unit)}</strong><br>
        <span style="display:inline-block;margin-top:5px;padding:3px 7px;background:${conditionTone.background};color:${conditionTone.color};font-weight:bold;">${escapeHTML(item.condition)}</span>
      </td>
      <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;">${escapeHTML(assignedCustodianForList(item))}</td>
      <td style="padding:9px;border:1px solid #dbe3ef;vertical-align:top;color:${statusColor};font-weight:bold;">${escapeHTML(item.status)}</td>
    </tr>`
  }).join('')

  const dateSummary = selectedDate
    ? `Filtered by acquisition date: ${escapeHTML(formatAcquiredDate(selectedDate))}`
    : 'Includes all acquisition dates'
  const documentHTML = `<!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>Inventory Master List Report</title>
        <style>
          @page Section1 { size: 11in 8.5in; mso-page-orientation: landscape; margin: 0.45in; }
          div.Section1 { page: Section1; }
          body { font-family: Arial, sans-serif; color: #1e293b; font-size: 10pt; }
          table { border-collapse: collapse; width: 100%; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="Section1">
          <table style="margin-bottom:16px;border-collapse:collapse;">
            <tr><td style="padding:18px 20px;background:#09244a;color:#ffffff;">
              <div style="font-size:9pt;font-weight:bold;letter-spacing:1.2px;color:#bfdbfe;">ASSET CUSTODY &amp; TRACKING</div>
              <h1 style="margin:7px 0 4px;font-size:22pt;color:#ffffff;">Inventory Master List</h1>
              <div style="font-size:9pt;color:#dbeafe;">Generated ${escapeHTML(generatedAt)} · ${dateSummary}</div>
            </td></tr>
          </table>
          <table style="margin-bottom:16px;border-collapse:separate;border-spacing:8px 0;">
            <tr>
              <td style="width:33.33%;padding:10px 12px;border:1px solid #dbe3ef;background:#f8fafc;"><div style="font-size:8pt;color:#64748b;text-transform:uppercase;">Records in this report</div><strong style="font-size:16pt;color:#09244a;">${data.length}</strong></td>
              <td style="width:33.33%;padding:10px 12px;border:1px solid #dbe3ef;background:#eff6ff;"><div style="font-size:8pt;color:#1d4ed8;text-transform:uppercase;">Total stock quantity</div><strong style="font-size:16pt;color:#1d4ed8;">${totalQuantity}</strong></td>
              <td style="width:33.33%;padding:10px 12px;border:1px solid #d1fae5;background:#ecfdf5;"><div style="font-size:8pt;color:#047857;text-transform:uppercase;">Available quantity</div><strong style="font-size:16pt;color:#047857;">${availableQuantity}</strong></td>
            </tr>
          </table>
          <table style="width:100%;border-collapse:collapse;font-size:9pt;">
            <thead><tr style="background:#09244a;color:#ffffff;">
              <th style="padding:9px;border:1px solid #09244a;text-align:left;">Item</th>
              <th style="padding:9px;border:1px solid #09244a;text-align:left;">Acquired</th>
              <th style="padding:9px;border:1px solid #09244a;text-align:left;">Value</th>
              <th style="padding:9px;border:1px solid #09244a;text-align:left;">Stock / Condition</th>
              <th style="padding:9px;border:1px solid #09244a;text-align:left;">Assigned / Custodian</th>
              <th style="padding:9px;border:1px solid #09244a;text-align:left;">Status</th>
            </tr></thead>
            <tbody>${reportRows}</tbody>
          </table>
          <p style="margin-top:12px;font-size:8pt;color:#64748b;">This report contains the inventory records matching the filters selected in Item Master Data.</p>
        </div>
      </body>
    </html>`

  downloadInventoryFile(
    `Inventory_Master_List_${new Date().toISOString().slice(0, 10)}.doc`,
    ['\uFEFF', documentHTML],
    'application/msword;charset=utf-8',
  )
}

function formatCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  const dateText = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
  const timeText = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
  return `${dateText} · ${timeText}`
}

const changeFieldLabels: Record<string, string> = {
  itemCode: 'Asset Code',
  category: 'Category',
  itemName: 'Item Name',
  description: 'Item Description',
  dateAcquired: 'Date Acquired',
  timeAcquired: 'Time Acquired',
  unitCost: 'Unit Cost',
  acquisitionCost: 'Total Cost',
  currentValue: 'Current Value',
  quantity: 'Quantity',
  unitOfMeasure: 'Unit',
  condition: 'Condition',
  trackingMode: 'Tracking Mode',
  employeeCode: 'Employee Code',
  firstName: 'First Name',
  lastName: 'Last Name',
  department: 'Department',
  position: 'Position',
  email: 'Email',
  status: 'Employment Status',
}

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'N/A'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function getChangeDetails(change: InventoryChangeRecord) {
  if (change.action === 'issued') {
    const condition = change.newValues.condition
    return condition === undefined ? [] : [`Condition before issuance: ${formatChangeValue(condition)}`]
  }
  if (change.action === 'returned') {
    const condition = change.newValues.condition
    return condition === undefined ? [] : [`Condition after return: ${formatChangeValue(condition)}`]
  }

  const fields = new Set([...Object.keys(change.oldValues), ...Object.keys(change.newValues)])
  return [...fields]
    .filter((field) => !['dateAcquired', 'timeAcquired'].includes(field))
    .filter((field) => JSON.stringify(change.oldValues[field]) !== JSON.stringify(change.newValues[field]))
    .map((field) => {
      const label = changeFieldLabels[field] || field.replace(/([A-Z])/g, ' $1')
      return `${label}: ${formatChangeValue(change.oldValues[field])} -> ${formatChangeValue(change.newValues[field])}`
    })
}

function buildItemConditionHistory(changeHistory: InventoryChangeRecord[]): ItemHistoryEntry[] {
  const chronologicalChanges = [...changeHistory].sort(
    (left, right) => new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime(),
  )
  const issuedConditionByEmployee = new Map<string, string>()
  const history: ItemHistoryEntry[] = []

  chronologicalChanges.forEach((change) => {
    const employeeMatch = change.reason.match(/(?:Issued to|Returned by)\s+(.+?)\s+\(([^)]+)\)/)
    const employeeName = typeof change.newValues.employeeName === 'string'
      ? change.newValues.employeeName
      : employeeMatch?.[1] || 'Employee'
    const employeeCode = typeof change.newValues.employeeCode === 'string'
      ? change.newValues.employeeCode
      : employeeMatch?.[2]
    const employeeIdentity = (employeeCode || employeeName).trim().toLowerCase()
    const employeeLabel = employeeCode ? `${employeeName} (${employeeCode})` : employeeName
    const nextCondition = change.newValues.condition

    if ((change.action === 'issued' || change.action === 'returned') && typeof nextCondition === 'string' && nextCondition) {
      const previousCondition = change.action === 'returned'
        ? issuedConditionByEmployee.get(employeeIdentity) || 'Before return'
        : 'Condition before issuance'

      history.push({
        previous: previousCondition,
        next: nextCondition,
        changedAt: formatCreatedAt(change.changedAt),
        by: change.action === 'issued' ? change.changedBy || 'Not recorded' : change.changedBy || 'GSO Staff',
        ...(change.action === 'issued' ? { actorLabel: 'Issued by GSO staff' } : {}),
        note: `${change.action === 'issued' ? 'Issued to' : 'Returned by'} ${employeeLabel}.`,
        tone: toneForCondition(nextCondition),
      })

      if (employeeIdentity) {
        if (change.action === 'issued') issuedConditionByEmployee.set(employeeIdentity, nextCondition)
        else issuedConditionByEmployee.delete(employeeIdentity)
      }
      return
    }

    if (change.action === 'updated'
      && JSON.stringify(change.oldValues.condition) !== JSON.stringify(change.newValues.condition)
      && typeof nextCondition === 'string'
      && nextCondition) {
      history.push({
        previous: formatChangeValue(change.oldValues.condition),
        next: nextCondition,
        changedAt: formatCreatedAt(change.changedAt),
        by: change.changedBy || 'GSO Staff',
        note: change.reason,
        tone: toneForCondition(nextCondition),
      })
    }
  })

  return history
}

function mapInventoryRecord(record: InventoryItemRecord): InventoryItem {
  const conditionTone = toneForCondition(record.condition)
  const statusTone = record.status === 'Available'
    ? 'bg-emerald-50 text-emerald-700'
    : record.status === 'Issued'
      ? 'bg-blue-50 text-blue-700'
      : record.status === 'Reserved' || record.status === 'Pending Approval'
        ? 'bg-violet-50 text-violet-700'
        : 'bg-amber-50 text-amber-700'

  const changeHistory = record.changeHistory || []

  return {
    id: record.id,
    code: record.itemCode,
    name: record.itemName,
    description: record.description,
    trackingMode: record.trackingMode,
    manufacturerSerialNumber: record.serialNumber
      || record.assetTags?.find((tag) => tag.serialNumber)?.serialNumber
      || null,
    storageLocation: record.storageLocation || 'GSO Storage',
    assetTags: record.assetTags || [],
    receiptHistory: record.receiptHistory || [],
    initials: record.itemName.trim().slice(0, 2).toUpperCase() || 'IT',
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
    availableQuantity: String(record.availableQuantity ?? record.quantity),
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
    changeHistory,
    history: buildItemConditionHistory(changeHistory),
  }
}

function inventoryAvatarTone(index: number) {
  return index % 2 === 0
    ? 'border-[#d6b333] bg-[#17377f] text-white'
    : 'border-[#17377f] bg-[#d6b333] text-[#17377f]'
}

export default function ItemsMasterData() {
  const [showAddItemModal, setShowAddItemModal] = useState(false)

  // Dynamic categories state
  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [showMasterDataModal, setShowMasterDataModal] = useState(false)
  const [masterDataManagerTab, setMasterDataManagerTab] = useState<'item_names' | 'categories'>('item_names')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryManagerError, setCategoryManagerError] = useState('')
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryReason, setEditingCategoryReason] = useState('')
  const [categoryToDelete, setCategoryToDelete] = useState<InventoryCategory | null>(null)
  const [categoryDeleteReason, setCategoryDeleteReason] = useState('')
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)
  const [itemNameOptions, setItemNameOptions] = useState<InventoryCategoryItemName[]>([])
  const [itemNameCategoryId, setItemNameCategoryId] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [itemNameSearch, setItemNameSearch] = useState('')
  const [itemNameManagerError, setItemNameManagerError] = useState('')
  const [isSavingItemName, setIsSavingItemName] = useState(false)
  const [deletingItemNameId, setDeletingItemNameId] = useState('')

  // Selected item modal state
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showItemHistoryModal, setShowItemHistoryModal] = useState(false)
  const [itemHistoryTab, setItemHistoryTab] = useState<'condition' | 'changes'>('condition')
  const [showItemEditModal, setShowItemEditModal] = useState(false)
  const [isUpdatingItem, setIsUpdatingItem] = useState(false)
  const [itemEditError, setItemEditError] = useState('')
  const [bulkRestockItemId, setBulkRestockItemId] = useState('')
  const [editFormData, setEditFormData] = useState({
    itemCode: '',
    category: '',
    itemName: '',
    description: '',
    trackingMode: 'individual' as InventoryTrackingMode,
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
  const [selectedItemNameFilter, setSelectedItemNameFilter] = useState('all')
  const [selectedConditionStatusFilter, setSelectedConditionStatusFilter] = useState('all')
  const [selectedTrackingModeFilter, setSelectedTrackingModeFilter] = useState<'all' | InventoryTrackingMode>('all')
  const [selectedInventoryDate, setSelectedInventoryDate] = useState('')

  // Add Item form state
  const [formData, setFormData] = useState({
    itemCode: '',
    category: '',
    itemName: '',
    description: '',
    trackingMode: 'individual' as InventoryTrackingMode,
    dateAcquired: '',
    timeAcquired: '',
    unitCost: '',
    acquisitionCost: '0.00',
    quantity: '1',
    unitOfMeasure: 'piece',
    condition: '',
  })
  // Items list state
  const [items, setItems] = useState<InventoryItem[]>([])
  const [isSavingItem, setIsSavingItem] = useState(false)
  const [inventoryLoadError, setInventoryLoadError] = useState('')

  const showActionAlert = (message: string, title = 'Notice') => {
    window.alert(`${title}\n\n${message}`)
  }

  const notifyAction = (title: string, message: string) => {
    addGsoNotification({
      module: 'Inventory',
      title,
      message,
      actionLabel: 'View inventory',
      href: '/gso/items',
    })
    showActionAlert(message, title)
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([listInventoryItems(), listInventoryCategories(), listInventoryCategoryItemNames()])
      .then(([records, categoryRecords, itemNameRecords]) => {
        if (!isMounted) return
        const savedItems = records.map(mapInventoryRecord)
        setItems(savedItems)
        setCategories(categoryRecords)
        setItemNameOptions(itemNameRecords)
        const defaultCategory = categoryRecords[0]?.name || ''
        setFormData((current) => {
          const selectedCategory = categoryRecords.some((category) => category.name === current.category)
            ? current.category
            : defaultCategory
          return {
            ...current,
            category: selectedCategory,
            itemCode: nextInventoryItemCode(selectedCategory, savedItems),
          }
        })
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'trackingMode' || name === 'category' || ['itemName', 'description', 'unitOfMeasure', 'condition'].includes(name)) {
      setBulkRestockItemId('')
    }
    setFormData((previous) => {
      const next = { ...previous, [name]: value }
      if (name === 'trackingMode') {
        next.trackingMode = value === 'quantity' ? 'quantity' : 'individual'
      }
      if (name === 'category') {
        next.itemName = ''
        next.itemCode = nextInventoryItemCode(value, items)
      }
      if (name === 'unitCost' || name === 'quantity') {
        next.acquisitionCost = calculateAcquisitionCost(
          name === 'quantity' ? value : previous.quantity,
          name === 'unitCost' ? value : previous.unitCost,
        ).toFixed(2)
      }
      if (name === 'quantity' && Number(value) === 1 && !previous.unitOfMeasure.trim()) {
        next.unitOfMeasure = 'piece'
      }
      return next
    })
  }

  const handleClearForm = (inventoryItems = items, categoryName = categories[0]?.name || '') => {
    setBulkRestockItemId('')
    setFormData({
      itemCode: nextInventoryItemCode(categoryName, inventoryItems),
      category: categoryName,
      itemName: '',
      description: '',
      trackingMode: 'individual',
      dateAcquired: '',
      timeAcquired: '',
      unitCost: '',
      acquisitionCost: '0.00',
      quantity: '1',
      unitOfMeasure: 'piece',
      condition: '',
    })
  }

  const closeAddItemModal = () => {
    setShowAddItemModal(false)
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
      setItemNameCategoryId(category.id)
      setFormData((prev) => ({
        ...prev,
        category: category.name,
        itemCode: nextInventoryItemCode(category.name, items),
        itemName: '',
      }))
      setNewCategoryName('')
      notifyAction('Category added', `Category "${category.name}" was added.`)
    } catch (error) {
      setCategoryManagerError(error instanceof Error ? error.message : 'Unable to add the category.')
    } finally {
      setIsSavingCategory(false)
    }
  }

  const handleAddItemName = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newItemName.trim()
    if (!itemNameCategoryId || !name) return

    setIsSavingItemName(true)
    setItemNameManagerError('')
    try {
      const itemName = await createInventoryCategoryItemName(itemNameCategoryId, name)
      setItemNameOptions((current) => [...current, itemName])
      setNewItemName('')
      const category = categories.find((entry) => entry.id === itemName.categoryId)
      if (category) {
        setFormData((current) => ({
          ...current,
          category: category.name,
          itemCode: nextInventoryItemCode(category.name, items),
          itemName: itemName.name,
        }))
      }
      notifyAction('Item name added', `Item name "${itemName.name}" was added.`)
    } catch (error) {
      setItemNameManagerError(error instanceof Error ? error.message : 'Unable to add this item name.')
    } finally {
      setIsSavingItemName(false)
    }
  }

  const handleDeleteItemName = async (id: string) => {
    setDeletingItemNameId(id)
    setItemNameManagerError('')
    try {
      const deletedItemName = await deleteInventoryCategoryItemName(id)
      const remainingItemNames = itemNameOptions.filter((itemName) => itemName.id !== deletedItemName.id)
      setItemNameOptions(remainingItemNames)
      const currentCategoryId = categories.find((category) => category.name === formData.category)?.id
      if (deletedItemName.categoryId === currentCategoryId) {
        if (formData.itemName === deletedItemName.name) {
          setFormData((current) => ({ ...current, itemName: '' }))
        }
      }
      notifyAction('Item name removed', `Item name "${deletedItemName.name}" was removed.`)
    } catch (error) {
      setItemNameManagerError(error instanceof Error ? error.message : 'Unable to delete this item name.')
    } finally {
      setDeletingItemNameId('')
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
      setFormData((current) => current.category === category.name
        ? { ...current, category: renamed.name, itemCode: nextInventoryItemCode(renamed.name, items), itemName: '' }
        : current)
      setEditFormData((current) => current.category === category.name ? { ...current, category: renamed.name } : current)
      setSelectedCategoryFilter((current) => current === category.name ? renamed.name : current)
      setEditingCategoryId(null)
      setEditingCategoryName('')
      setEditingCategoryReason('')
      notifyAction('Category updated', `Category was renamed to "${renamed.name}".`)
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
    const deletedCategoryName = categoryToDelete.name
    try {
      await deleteInventoryCategory(categoryToDelete.id, categoryDeleteReason.trim())
      const remainingCategories = categories.filter((entry) => entry.id !== categoryToDelete.id)
      const fallback = remainingCategories.find((entry) => entry.name === 'Others') || remainingCategories[0]
      const fallbackCategory = fallback?.name || ''
      const remainingItemNameOptions = itemNameOptions.filter((itemName) => itemName.categoryId !== categoryToDelete.id)
      setCategories(remainingCategories)
      setItemNameOptions(remainingItemNameOptions)
      setSelectedCategoryFilter((current) => current === categoryToDelete.name ? 'all' : current)
      setItemNameCategoryId((current) => current === categoryToDelete.id ? fallback?.id || '' : current)
      setFormData((current) => current.category === categoryToDelete.name
        ? { ...current, category: fallbackCategory, itemCode: nextInventoryItemCode(fallbackCategory, items), itemName: '' }
        : current)
      setEditFormData((current) => current.category === categoryToDelete.name ? { ...current, category: fallbackCategory } : current)
      setCategoryToDelete(null)
      setCategoryDeleteReason('')
      notifyAction('Category removed', `Category "${deletedCategoryName}" was removed.`)
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
      itemName: selectedItem.name,
      description: selectedItem.description,
      trackingMode: selectedItem.trackingMode,
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
    setEditFormData((current) => {
      const next = { ...current, [name]: value }
      if (name === 'category') {
        const nextCategoryItemNames = categoryItemNameOptionsFor(value, categories, itemNameOptions)
        const currentNameIsAvailable = nextCategoryItemNames.some(
          (itemName) => itemName.name.toLocaleLowerCase() === current.itemName.toLocaleLowerCase(),
        )
        next.itemName = currentNameIsAvailable ? current.itemName : ''
      }
      if (name === 'trackingMode') {
        next.trackingMode = value === 'quantity' ? 'quantity' : 'individual'
      }
      if (name === 'unitCost' || name === 'quantity') {
        const nextUnitCost = name === 'unitCost' ? value : current.unitCost
        const nextQuantity = name === 'quantity' ? value : current.quantity
        const normalizedNextUnitCost = nextUnitCost === '' ? 0 : Number(nextUnitCost)
        const normalizedNextQuantity = nextQuantity === '' ? 1 : Number(nextQuantity)
        const matchesOriginalValuation = selectedItem
          && normalizedNextUnitCost === Number(selectedItem.unitCostValue ?? 0)
          && normalizedNextQuantity === Number(selectedItem.quantityValue ?? 1)
        next.acquisitionCost = matchesOriginalValuation
          ? String(selectedItem.acquisitionCostValue ?? calculateAcquisitionCost(nextQuantity, nextUnitCost))
          : calculateAcquisitionCost(nextQuantity, nextUnitCost).toFixed(2)
      }
      if (name === 'quantity' && Number(value) === 1 && !current.unitOfMeasure.trim()) {
        next.unitOfMeasure = 'piece'
      }
      return next
    })
  }

  const handleUpdateSelectedItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem?.id) return
    if (!editFormData.itemCode.trim() || !editFormData.itemName.trim() || !editFormData.description.trim() || !editFormData.reason.trim()) {
      setItemEditError('Choose an item name, enter an item description, and provide a reason for the change.')
      return
    }
    if (!editItemNameIsCatalogued && !editItemNameIsCurrentLegacyValue) {
      setItemEditError('Choose an item name saved under the selected category.')
      return
    }
    const unitCost = editFormData.unitCost ? Number(editFormData.unitCost) : 0
    const quantity = editFormData.quantity ? Number(editFormData.quantity) : 1
    const acquisitionCost = editFormData.acquisitionCost
      ? Number(editFormData.acquisitionCost)
      : calculateAcquisitionCost(quantity, unitCost)
    const currentValue = editFormData.currentValue ? Number(editFormData.currentValue) : null
    const previousUnitCost = Number(selectedItem.unitCostValue ?? 0)
    const previousQuantity = Number(selectedItem.quantityValue ?? 1)
    const previousCurrentValue = selectedItem.currentValueValue === null || selectedItem.currentValueValue === undefined
      ? null
      : Number(selectedItem.currentValueValue)
    const valuationChanged = unitCost !== previousUnitCost || quantity !== previousQuantity || currentValue !== previousCurrentValue
    if (valuationChanged && currentValue !== null && currentValue > acquisitionCost) {
      setItemEditError('Current assessed value cannot exceed the calculated acquisition cost.')
      return
    }

    setIsUpdatingItem(true)
    setItemEditError('')
    try {
      const savedRecord = await updateInventoryItem(selectedItem.id, {
        itemCode: editFormData.itemCode.trim(),
        category: editFormData.category,
        itemName: editFormData.itemName.trim(),
        description: editFormData.description.trim(),
        trackingMode: editFormData.trackingMode,
        dateAcquired: editFormData.dateAcquired,
        timeAcquired: editFormData.timeAcquired,
        unitCost,
        acquisitionCost,
        currentValue,
        quantity,
        unitOfMeasure: editFormData.unitOfMeasure.trim() || 'piece',
        condition: editFormData.condition,
        reason: editFormData.reason.trim(),
      })
      const updatedItem = mapInventoryRecord(savedRecord)
      setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item))
      setSelectedItem(updatedItem)
      setShowItemEditModal(false)
      notifyAction('Inventory item updated', `"${updatedItem.name}" (${updatedItem.code}) was updated successfully.`)
    } catch (error) {
      setItemEditError(error instanceof Error ? error.message : 'Unable to update the inventory item.')
    } finally {
      setIsUpdatingItem(false)
    }
  }

  const handleSaveItem = async () => {
    if (!formData.itemCode.trim() || !formData.itemName.trim() || !formData.description.trim()) {
      showActionAlert('Enter the item code, item name, and item description.', 'Unable to save item')
      return
    }
    if (!formData.condition) {
      showActionAlert('Select the condition for every unit in this batch or bulk stock record.', 'Condition required')
      return
    }

    const unitCost = formData.unitCost ? Number(formData.unitCost) : 0
    const quantity = formData.quantity ? Number(formData.quantity) : 1
    const isIndividualTracking = formData.trackingMode === 'individual'
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      showActionAlert('Enter a valid non-negative cost per unit.', 'Invalid cost')
      return
    }
    const maximumQuantity = isIndividualTracking ? MAX_INDIVIDUAL_ITEMS_PER_SAVE : 2147483647
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maximumQuantity) {
      showActionAlert(`Enter a whole number from 1 to ${maximumQuantity.toLocaleString()} for the ${isIndividualTracking ? 'asset batch' : 'stock quantity'}.`, 'Invalid quantity')
      return
    }
    setIsSavingItem(true)
    try {
      if (formRestockTarget?.id && !isIndividualTracking) {
        const updatedRecord = await restockInventoryItem(formRestockTarget.id, {
          quantity,
          unitCost,
          dateAcquired: formData.dateAcquired,
          timeAcquired: formData.timeAcquired,
          condition: formData.condition,
          receiptReference: '',
        })
        const updatedItem = mapInventoryRecord(updatedRecord)
        const nextItems = items.map((item) => item.id === updatedItem.id ? updatedItem : item)
        setItems(nextItems)
        setSelectedItem((current) => current?.id === updatedItem.id ? updatedItem : current)
        setInventoryLoadError('')
        handleClearForm(nextItems, formData.category)
        closeAddItemModal()
        notifyAction('Bulk stock restocked', `${quantity} ${updatedItem.unit} were added to ${updatedItem.code}. The delivery was saved in receipt history.`)
        return
      }

      const bulkCodeRange = isIndividualTracking
        ? null
        : inventoryItemCodeRange(formData.category, quantity, items)
      const codeCount = isIndividualTracking ? quantity : 1
      const itemCodes = isIndividualTracking
        ? inventoryItemCodes(formData.category, quantity, items)
        : bulkCodeRange ? [bulkCodeRange.display] : []
      if (itemCodes.length !== codeCount) {
        throw new Error('Unable to generate item codes. Please check the quantity and try again.')
      }
      const newInventoryRecords = itemCodes.map((itemCode) => ({
        itemCode,
        category: formData.category,
        itemName: formData.itemName.trim(),
        description: formData.description.trim(),
        trackingMode: formData.trackingMode,
        storageLocation: 'GSO Storage',
        receiptReference: '',
        dateAcquired: formData.dateAcquired,
        timeAcquired: formData.timeAcquired,
        unitCost,
        acquisitionCost: isIndividualTracking ? unitCost : calculateAcquisitionCost(quantity, unitCost),
        currentValue: null,
        quantity: isIndividualTracking ? 1 : quantity,
        unitOfMeasure: formData.unitOfMeasure.trim() || 'piece',
        condition: formData.condition || 'New',
      }))
      const savedRecords = isIndividualTracking && quantity > 1
        ? await createInventoryItems(newInventoryRecords)
        : [await createInventoryItem(newInventoryRecords[0])]
      const newItems = savedRecords.map(mapInventoryRecord)
      const newItemCodes = new Set(newItems.map((item) => item.code.toLowerCase()))
      const nextItems = [...newItems, ...items.filter((item) => !newItemCodes.has(item.code.toLowerCase()))]
      setItems(nextItems)
      setInventoryLoadError('')
      handleClearForm(nextItems, formData.category)
      closeAddItemModal()
      notifyAction(
        isIndividualTracking
          ? (quantity === 1 ? 'Asset added' : 'Assets added')
          : 'Bulk stock added',
        isIndividualTracking
          ? `${quantity} ${quantity === 1 ? 'individual asset was' : 'individual assets were'} added. Barcode labels are available after issuance approval.`
          : `${quantity} ${formData.unitOfMeasure.trim() || 'piece'} of ${formData.itemName.trim()} were added as quantity-tracked stock (${bulkCodeRange?.display || itemCodes[0]}).`,
      )
    } catch (error) {
      showActionAlert(error instanceof Error ? error.message : 'Unable to save the item. Please try again.', 'Unable to save item')
    } finally {
      setIsSavingItem(false)
    }
  }

  // Filter logic for searching
  const savedFilterItemNames = selectedCategoryFilter === 'all'
    ? itemNameOptions
    : categoryItemNameOptionsFor(selectedCategoryFilter, categories, itemNameOptions)
  const itemNameFilterOptions = Array.from(new Map(
    [
      ...savedFilterItemNames.map((itemName) => itemName.name),
      ...items
        .filter((item) => selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter)
        .map((item) => item.name),
    ]
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => [name.toLocaleLowerCase(), name]),
  ).values()).sort((firstName, secondName) => firstName.localeCompare(secondName))

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const filteredItems = items.filter((item) => {
    const matchesSearch = [item.name, item.description, item.code, item.assignedTo]
      .some((value) => value.toLocaleLowerCase().includes(normalizedSearch))

    const matchesCategory = selectedCategoryFilter === 'all' || item.category === selectedCategoryFilter
    const matchesItemName = selectedItemNameFilter === 'all'
      || item.name.toLocaleLowerCase() === selectedItemNameFilter.toLocaleLowerCase()
    const [conditionStatusType, conditionStatusValue] = selectedConditionStatusFilter.split(':', 2)
    const matchesCondition = conditionStatusType !== 'condition' || item.condition === conditionStatusValue
    const matchesStatus = conditionStatusType !== 'status' || item.status === conditionStatusValue
    const matchesTrackingMode = selectedTrackingModeFilter === 'all' || item.trackingMode === selectedTrackingModeFilter

    return matchesSearch && matchesCategory && matchesItemName && matchesCondition && matchesStatus && matchesTrackingMode
  })
  const fullInventoryItems = selectedInventoryDate
    ? filteredItems.filter((item) => item.dateAcquiredValue?.slice(0, 10) === selectedInventoryDate)
    : filteredItems
  const displayedItems = fullInventoryItems
  const selectedItemAvatarIndex = selectedItem
    ? displayedItems.findIndex((item) => selectedItem.id ? item.id === selectedItem.id : item.code === selectedItem.code)
    : -1
  const fallbackSelectedItemAvatarIndex = selectedItem
    ? items.findIndex((item) => selectedItem.id ? item.id === selectedItem.id : item.code === selectedItem.code)
    : -1
  const selectedItemAvatarClass = inventoryAvatarTone(
    selectedItemAvatarIndex >= 0 ? selectedItemAvatarIndex : Math.max(fallbackSelectedItemAvatarIndex, 0),
  )
  const formCategoryItemNames = categoryItemNameOptionsFor(formData.category, categories, itemNameOptions)
  const editCategoryItemNames = categoryItemNameOptionsFor(editFormData.category, categories, itemNameOptions)
  const editItemNameIsCatalogued = editCategoryItemNames.some(
    (itemName) => itemName.name.toLocaleLowerCase() === editFormData.itemName.toLocaleLowerCase(),
  )
  const editItemNameIsCurrentLegacyValue = Boolean(
    selectedItem
      && selectedItem.category === editFormData.category
      && selectedItem.name.toLocaleLowerCase() === editFormData.itemName.toLocaleLowerCase(),
  )
  const requestedItemCount = Number(formData.quantity)
  const formRestockCandidates = formData.trackingMode === 'quantity'
    && formData.category && formData.itemName.trim() && formData.description.trim() && formData.condition
    ? items.filter((item) => item.id
      && item.trackingMode === 'quantity'
      && item.category.toLocaleLowerCase() === formData.category.toLocaleLowerCase()
      && item.name.toLocaleLowerCase() === formData.itemName.trim().toLocaleLowerCase()
      && item.description.toLocaleLowerCase() === formData.description.trim().toLocaleLowerCase()
      && item.unit.toLocaleLowerCase() === (formData.unitOfMeasure.trim() || 'piece').toLocaleLowerCase()
      && item.condition === formData.condition)
    : []
  const formRestockTarget = formRestockCandidates.find((item) => item.id === bulkRestockItemId) || null
  const formItemCodeCount = formData.trackingMode === 'individual' ? requestedItemCount : 1
  const formItemCodes = inventoryItemCodes(formData.category, formItemCodeCount, items)
  const formBulkCodeRange = formData.trackingMode === 'quantity'
    ? inventoryItemCodeRange(formData.category, requestedItemCount, items)
    : null
  const itemCodePreview = formRestockTarget?.code
    || (formData.trackingMode === 'quantity'
      ? formBulkCodeRange?.display || formItemCodes[0] || formData.itemCode
      : formItemCodes.length > 1
        ? `${formItemCodes[0]} – ${formItemCodes[formItemCodes.length - 1]}`
        : formItemCodes[0] || formData.itemCode)
  const formQuantity = Number.isInteger(requestedItemCount) && requestedItemCount > 0 ? requestedItemCount : 0
  const formReceiptTotal = calculateAcquisitionCost(formQuantity, formData.unitCost)
  const selectedFormCategoryId = categories.find((category) => category.name === formData.category)?.id || ''
  const categoryManagedItemNames = itemNameOptions.filter((itemName) => itemName.categoryId === itemNameCategoryId)
  const managedItemNames = categoryManagedItemNames.filter((itemName) => itemName.name.toLowerCase().includes(itemNameSearch.trim().toLowerCase()))
  const managedItemNameCategory = categories.find((category) => category.id === itemNameCategoryId)
  const handleOpenItemNameManager = () => {
    setItemNameCategoryId(selectedFormCategoryId)
    setNewItemName('')
    setItemNameSearch('')
    setItemNameManagerError('')
    setMasterDataManagerTab('item_names')
    setShowMasterDataModal(true)
  }
  const handleOpenEditItemNameManager = () => {
    setItemNameCategoryId(categories.find((category) => category.name === editFormData.category)?.id || '')
    setNewItemName('')
    setItemNameSearch('')
    setItemNameManagerError('')
    setMasterDataManagerTab('item_names')
    setShowMasterDataModal(true)
  }
  const editFieldLabelClass = 'mb-2 block text-sm font-extrabold text-slate-900'
  const editControlClass = 'h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100'

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
         
        </div>

        {/* INVENTORY ACTION */}
        <div className="relative mt-6 flex gap-2 border-t border-blue-400/20 pt-4">
          <button
            type="button"
            onClick={() => setShowAddItemModal(true)}
            className="rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-blue-950 shadow-md transition hover:bg-blue-50"
          >
            + Add & Overview
          </button>
        </div>
      </section>

      {/* TAB 1: ADD ITEM FORM SECTION */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5"
          onClick={closeAddItemModal}
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-item-modal-title"
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-[#d6b333] bg-[#17377f] text-sm font-black text-white shadow-sm">
                AI
              </span>
              <div className="min-w-0">
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Inventory management</p>
                <h2 id="add-item-modal-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Add an inventory item</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">Add item details, select how it is tracked, and record its acquisition.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAddItemModal}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
            >
              Close
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-7 sm:py-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Item details</h3>
              <p className="mt-1 text-sm text-slate-600">Choose a category and a saved item name. The item code is generated automatically.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={editFieldLabelClass}>Category</span>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className={editControlClass}
              >
                {categories.map((category) => (
                  <option key={category.id || category.name} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>Item name <span className="text-rose-600">*</span></span>
              <select
                name="itemName"
                value={formData.itemName}
                onChange={handleInputChange}
                required
                className={editControlClass}
              >
                <option value="" disabled>
                  {formCategoryItemNames.length > 0 ? 'Select an item name' : 'No item names yet — click Add Item Name'}
                </option>
                {formCategoryItemNames.map((itemName) => <option key={itemName.id} value={itemName.name}>{itemName.name}</option>)}
              </select>
              <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>If the name is missing, add it to this category.</span>
                <button type="button" onClick={handleOpenItemNameManager} className="font-bold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-900">Manage names</button>
              </span>
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>Generated item code(s) <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">Read-only</span></span>
              <input
                type="text"
                name="itemCode"
                value={itemCodePreview}
                readOnly
                aria-readonly="true"
                placeholder="Choose a category to generate a code"
                className={`${editControlClass} border-slate-300 bg-slate-100 font-semibold text-slate-700`}
              />
              <span className="mt-2 block text-xs leading-relaxed text-slate-600">
                {formData.trackingMode === 'individual'
                  ? 'Each physical asset receives its own item code.'
                  : formRestockTarget
                    ? `Restocking keeps code ${formRestockTarget.code}.`
                    : 'This item-code range is reserved for the bulk quantity.'}
              </span>
            </label>

            <label className="block sm:col-span-2">
              <span className={editFieldLabelClass}>Item description <span className="text-rose-600">*</span></span>
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                maxLength={500}
                placeholder="Describe the item"
                className={editControlClass}
              />
            </label>
            </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900">Tracking &amp; acquisition</h3>
                <p className="mt-1 text-sm text-slate-600">Choose how this item is tracked and enter its acquisition details.</p>
              </div>
              <fieldset>
              <legend className={editFieldLabelClass}>Tracking mode</legend>
              <p className="-mt-1 mb-3 text-xs leading-relaxed text-slate-600">Select how this inventory will be counted and issued.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: 'individual' as const, title: 'Per-unit asset', description: 'Equipment tracked separately; its barcode label becomes available after issuance approval.' },
                  { value: 'quantity' as const, title: 'Bulk quantity', description: 'Interchangeable supplies tracked together by quantity, without a label while in storage.' },
                ]).map((option) => (
                  <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition ${formData.trackingMode === option.value ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <input
                      type="radio"
                      name="trackingMode"
                      value={option.value}
                      checked={formData.trackingMode === option.value}
                      onChange={handleInputChange}
                      className="mt-0.5 h-4 w-4 accent-blue-600"
                    />
                    <span>
                      <span className="block text-sm font-extrabold text-slate-900">{option.title}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-600">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              </fieldset>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">

            <label className="block">
              <span className={editFieldLabelClass}>Date of acquisition</span>
              <input
                type="date"
                name="dateAcquired"
                value={formData.dateAcquired}
                onChange={handleInputChange}
                className={editControlClass}
              />
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>Time of acquisition</span>
              <input
                type="time"
                name="timeAcquired"
                value={formData.timeAcquired}
                onChange={handleInputChange}
                className={editControlClass}
              />
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>Cost per unit</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="unitCost"
                value={formData.unitCost}
                onChange={handleInputChange}
                placeholder="0.00"
                className={editControlClass}
              />
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>{formData.trackingMode === 'individual' ? 'Number of physical assets' : 'Stock quantity'}</span>
              <input
                type="number"
                min="1"
                max={formData.trackingMode === 'individual' ? MAX_INDIVIDUAL_ITEMS_PER_SAVE : 2147483647}
                step="1"
                name="quantity"
                value={formData.quantity}
                onChange={handleInputChange}
                placeholder="Enter number of items"
                className={editControlClass}
              />
              <span className="mt-2 block text-xs leading-relaxed text-slate-600">
                {formData.trackingMode === 'individual'
                  ? 'Each unit is saved as its own record. Its barcode label is prepared after issuance approval.'
                  : 'The quantity stays together under one item code. No stock label is printed while it is in storage.'}
              </span>
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>{formRestockTarget ? 'Delivery total cost' : 'Total acquisition cost'} <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">Calculated</span></span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="acquisitionCost"
                value={formRestockTarget ? formReceiptTotal.toFixed(2) : formData.acquisitionCost}
                onChange={handleInputChange}
                readOnly
                aria-readonly="true"
                placeholder="Calculated from quantity and unit cost"
                className={`${editControlClass} border-slate-300 bg-slate-100 font-semibold text-slate-700`}
              />
              <span className="mt-2 block text-xs text-slate-600">Calculated from quantity and unit cost.</span>
            </label>

            <label className="block">
              <span className={editFieldLabelClass}>Unit of measure</span>
              <select
                name="unitOfMeasure"
                value={formData.unitOfMeasure}
                onChange={handleInputChange}
                disabled={Boolean(formRestockTarget)}
                className={`${editControlClass} disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500`}
              >
                {unitOfMeasureOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>
            </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Stock &amp; condition</h3>
              <p className="mt-1 text-sm text-slate-600">Set the initial condition and choose an existing bulk item to restock when applicable.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">

            <label className="block">
              <span className={editFieldLabelClass}>Condition</span>
              <select
                name="condition"
                value={formData.condition}
                onChange={handleInputChange}
                className={editControlClass}
              >
                <option value="" disabled>Select condition</option>
                {addItemConditionOptions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
              </select>
              <span className="mt-2 block text-xs leading-relaxed text-slate-600">
                {formData.trackingMode === 'individual'
                  ? 'All units in this batch start with the same condition. Add items separately if conditions differ.'
                  : 'Bulk stock is kept in one condition group; create another stock record if its condition differs.'}
              </span>
            </label>

            {formData.trackingMode === 'quantity' && formRestockCandidates.length > 0 && (
              <label className="block sm:col-span-2">
                <span className={editFieldLabelClass}>Bulk SKU / restock existing item</span>
                <select
                  value={bulkRestockItemId}
                  onChange={(event) => setBulkRestockItemId(event.target.value)}
                  className={editControlClass}
                >
                  <option value="">Create a new bulk SKU</option>
                  {formRestockCandidates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.quantity} {item.unit} in stock · {item.storageLocation}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-relaxed text-slate-600">
                  Choose an existing SKU to add this delivery to its stock and receipt history. Condition and unit must match.
                </span>
              </label>
            )}

          </div>
            </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Review before saving</h3>
              <p className="mt-1 text-sm text-slate-600">Review the quantity and total acquisition cost.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-[#d6b333] bg-[#17377f] text-xs font-black text-white shadow-sm">
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-right">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">{formRestockTarget ? 'Delivery total' : 'Acquisition total'}</p>
                    <p className="mt-1 text-base font-black text-blue-800">{formatMoney(formReceiptTotal)}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700">
                  {formData.trackingMode === 'individual'
                    ? `Will create ${formQuantity} individual asset record${formQuantity === 1 ? '' : 's'}${formItemCodes.length > 1 ? ` (${formItemCodes[0]} – ${formItemCodes[formItemCodes.length - 1]})` : ''}. Barcode labels become available after issuance approval.`
                    : formRestockTarget
                      ? `Will add ${formQuantity} ${formRestockTarget.unit} to ${formRestockTarget.code}; stock will become ${Number(formRestockTarget.quantityValue || 0) + formQuantity} ${formRestockTarget.unit}. No stock label is printed while the item is in storage.`
                      : `Will create one bulk stock record for ${formQuantity} ${formData.unitOfMeasure || 'piece'} (${formBulkCodeRange?.display || formData.itemCode}). No stock label is printed while the item is in storage.`}
                </p>
              </div>
            </div>
          </section>
          </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-between sm:px-7">
            <button
              type="button"
              onClick={() => handleClearForm()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
            >
              Clear form
            </button>
            <button
              type="button"
              onClick={handleSaveItem}
              disabled={isSavingItem}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingItem ? 'Saving...' : 'Save item'}
            </button>
          </div>
        </section>
        </div>
      )}

      {showMasterDataModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="master-data-manager-title" className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
              <div>
                <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Master data setup</p>
                <h2 id="master-data-manager-title" className="mt-1 text-base font-black text-slate-900 sm:text-lg">Manage Categories &amp; Item Names</h2>
                <p className="mt-1 text-xs text-slate-500">Organize categories and the item names available in each one.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMasterDataModal(false)
                  setCategoryManagerError('')
                  setItemNameManagerError('')
                  setEditingCategoryId(null)
                }}
                className="shrink-0 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </header>

            <div role="tablist" aria-label="Master data sections" className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-7">
              <button
                type="button"
                role="tab"
                aria-selected={masterDataManagerTab === 'item_names'}
                onClick={() => { setMasterDataManagerTab('item_names'); setItemNameManagerError('') }}
                className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${masterDataManagerTab === 'item_names' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}
              >
                Item Names
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={masterDataManagerTab === 'categories'}
                onClick={() => { setMasterDataManagerTab('categories'); setCategoryManagerError('') }}
                className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${masterDataManagerTab === 'categories' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}
              >
                Categories
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-7">
              {masterDataManagerTab === 'item_names' ? (
                <div role="tabpanel" className="mx-auto min-h-full max-w-4xl space-y-5">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Add an item name</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">Add specific item names and link them to a category. Saved names appear in the Add Inventory Item dropdown.</p>
                  </div>
                  <form onSubmit={handleAddItemName} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_auto] md:items-end">
                    <label className="block">
                      <span className={editFieldLabelClass}>Category</span>
                      <select
                        value={itemNameCategoryId}
                        onChange={(event) => { setItemNameCategoryId(event.target.value); setItemNameSearch('') }}
                        required
                        className={editControlClass}
                      >
                        <option value="" disabled>Select a category</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>New item name</span>
                      <input
                        type="text"
                        required
                        maxLength={500}
                        value={newItemName}
                        onChange={(event) => setNewItemName(event.target.value)}
                        placeholder="e.g. Mouse, Keyboard, or Laptop"
                        className={editControlClass}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={isSavingItemName || !itemNameCategoryId}
                      className="h-12 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingItemName ? 'Saving...' : 'Add Item Name'}
                    </button>
                  </form>

                  {itemNameManagerError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{itemNameManagerError}</p>}
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">Saved item names</h3>
                      <p className="mt-1.5 text-sm text-slate-600">
                        {managedItemNameCategory ? `${managedItemNameCategory.name} · ${categoryManagedItemNames.length} name(s)` : 'Choose a category to view its names.'}
                      </p>
                    </div>
                    <label className="block w-full sm:max-w-sm">
                      <span className="sr-only">Search item names</span>
                      <input
                        type="search"
                        value={itemNameSearch}
                        onChange={(event) => setItemNameSearch(event.target.value)}
                        placeholder="Search item names..."
                        aria-label="Search item names"
                        className={editControlClass}
                      />
                    </label>
                  </div>

                  <div className="mt-4 max-h-[52vh] min-h-56 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3 pr-3.5">
                    {categoryManagedItemNames.length === 0 ? (
                      <p className="grid min-h-44 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-5 text-center text-sm font-medium text-slate-600">
                        No saved names for this category yet. Add Mouse, Keyboard, Laptop, or another item above.
                      </p>
                    ) : managedItemNames.length === 0 ? (
                      <p className="grid min-h-44 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-white px-5 text-center text-sm font-medium text-slate-600">
                        No item names match “{itemNameSearch}”. Try a different search.
                      </p>
                    ) : managedItemNames.map((itemName) => (
                      <div key={itemName.id} className="flex min-h-18 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm shadow-slate-900/5 transition hover:border-blue-200">
                        <span className="min-w-0 text-base font-bold text-slate-800">{itemName.name}</span>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const category = categories.find((entry) => entry.id === itemName.categoryId)
                              if (category) {
                                setFormData((current) => ({ ...current, category: category.name, itemCode: nextInventoryItemCode(category.name, items), itemName: itemName.name }))
                              }
                              setShowMasterDataModal(false)
                            }}
                            className="rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-xs font-bold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                          >
                            Use name
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(deletingItemNameId)}
                            onClick={() => void handleDeleteItemName(itemName.id)}
                            className="rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingItemNameId === itemName.id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  </section>
                </div>
              ) : (
                <div role="tabpanel" className="mx-auto max-w-4xl space-y-5">
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Add a category</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">Add categories, rename them with a reason, or remove unused categories.</p>
                  </div>
                  <form onSubmit={handleAddCategory} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="block">
                      <span className={editFieldLabelClass}>Category name</span>
                      <input
                        type="text"
                        required
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="e.g. Sports Equipment"
                        className={editControlClass}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={isSavingCategory}
                      className="h-12 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingCategory ? 'Saving...' : 'Add Category'}
                    </button>
                  </form>

                  {categoryManagerError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">{categoryManagerError}</p>}
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <h3 className="border-b border-slate-100 pb-4 text-sm font-extrabold text-slate-900">Existing categories · {categories.length}</h3>
                    <div className="mt-4 max-h-[54vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3 pr-3.5">
                      {categories.map((category) => (
                        <div key={category.id || category.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition hover:border-blue-200">
                          {editingCategoryId === category.id && Boolean(category.id) ? (
                            <form onSubmit={(e) => handleRenameCategory(e, category)} className="space-y-3">
                              <label className="block">
                                <span className={editFieldLabelClass}>Updated category name</span>
                                <input
                                  type="text"
                                  required
                                  maxLength={120}
                                  value={editingCategoryName}
                                  onChange={(e) => setEditingCategoryName(e.target.value)}
                                  className={editControlClass}
                                />
                              </label>
                              <label className="block">
                                <span className={editFieldLabelClass}>Reason for renaming</span>
                                <textarea
                                  required
                                  maxLength={1000}
                                  value={editingCategoryReason}
                                  onChange={(e) => setEditingCategoryReason(e.target.value)}
                                  placeholder="Why does this category name need to change?"
                                  className="min-h-28 w-full rounded-xl border-2 border-slate-300 bg-white p-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                                />
                              </label>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setEditingCategoryId(null); setCategoryManagerError('') }}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={isSavingCategory}
                                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingCategory ? 'Saving...' : 'Save name'}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-base font-bold text-slate-800">{category.name}</span>
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
                                  className="rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-xs font-bold text-blue-800 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
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
                                  className="rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>

            <footer className="flex justify-end border-t border-slate-100 px-5 py-4 sm:px-7">
              <button
                type="button"
                onClick={() => {
                  setShowMasterDataModal(false)
                  setCategoryManagerError('')
                  setItemNameManagerError('')
                  setEditingCategoryId(null)
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Done
              </button>
            </footer>
          </section>
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
              Full Inventory Master List
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Click on any row to open full item details and condition history log.
            </p>
            <span className="mt-2 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-[0.65rem] font-extrabold text-blue-700">
              {fullInventoryItems.length} item(s) found
            </span>
            {inventoryLoadError && (
              <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
                {inventoryLoadError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
                <label className="block w-40">
                  <span className="mb-1 block text-[0.58rem] font-extrabold uppercase tracking-wide text-slate-500">Filter by date</span>
                  <input
                    type="date"
                    value={selectedInventoryDate}
                    onChange={(event) => setSelectedInventoryDate(event.target.value)}
                    aria-label="Filter inventory by acquisition date"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                {selectedInventoryDate && (
                  <button
                    type="button"
                    aria-label="Clear date filter"
                    onClick={() => setSelectedInventoryDate('')}
                    className="mb-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[0.65rem] font-bold text-slate-600 transition hover:bg-slate-100"
                  >
                    Clear date
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => generateInventorySpreadsheet(fullInventoryItems, selectedInventoryDate)}
                  className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#138548] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#0f7440] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2"
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6M8 13h2M8 17h2M14 13h2M14 17h2" />
                  </svg>
                  Generate CSV
                </button>
                <button
                  type="button"
                  onClick={() => generateInventoryWord(fullInventoryItems, selectedInventoryDate)}
                  className="inline-flex min-h-9 min-w-40 items-center justify-center gap-1.5 rounded-lg bg-[#2d5aa3] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-wide text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-[#264e8e] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6M8 13h8M8 17h8" />
                  </svg>
                  Generate Word
                </button>
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">
                Search inventory
              </span>
              <div className="relative">
                <svg aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10.75" cy="10.75" r="5.75" />
                  <path d="m15.1 15.1 4.15 4.15" />
                </svg>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Item name, code, or assigned recipient"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Category</span>
              <select
                value={selectedCategoryFilter}
                onChange={(event) => {
                  setSelectedCategoryFilter(event.target.value)
                  setSelectedItemNameFilter('all')
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category.id || category.name} value={category.name}>{category.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Specific item name</span>
              <select
                value={selectedItemNameFilter}
                disabled={selectedCategoryFilter === 'all'}
                onChange={(event) => setSelectedItemNameFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="all">{selectedCategoryFilter === 'all' ? 'Choose a category first' : 'All item names'}</option>
                {itemNameFilterOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Condition / Status</span>
              <select
                value={selectedConditionStatusFilter}
                onChange={(event) => setSelectedConditionStatusFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All conditions &amp; statuses</option>
                <optgroup label="Condition">
                  {conditions.map((condition) => <option key={`condition:${condition}`} value={`condition:${condition}`}>{condition}</option>)}
                </optgroup>
                <optgroup label="Status">
                  <option value="status:Available">Available</option>
                  <option value="status:Issued">Issued</option>
                  <option value="status:Pending Approval">Pending Approval</option>
                  <option value="status:Reserved">Reserved</option>
                  <option value="status:Borrowed">Borrowed</option>
                </optgroup>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Tracking mode</span>
              <select
                value={selectedTrackingModeFilter}
                onChange={(event) => setSelectedTrackingModeFilter(event.target.value as 'all' | InventoryTrackingMode)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All tracking modes</option>
                <option value="individual">Per-unit assets</option>
                <option value="quantity">Bulk quantities</option>
              </select>
            </label>
          </div>
        </div>

        <div className="inventory-list-scrollbar max-h-144 overflow-auto border-t border-slate-100">
          <table className="min-w-245 w-full text-left">
            <thead className="bg-slate-50/70 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Item description</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Acquired</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Value</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Stock / condition</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5">Assigned / Custodian</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3.5 sm:px-6">Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((item, index) => (
                <tr
                  key={`${item.code}-${index}`}
                  onClick={() => setSelectedItem(item)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50"
                >
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex min-w-52 items-center gap-3">
                      <span
                        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 text-xs font-black shadow-sm ${inventoryAvatarTone(index)}`}
                      >
                        {item.initials}
                      </span>
                      <span className="min-w-0">
                        <span title={item.description} className="line-clamp-2 block text-xs font-extrabold leading-5 text-slate-800">
                          {item.description || item.name}
                        </span>
                        {item.name.trim().toLocaleLowerCase() !== (item.description || '').trim().toLocaleLowerCase() && (
                          <span className="mt-1 block truncate text-[0.68rem] font-bold text-blue-700">{item.name}</span>
                        )}
                        <span className="mt-1 block text-[0.62rem] font-bold text-slate-400">{item.code}</span>
                        <span className="mt-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.58rem] font-bold text-slate-500">
                          {item.category}
                        </span>
                        <span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[0.58rem] font-extrabold ${item.trackingMode === 'individual' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          {item.trackingMode === 'individual' ? 'Per-unit asset' : 'Bulk quantity'}
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
                  </td>
                  <td className="px-5 py-4">
                    <span className="block whitespace-nowrap text-xs font-extrabold text-slate-700">
                      {item.availableQuantity} available / {item.quantity} total <span className="font-medium text-slate-500">{item.unit}</span>
                    </span>
                    <span className={`mt-1.5 inline-flex rounded-full px-2 py-1 text-[0.6rem] font-extrabold ${item.conditionTone}`}>
                      {item.condition}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-600">{assignedCustodianForList(item)}</td>
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

      {/* ITEM DETAILS MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-details-title"
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className={'grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 text-sm font-black shadow-sm ' + selectedItemAvatarClass}>
                  {selectedItem.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Inventory management</p>
                  <h2 id="item-details-title" className="mt-0.5 truncate text-base font-black text-slate-900 sm:text-lg">{selectedItem.name}</h2>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{selectedItem.code} <span className="px-1 text-slate-300">/</span> {selectedItem.category}</p>
                  <p className="mt-1 truncate text-xs text-slate-600">{selectedItem.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-8 sm:py-6">
              <div className="mx-auto max-w-4xl space-y-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Item overview</h3>
                    <p className="mt-1 text-sm text-slate-600">Acquisition, stock, and valuation details for this inventory item.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Acquisition &amp; stock</h4>
                      <dl className="mt-3 space-y-2.5">
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Date acquired</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{selectedItem.acquired} ({selectedItem.time})</dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Quantity</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{selectedItem.quantity} {selectedItem.unit}</dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Tracking</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{selectedItem.trackingMode === 'individual' ? 'Per-unit asset' : 'Bulk quantity'}</dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Issued to</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{/\d/.test(selectedItem.dateIssued) ? selectedItem.assignedTo : 'Not issued'}</dd>
                        </div>
                        <div className="border-t border-slate-200 pt-2">
                          <dt className="text-sm font-semibold text-blue-800">Date issued</dt>
                          <dd className="mt-0.5 text-sm font-bold text-blue-800">
                            {/\d/.test(selectedItem.dateIssued)
                              ? <>{selectedItem.dateIssued} ({selectedItem.timeIssued})</>
                              : selectedItem.status === 'Pending Approval' ? 'Pending employee approval' : 'Not issued'}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Valuation</h4>
                      <dl className="mt-3 space-y-2.5">
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Unit cost</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{selectedItem.unitCost}</dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Total cost</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{selectedItem.acquisitionCost}</dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                          <dt className="text-sm font-medium text-slate-600">Current value</dt>
                          <dd className="text-right text-sm font-bold text-slate-900">{selectedItem.currentValue}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={'rounded-full px-3 py-1.5 text-sm font-extrabold ' + selectedItem.conditionTone}>
                      Condition before issuance: {selectedItem.condition}
                    </span>
                    <span className={'rounded-full px-3 py-1.5 text-sm font-extrabold ' + selectedItem.statusTone}>
                      Status: {selectedItem.status}
                    </span>
                  </div>
                </section>

                {selectedItem.trackingMode === 'quantity' && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-3 border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-extrabold text-slate-900">Stock receipt history</h3>
                      <p className="mt-1 text-sm text-slate-600">Past deliveries and recorded unit costs for this stock item.</p>
                    </div>
                    {selectedItem.receiptHistory.length > 0 ? (
                      <ul className="divide-y divide-slate-100">
                        {selectedItem.receiptHistory.map((receipt) => (
                          <li key={receipt.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {formatAcquiredDate(receipt.dateAcquired)} / {Number(receipt.quantity).toLocaleString()} {selectedItem.unit}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {receipt.referenceNumber || 'No receipt reference'} / Unit cost {formatMoney(receipt.unitCost)}
                              </p>
                            </div>
                            <span className="text-sm font-extrabold text-slate-900">{formatMoney(receipt.totalCost)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-600">No receipts have been recorded for this item yet.</p>}
                  </section>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">Item history</h3>
                      <p className="mt-1 text-sm text-slate-600">Review condition, issuance, return, and item change history.</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">History is saved with this item record.</span>
                  </div>
                </section>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <button
                type="button"
                onClick={() => {
                  setItemHistoryTab('condition')
                  setShowItemHistoryModal(true)
                }}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                View history
              </button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {selectedItem.id ? (
                  <button
                    type="button"
                    onClick={beginEditSelectedItem}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-extrabold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                  >
                    Edit Information
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                >
                  Done
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {showItemHistoryModal && selectedItem && (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-history-dialog-title"
            className="flex max-h-[86vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className={'grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 text-sm font-black shadow-sm ' + selectedItemAvatarClass}>
                  {selectedItem.initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Inventory management</p>
                  <h2 id="item-history-dialog-title" className="mt-0.5 text-base font-black text-slate-900">Item History</h2>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{selectedItem.name} <span className="px-1 text-slate-300">/</span> {selectedItem.code}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowItemHistoryModal(false)}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Close
              </button>
            </header>

            <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-3 sm:px-6">
              <button
                type="button"
                aria-pressed={itemHistoryTab === 'changes'}
                onClick={() => setItemHistoryTab('changes')}
                className={'rounded-xl px-4 py-2.5 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ' + (itemHistoryTab === 'changes' ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'border border-slate-300 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50')}
              >
                Item Change History
              </button>
              <button
                type="button"
                aria-pressed={itemHistoryTab === 'condition'}
                onClick={() => setItemHistoryTab('condition')}
                className={'rounded-xl px-4 py-2.5 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ' + (itemHistoryTab === 'condition' ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'border border-slate-300 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50')}
              >
                Item Condition History
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-5">
              {itemHistoryTab === 'condition' ? (
                selectedItem.history.length > 0 ? (
                  <div className="space-y-3">
                    {selectedItem.history.map((log, index) => (
                      <article key={log.changedAt + '-' + index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className={'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 text-[0.62rem] font-black ' + selectedItemAvatarClass}>
                              {selectedItem.initials}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-600">{log.previous}</span>
                                <span className="text-sm font-bold text-slate-300">/</span>
                                <span className={'rounded-full px-2.5 py-1 text-xs font-extrabold ' + log.tone}>{log.next}</span>
                              </div>
                              <p className="mt-2 text-sm leading-relaxed text-slate-700">{log.note}</p>
                              <p className="mt-1.5 text-xs font-semibold text-slate-500">{log.actorLabel ? log.actorLabel + ': ' + log.by : 'By ' + log.by}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{log.changedAt}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                    <span className={'mb-3 grid h-12 w-12 place-items-center rounded-full border-2 text-xs font-black ' + selectedItemAvatarClass}>{selectedItem.initials}</span>
                    <p className="text-sm font-extrabold text-slate-800">No condition history yet</p>
                    <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-600">Condition and return updates for this item will appear here.</p>
                  </div>
                )
              ) : selectedItem.changeHistory && selectedItem.changeHistory.length > 0 ? (
                <div className="space-y-3">
                  {[...selectedItem.changeHistory]
                    .sort((left, right) => new Date(left.changedAt).getTime() - new Date(right.changedAt).getTime())
                    .map((change, index) => (
                      <article key={change.changedAt + '-' + index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className={'grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 text-[0.62rem] font-black ' + selectedItemAvatarClass}>
                            {selectedItem.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-extrabold text-slate-900">{change.action === 'updated' ? 'Item updated' : change.reason}</p>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{formatCreatedAt(change.changedAt)}</span>
                            </div>
                            {change.action === 'updated' && change.reason && (
                              <p className="mt-2 text-sm leading-relaxed text-slate-600">Reason: {change.reason}</p>
                            )}
                            {getChangeDetails(change).length > 0 && (
                              <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-700">
                                {getChangeDetails(change).map((detail) => (
                                  <li key={detail}>{detail}</li>
                                ))}
                              </ul>
                            )}
                            <p className="mt-2 text-xs font-semibold text-slate-500">
                              {change.action === 'updated' ? 'Edited by' : 'By'} {change.changedBy || 'Unknown user'} / {formatCreatedAt(change.changedAt)}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                  <span className={'mb-3 grid h-12 w-12 place-items-center rounded-full border-2 text-xs font-black ' + selectedItemAvatarClass}>{selectedItem.initials}</span>
                  <p className="text-sm font-extrabold text-slate-800">No item changes yet</p>
                  <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-600">Updates to this inventory item will be listed here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {showItemEditModal && selectedItem?.id && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5">
          <form
            onSubmit={handleUpdateSelectedItem}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-inventory-item-title"
            className="flex max-h-[94vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className={'grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 text-sm font-black shadow-sm ' + selectedItemAvatarClass}>{selectedItem.initials}</div>
                <div className="min-w-0">
                  <p className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Inventory management</p>
                  <h2 id="edit-inventory-item-title" className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">Edit   qItem</h2>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">{selectedItem.code} <span className="px-1 text-slate-300">/</span> {selectedItem.name}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isUpdatingItem}
                onClick={() => { setShowItemEditModal(false); setItemEditError('') }}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-4 py-5 sm:px-8 sm:py-6">
              <div className="mx-auto max-w-4xl space-y-4">
                {itemEditError && (
                  <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                    {itemEditError}
                  </p>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Item details</h3>
                    <p className="mt-1 text-sm text-slate-600">Fields marked <span className="font-extrabold text-rose-600">*</span> are required. Choose a saved item name for the selected category.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={editFieldLabelClass}>Item code <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">Read-only</span></span>
                      <input name="itemCode" required maxLength={100} value={editFormData.itemCode} readOnly aria-readonly="true" className={`${editControlClass} border-slate-300 bg-slate-100 font-semibold text-slate-700`} />
                      <span className="mt-2 block text-xs text-slate-600">Item codes are locked after creation.</span>
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Category <span className="text-rose-600">*</span></span>
                      <select name="category" required value={editFormData.category} onChange={handleEditInputChange} className={editControlClass}>
                        {categories.map((category) => <option key={category.id || category.name} value={category.name}>{category.name}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Item name <span className="text-rose-600">*</span></span>
                      <select
                        name="itemName"
                        required
                        value={editFormData.itemName}
                        onChange={handleEditInputChange}
                        disabled={editCategoryItemNames.length === 0 && !editItemNameIsCurrentLegacyValue}
                        className={`${editControlClass} border-blue-300 bg-blue-50/30 hover:border-blue-400 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500`}
                      >
                        <option value="" disabled>
                          {editCategoryItemNames.length > 0 ? 'Choose an item name' : 'No saved names for this category'}
                        </option>
                        {editItemNameIsCurrentLegacyValue && !editItemNameIsCatalogued && (
                          <option value={selectedItem.name}>{selectedItem.name} (current name)</option>
                        )}
                        {editCategoryItemNames.map((itemName) => <option key={itemName.id} value={itemName.name}>{itemName.name}</option>)}
                      </select>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-xs text-slate-600">Names shown here belong to the selected category.</span>
                        <button type="button" onClick={handleOpenEditItemNameManager} className="text-xs font-bold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-900">Manage names</button>
                      </div>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={editFieldLabelClass}>Item description <span className="text-rose-600">*</span></span>
                      <input name="description" required maxLength={500} value={editFormData.description} onChange={handleEditInputChange} placeholder="Describe this item" className={editControlClass} />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Tracking &amp; acquisition</h3>
                    <p className="mt-1 text-sm text-slate-600">Review how this item is tracked and record its acquisition details.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={editFieldLabelClass}>Tracking mode</span>
                      <select
                        name="trackingMode"
                        value={editFormData.trackingMode}
                        onChange={handleEditInputChange}
                        disabled={selectedItem.assetTags.length > 0}
                        className={`${editControlClass} disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500`}
                      >
                        <option value="individual">Per-unit asset - unique barcode for each physical unit</option>
                        <option value="quantity">Bulk quantity - one stock record, no per-unit labels</option>
                      </select>
                      <span className="mt-2 block text-xs leading-relaxed text-slate-600">Tracking mode can only change before asset tags are created. Existing barcode history is preserved.</span>
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Date acquired</span>
                      <input type="date" name="dateAcquired" value={editFormData.dateAcquired} onChange={handleEditInputChange} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Time acquired</span>
                      <input type="time" name="timeAcquired" value={editFormData.timeAcquired} onChange={handleEditInputChange} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Cost per unit</span>
                      <input type="number" min="0" step="0.01" name="unitCost" value={editFormData.unitCost} onChange={handleEditInputChange} className={editControlClass} />
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Acquisition cost <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[0.65rem] font-bold text-slate-700">Calculated</span></span>
                      <input type="number" min="0" step="0.01" name="acquisitionCost" value={editFormData.acquisitionCost} readOnly aria-readonly="true" className={`${editControlClass} border-slate-300 bg-slate-100 font-semibold text-slate-700`} />
                      <span className="mt-2 block text-xs text-slate-600">Calculated from quantity and unit cost.</span>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={editFieldLabelClass}>Current assessed value <span className="font-semibold text-slate-600">(optional)</span></span>
                      <input type="number" min="0" step="0.01" name="currentValue" value={editFormData.currentValue} onChange={handleEditInputChange} placeholder="Leave blank if not assessed" className={editControlClass} />
                      <span className="mt-2 block text-xs text-slate-600">Cannot be greater than the acquisition cost.</span>
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">Stock &amp; condition</h3>
                    <p className="mt-1 text-sm text-slate-600">Keep the item quantity, unit of measure, and condition up to date.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={editFieldLabelClass}>Quantity</span>
                      <input type="number" min="0" step="1" name="quantity" value={editFormData.quantity} onChange={handleEditInputChange} disabled={selectedItem.trackingMode === 'individual' && selectedItem.assetTags.length > 0} className={`${editControlClass} disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500`} />
                      {selectedItem.trackingMode === 'individual' && selectedItem.assetTags.length > 0 && <span className="mt-2 block text-xs text-slate-600">Quantity is locked because asset tags already exist.</span>}
                    </label>
                    <label className="block">
                      <span className={editFieldLabelClass}>Unit of measure</span>
                      <select name="unitOfMeasure" value={editFormData.unitOfMeasure} onChange={handleEditInputChange} className={editControlClass}>
                        {!unitOfMeasureOptions.includes(editFormData.unitOfMeasure) && <option value={editFormData.unitOfMeasure}>{editFormData.unitOfMeasure} (existing)</option>}
                        {unitOfMeasureOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={editFieldLabelClass}>Condition</span>
                      <select name="condition" value={editFormData.condition} onChange={handleEditInputChange} className={editControlClass}>
                        {conditions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
                  <label className="block">
                    <span className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">Reason for this change <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-amber-900">Required</span></span>
                    <span className="mb-2 block text-sm leading-relaxed text-slate-600">This note will be saved in the item&apos;s change history.</span>
                    <textarea
                      name="reason"
                      required
                      maxLength={1000}
                      value={editFormData.reason}
                      onChange={handleEditInputChange}
                      placeholder="For example: The item name was corrected to match the category list."
                      className="min-h-28 w-full rounded-xl border-2 border-amber-300 bg-white p-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-amber-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </section>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-8">
              <button
                type="button"
                disabled={isUpdatingItem}
                onClick={() => { setShowItemEditModal(false); setItemEditError('') }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingItem}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdatingItem ? 'Saving...' : 'Save changes'}
              </button>
            </footer>
          </form>
        </div>
      )}

    </GsoPageFrame>
  )
}
