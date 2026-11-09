import type { ServiceRequest } from './requesterApi'
import type { DashboardRequestItem } from './requesterrequestutils'

export type MetricIconName = 'requests' | 'action' | 'progress' | 'issuance' | 'shield' | 'id' | 'document' | 'return' | 'box' | 'arrow-right'

export function MetricIcon({ name, className = 'h-5 w-5' }: { name: MetricIconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {name === 'requests' && <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>}
    {name === 'action' && <><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></>}
    {name === 'progress' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === 'issuance' && <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>}
    {name === 'shield' && <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>}
    {name === 'id' && <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="12" r="2" /><path d="M14 10h5M14 14h5M6 17.2c.5-1.4 1.8-2.2 3-2.2s2.5.8 3 2.2" /></>}
    {name === 'document' && <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5" /></>}
    {name === 'return' && <><path d="M4 7h11a4.5 4.5 0 0 1 0 9H9" /><path d="m8 12-4-4 4-4" /></>}
    {name === 'box' && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="M4.5 7.5 12 12l7.5-4.5M12 12v9" /></>}
    {name === 'arrow-right' && <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>}
  </svg>
}

export function RequestItemPreview({ item, index, requestType }: { item: DashboardRequestItem; index: number; requestType: ServiceRequest['requestType'] }) {
  const hasSpecifications = item.description.trim() && item.description.trim().toLowerCase() !== item.itemName.trim().toLowerCase()
  const hasAssignment = requestType === 'PURCHASE_REQUISITION'
  return <div className="rounded-xl border-2 border-blue-100 bg-linear-to-br from-blue-50/75 via-white to-white p-3.5 shadow-sm shadow-blue-900/5 sm:p-4">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-600 shadow-sm sm:h-10 sm:w-10"><MetricIcon name="box" className="h-4 w-4 sm:h-5 sm:w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.14em] text-blue-700">Requested item {index + 1}</p><p className="mt-1 text-sm font-black leading-snug text-slate-900 sm:text-base">{item.quantity ? `${item.quantity} × ` : ''}{item.itemName}</p></div>
          {item.catalogItemCode && <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[0.58rem] font-extrabold text-slate-500 shadow-sm">{item.catalogItemCode}</span>}
        </div>
        {(item.category || hasSpecifications) && <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {item.category && <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2"><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Category</p><p className="mt-1 text-xs font-bold text-slate-700">{item.category.replace(/_/g, ' ')}</p></div>}
          {hasSpecifications && <div className={`rounded-lg border border-blue-100 bg-white/80 px-3 py-2 ${!item.category ? 'sm:col-span-2' : ''}`}><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-slate-400">Specifications</p><p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{item.description}</p></div>}
        </div>}
        {hasAssignment && <div className="mt-2 rounded-lg border border-dashed border-blue-200 bg-blue-50/70 px-3 py-2.5"><p className="text-[0.56rem] font-extrabold uppercase tracking-wide text-blue-700">Final assignment</p><p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{item.intendedStaff.length > 0 ? item.intendedStaff.join(', ') : 'Final recipient will be assigned before handover.'}</p></div>}
      </div>
    </div>
  </div>
}
