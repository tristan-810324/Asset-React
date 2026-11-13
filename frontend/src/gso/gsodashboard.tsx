import { useEffect, useMemo, useState, type ReactNode } from 'react'
import GsoNavbar, { GsoPageHeader, type GsoNavigationItem } from '../components/navbars/gsonavbar'
import { listEmployees, type EmployeeProfile } from './employeesApi'
import { listInventoryItems, type InventoryItemRecord } from './inventoryApi'
import { listUnitLabels } from './issuancesApi'
import { listStaffPurchaseRequisitions } from './purchaseRequisitionsApi'
import { canRecordDelivery, deliveryOpen, linesOf, purchaseRequisitionReadyForIssuance } from './requisitionFlow'
import { listGsoRequests, listRequesterIdentityReviews, type RequesterIdentity, type ServiceRequest } from '../requesters/requesterApi'

type IconName =
  | 'archive'
  | 'arrow-right'
  | 'bell'
  | 'building'
  | 'calendar'
  | 'chart'
  | 'chart-pie'
  | 'chevron-down'
  | 'clipboard'
  | 'close'
  | 'cube'
  | 'grid'
  | 'menu'
  | 'plus'
  | 'search'
  | 'settings'
  | 'tool'
  | 'truck'
  | 'user-check'
  | 'users'

const iconPaths: Record<IconName, ReactNode> = {
  archive: (
    <>
      <path d="M3 7.5h18" />
      <path d="M5.25 7.5 6.6 3.75h10.8l1.35 3.75" />
      <path d="M5.25 7.5v11.25A1.5 1.5 0 0 0 6.75 20.25h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5" />
      <path d="M9.25 11.25h5.5" />
    </>
  ),
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M7.5 3v4M16.5 3v4M3.5 10h17" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 19.5h17" />
      <path d="m5.5 15.5 4-4 3.25 2.75 5.75-6.5" />
      <path d="M14.75 7.75h3.75v3.75" />
    </>
  ),
  'chart-pie': (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
      <path d="M14 3.23A9 9 0 0 1 20.77 10H14V3.23Z" />
    </>
  ),
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75" />
      <path d="M8.5 10h7M8.5 14h7M8.5 18h4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  cube: (
    <>
      <path d="m21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="14" width="6.5" height="6.5" rx="1" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="5.75" />
      <path d="m15.1 15.1 4.15 4.15" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.01 2.01-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-2.84v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06L7 16.94l.06-.06A1.7 1.7 0 0 0 7.4 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2.84h.09A1.7 1.7 0 0 0 7.4 10.1a1.7 1.7 0 0 0-.34-1.88L7 8.16l2.01-2.01.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.9h2.84v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.01 2.01-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2.84h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
  tool: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />
  ),
  truck: (
    <>
      <path d="M3 5h11v11H3zM14 9h3l3 3v4h-6z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  'user-check': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 1 0 7.75" />
    </>
  ),
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name]}
    </svg>
  )
}

const departmentChartColors = ['#1e3a8a', '#1d4ed8', '#3b82f6', '#0ea5e9', '#64748b', '#8b5cf6']

const conditionGroups = [
  { condition: 'New / Good', values: new Set(['new', 'good']), tone: 'bg-emerald-50 text-emerald-700', color: '#10b981' },
  { condition: 'Fair (Usable)', values: new Set(['fair']), tone: 'bg-amber-50 text-amber-700', color: '#f59e0b' },
  { condition: 'Needs Repair / Maintenance', values: new Set(['needs repair', 'under maintenance']), tone: 'bg-rose-50 text-rose-700', color: '#f43f5e' },
  { condition: 'Unserviceable / Retired', values: new Set(['unserviceable', 'retired']), tone: 'bg-slate-100 text-slate-600', color: '#94a3b8' },
]

export default function GsoDashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activePage] = useState<GsoNavigationItem>('Overview')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [inventoryError, setInventoryError] = useState('')
  const [employees, setEmployees] = useState<EmployeeProfile[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState('')
  const [requisitions, setRequisitions] = useState<ServiceRequest[]>([])
  const [borrowings, setBorrowings] = useState<ServiceRequest[]>([])
  const [verifications, setVerifications] = useState<RequesterIdentity[]>([])
  const [labelsToPrint, setLabelsToPrint] = useState(0)

  const requisitionCounts = useMemo(() => {
    const count = (statuses: string[]) => requisitions.filter((row) => statuses.includes(row.status)).length
    return {
      queue: count(['Submitted']),
      pdfToPrint: count(['GSO Endorsed', 'Finance Handoff Pending', 'Finance Handoff Failed']),
      deliveriesToLink: requisitions.filter((row) => deliveryOpen(row) && linesOf(row).some(canRecordDelivery)).length,
      ready: count(['Approved', 'Ready for Pickup']),
    }
  }, [requisitions])
  const readyForIssuance = useMemo(
    () => requisitions.filter((row) => row.requestType === 'PURCHASE_REQUISITION' && purchaseRequisitionReadyForIssuance(row)),
    [requisitions],
  )
  const borrowingCounts = useMemo(() => {
    const count = (statuses: string[]) => borrowings.filter((row) => statuses.includes(row.status)).length
    return {
      pending: count(['Submitted', 'Under Review']),
      approved: count(['Approved']),
      issued: count(['Issued']),
      closed: count(['Returned', 'Completed', 'Closed', 'Rejected', 'Cancelled']),
    }
  }, [borrowings])
  const borrowingAlerts = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('en-CA')
    const dueOf = (row: ServiceRequest) => row.assets.find((asset) => asset.dueDate)?.dueDate || row.formData.returnDate || ''
    return {
      returns: borrowings.filter((row) => row.status === 'Return Requested').length,
      overdue: borrowings.filter((row) => ['Issued', 'Return Requested'].includes(row.status) && Boolean(dueOf(row)) && dueOf(row) < todayKey).length,
    }
  }, [borrowings])
  const pendingVerifications = verifications.filter((row) => ['Pending', 'Pending Review'].includes(row.status)).length

  useEffect(() => {
    let active = true
    void listStaffPurchaseRequisitions().then((rows) => { if (active) setRequisitions(rows) }).catch(() => undefined)
    void listGsoRequests({ type: 'BORROWING' }).then((rows) => { if (active) setBorrowings(rows) }).catch(() => undefined)
    void listRequesterIdentityReviews().then((rows) => { if (active) setVerifications(rows) }).catch(() => undefined)
    void listUnitLabels().then((rows) => { if (active) setLabelsToPrint(rows.filter((row) => row.needsPrinting && !row.isReturned).length) }).catch(() => undefined)
    return () => { active = false }
  }, [])


  useEffect(() => {
    let active = true
    void listInventoryItems()
      .then((items) => {
        if (!active) return
        setInventoryItems(items)
        setInventoryError('')
      })
      .catch((error: unknown) => {
        if (active) setInventoryError(error instanceof Error ? error.message : 'Unable to load inventory.')
      })
      .finally(() => {
        if (active) setInventoryLoading(false)
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void listEmployees()
      .then(({ employees: records }) => {
        if (!active) return
        setEmployees(records)
        setEmployeesError('')
      })
      .catch((error: unknown) => {
        if (active) setEmployeesError(error instanceof Error ? error.message : 'Unable to load employee departments.')
      })
      .finally(() => {
        if (active) setEmployeesLoading(false)
      })

    return () => { active = false }
  }, [])

  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const handleAction = (label: string) => {
    setNotice(`${label} action selected.`)
  }

  const inventorySummary = useMemo(() => {
    const totals = inventoryItems.reduce((summary, item) => {
      const quantity = Number(item.quantity)
      const count = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
      const availableValue = Number(item.availableQuantity)
      const available = Number.isFinite(availableValue) && availableValue > 0 ? Math.min(count, availableValue) : 0
      const activeQuantity = Math.max(0, count - available)
      const condition = item.condition.trim().toLowerCase()
      const status = item.status.trim().toLowerCase()
      summary.total += count
      if (condition === 'unserviceable') summary.unserviceable += count
      if (condition === 'needs repair' || condition === 'under maintenance') summary.maintenance += count
      if (status === 'available' && (condition === 'new' || condition === 'good' || condition === 'fair')) summary.storage += available
      if (status === 'issued' || status === 'borrowed') summary.currentlyIssued += activeQuantity || count
      else if (status === 'available' && activeQuantity > 0 && item.assignedTo?.trim()) summary.currentlyIssued += activeQuantity
      return summary
    }, { total: 0, operational: 0, unserviceable: 0, currentlyIssued: 0, storage: 0, maintenance: 0 })
    totals.operational = Math.max(0, totals.total - totals.unserviceable)
    return {
      ...totals,
      operationalPercent: totals.total === 0 ? '0.0' : ((totals.operational / totals.total) * 100).toFixed(1),
      deployedPercent: totals.total === 0 ? '0.0' : ((totals.currentlyIssued / totals.total) * 100).toFixed(1),
    }
  }, [inventoryItems])

  const employeeDepartmentByName = useMemo(() => {
    const departmentsByName = new Map<string, Set<string>>()
    employees.forEach((employee) => {
      const employeeName = `${employee.firstName} ${employee.lastName}`.trim().toLowerCase()
      if (!employeeName) return
      const departments = departmentsByName.get(employeeName) ?? new Set<string>()
      if (employee.department.trim()) departments.add(employee.department.trim())
      departmentsByName.set(employeeName, departments)
    })
    return new Map(Array.from(departmentsByName, ([name, departments]) => [
      name,
      departments.size === 1 ? Array.from(departments)[0] : 'Other / Unmapped',
    ]))
  }, [employees])

  const departmentDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    const addCount = (department: string, count: number) => {
      if (count <= 0) return
      counts.set(department, (counts.get(department) || 0) + count)
    }

    inventoryItems.forEach((item) => {
      const quantity = Number(item.quantity)
      const totalQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
      const availableValue = Number(item.availableQuantity)
      const availableQuantity = Number.isFinite(availableValue) && availableValue > 0
        ? Math.min(totalQuantity, availableValue)
        : 0
      const assignedQuantity = Math.max(0, totalQuantity - availableQuantity)
      const status = item.status.trim().toLowerCase()
      const assignedTo = item.assignedTo?.trim() || ''

      if (availableQuantity > 0) addCount('GSO Storage (Unassigned)', availableQuantity)
      if (assignedQuantity <= 0) return
      if (status === 'pending approval' || status === 'reserved') {
        addCount('Pending / Reserved', assignedQuantity)
      } else if (assignedTo.toLowerCase() === 'multiple employees') {
        addCount('Multiple employees', assignedQuantity)
      } else if (assignedTo && !['in storage', '—', '-', 'for repair', 'under maintenance'].includes(assignedTo.toLowerCase())) {
        addCount(employeeDepartmentByName.get(assignedTo.toLowerCase()) || 'Other / Unmapped', assignedQuantity)
      } else {
        addCount('Other / Unmapped', assignedQuantity)
      }
    })

    return Array.from(counts, ([dept, count], index) => ({
      dept,
      count,
      percentage: inventorySummary.total > 0 ? (count / inventorySummary.total) * 100 : 0,
      color: departmentChartColors[index % departmentChartColors.length],
    })).sort((left, right) => right.count - left.count)
  }, [employeeDepartmentByName, inventoryItems, inventorySummary.total])

  const departmentChartGradient = departmentDistribution.length > 0 ? `conic-gradient(${departmentDistribution.reduce<{ end: number; stops: string[] }>(
    (gradient, item) => {
      const nextEnd = gradient.end + item.percentage
      gradient.stops.push(`${item.color} ${gradient.end}% ${nextEnd}%`)
      gradient.end = nextEnd
      return gradient
    },
    { end: 0, stops: [] },
  ).stops.join(', ')})` : 'conic-gradient(#e2e8f0 0% 100%)'

  const conditionBreakdown = useMemo(() => {
    const grouped = conditionGroups.map((group) => {
      const count = inventoryItems.reduce((total, item) => {
        const quantity = Number(item.quantity)
        const itemQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0
        return group.values.has(item.condition.trim().toLowerCase()) ? total + itemQuantity : total
      }, 0)
      return {
        ...group,
        count,
        percentage: inventorySummary.total > 0 ? (count / inventorySummary.total) * 100 : 0,
      }
    })
    const categorizedQuantity = grouped.reduce((total, group) => total + group.count, 0)
    const otherQuantity = Math.max(0, inventorySummary.total - categorizedQuantity)
    if (otherQuantity > 0) {
      grouped.push({
        condition: 'Other / Unspecified',
        values: new Set<string>(),
        tone: 'bg-slate-100 text-slate-600',
        color: '#64748b',
        count: otherQuantity,
        percentage: inventorySummary.total > 0 ? (otherQuantity / inventorySummary.total) * 100 : 0,
      })
    }
    return grouped.map((group) => ({ ...group, percent: `${group.percentage.toFixed(1)}%` }))
  }, [inventoryItems, inventorySummary.total])

  return (
    <main className="min-h-screen bg-[#f4f7fb] font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-200">
      <GsoNavbar
        currentPage={activePage}
        mobileMenuOpen={mobileMenuOpen}
        notificationsOpen={notificationsOpen}
        onClose={() => setMobileMenuOpen(false)}
        onAction={handleAction}
        onOpenNotifications={() => setNotificationsOpen(true)}
      />

      <section className="min-h-screen lg:pl-72">
        <GsoPageHeader
          pageName="Executive Analytics"
          today={today}
          notificationsOpen={notificationsOpen}
          onNotificationsOpenChange={setNotificationsOpen}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onAction={handleAction}
        />

        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          {/* DASHBOARD HERO BANNER */}
          <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Executive Analytics
                </span>
                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">GSO Executive Overview</h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-blue-100">
                  System Command Center
                </p>
              </div>
             
            </div>
          </section>

          {/* KPI CARDS */}
          {/* ANALYTICS CHARTS & DISTRIBUTION SECTION */}

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Requests and approvals">
            {[
              { label: 'Requisitions in queue', value: requisitionCounts.queue, note: 'New requests', href: '/gso/purchase-requisitions', icon: 'clipboard' as const },
              { label: 'Account verifications', value: pendingVerifications, note: 'Pending review', href: '/gso/requester-verification', icon: 'users' as const },
              { label: 'Borrowing requests', value: borrowingCounts.pending, note: 'Awaiting decision', href: '/gso/requests-borrowing', icon: 'calendar' as const },
              { label: 'Ready for Main Issuance', value: readyForIssuance.length, note: 'Ready to issue', href: '/gso/main-issuance', icon: 'cube' as const },
            ].map((card) => (
              <a key={card.label} href={card.href} className="group flex flex-col justify-between rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-100/75 via-blue-50/25 to-white p-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/15 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-bold text-slate-500 sm:text-xs">{card.label}</p>
                    <p className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:mt-2 sm:text-3xl">{card.value}</p>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm shadow-blue-900/5 sm:h-10 sm:w-10"><Icon name={card.icon} className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                </div>
                <p className="mt-2 border-t border-blue-200/50 pt-2 text-[0.62rem] font-medium text-slate-500 sm:mt-4 sm:pt-3 sm:text-[0.68rem]">{card.note}</p>
              </a>
            ))}
          </section>

          {/* NEEDS YOUR ACTION */}
          <section className="mt-6 overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5" aria-labelledby="needs-action-title">
            <div className="border-b border-slate-200 px-6 py-5 sm:px-7">
              <h2 id="needs-action-title" className="text-lg font-black tracking-tight text-slate-900">Needs your action</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Open work for GSO staff. Select a row to go straight to it.</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {[
                { label: 'Labels to print', count: labelsToPrint, href: '/gso/asset-labels', hint: 'Unit barcodes that have not been printed yet', icon: 'grid' as const },
                { label: 'Deliveries to link', count: requisitionCounts.deliveriesToLink, href: '/gso/purchase-requisitions?tab=waiting', hint: 'Requests with bought items ready to link to a delivery', icon: 'truck' as const },
                { label: 'Signed PDFs to print', count: requisitionCounts.pdfToPrint, href: '/gso/procurement', hint: 'Endorsed requisitions not yet handed to Finance', icon: 'clipboard' as const },
                { label: 'Return requests', count: borrowingAlerts.returns, href: '/gso/borrowing-returns', hint: 'Borrowers asked to return items for inspection', icon: 'archive' as const },
                { label: 'Overdue borrowings', count: borrowingAlerts.overdue, href: '/gso/requests-borrowing', hint: 'Items still out past their due date', icon: 'calendar' as const },
              ].map((item) => (
                <li key={item.label}>
                  <a href={item.href} className="group flex items-center gap-4 px-6 py-4 transition hover:bg-blue-50/50 sm:px-7">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm"><Icon name={item.icon} className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-slate-800">{item.label}</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-500">{item.hint}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-black tabular-nums ${item.count > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>{item.count}</span>
                    <Icon name="arrow-right" className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-2">
            {/* DEPARTMENT ASSET DISTRIBUTION (CLEAN TOUCH OF BLUE PALETTE) */}
            <article className="min-h-96 rounded-2xl border-2 border-slate-300/80 bg-white p-7 sm:p-8 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">Asset Distribution by Department</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Proportion of campus equipment per office</p>
                </div>
              </div>

              <div className="mt-6 flex min-h-60 items-center justify-center">
                {inventoryLoading || employeesLoading ? (
                  <p className="text-sm font-bold text-slate-400">Loading inventory distribution…</p>
                ) : inventoryError ? (
                  <p role="alert" className="text-sm font-bold text-rose-600">Unable to load inventory distribution.</p>
                ) : departmentDistribution.length === 0 ? (
                  <p className="text-sm font-semibold text-slate-400">No cataloged assets to distribute yet.</p>
                ) : (
                  <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-5">
                    <div
                      role="img"
                      aria-label="Doughnut chart showing live asset distribution by department"
                      className="relative h-40 w-40 shrink-0 rounded-full sm:h-40 sm:w-40"
                      style={{ background: departmentChartGradient }}
                    >
                      <div className="absolute inset-[23%] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner shadow-slate-200/60">
                        <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-slate-400">Department</span>
                        <span className="mt-0.5 text-lg font-black leading-none text-slate-800">100%</span>
                      </div>
                    </div>

                    <div className="w-full space-y-1 sm:min-w-0">
                      {departmentDistribution.map((item) => (
                        <div key={item.dept} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                            <span className="truncate text-xs font-semibold text-slate-700" title={item.dept}>{item.dept}</span>
                          </div>
                          <span className="text-xs font-medium tabular-nums text-slate-500">{item.count.toLocaleString('en-PH')}</span>
                          <span className="min-w-[2.65rem] text-right text-xs font-extrabold tabular-nums text-slate-700">{item.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                      {employeesError && <p className="px-2 pt-2 text-[0.62rem] font-medium text-amber-700">Some assigned items could not be matched to employee departments.</p>}
                    </div>
                  </div>
                )}
              </div>
            </article>

            {/* ASSET CONDITION & HEALTH BREAKDOWN */}
            <article className="min-h-96 rounded-2xl border-2 border-slate-300/80 bg-white p-7 sm:p-8 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-slate-900">Condition Status</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">Physical evaluation of cataloged inventory</p>
                </div>
              </div>

              <div className="mt-6 min-h-60 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                {inventoryLoading ? (
                  <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-400">Loading asset conditions…</div>
                ) : inventoryError ? (
                  <div role="alert" className="grid min-h-48 place-items-center text-sm font-bold text-rose-600">Unable to load asset conditions.</div>
                ) : inventorySummary.total === 0 ? (
                  <div className="grid min-h-48 place-items-center text-sm font-semibold text-slate-400">No cataloged assets yet.</div>
                ) : (
                  <>
                    <div
                      role="img"
                      aria-label="Stacked bar chart showing live physical asset condition percentages"
                      className="flex h-4 w-full overflow-hidden rounded-full bg-slate-200"
                    >
                      {conditionBreakdown.map((item) => (
                        <span
                          key={item.condition}
                          title={`${item.condition}: ${item.percent}`}
                          style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                        />
                      ))}
                    </div>

                    <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-6">
                      {conditionBreakdown.map((item) => (
                        <div key={item.condition} className="min-w-0">
                          <div className="flex min-h-8 items-start gap-2">
                            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                            <span className="text-[0.62rem] font-extrabold uppercase leading-snug tracking-wider text-slate-400">{item.condition}</span>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between gap-2">
                            <span className="text-2xl font-black leading-none tabular-nums text-slate-800">{item.count.toLocaleString('en-PH')}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-extrabold ${item.tone}`}>
                              {item.percent}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

            </article>

          </section>


        </div>
      </section>

      {/* NOTIFICATION TOAST */}
      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xl shadow-slate-900/15">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
            <Icon name="clipboard" className="h-3.5 w-3.5" />
          </span>
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </main>
  )
}
