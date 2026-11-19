import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { GsoPageFrame } from '../components/navbars/gsonavbar'
import { getCurrentUser } from '../auth/authApi'
import { SERVICE_CATEGORY_LABELS } from '../requesters/serviceWorkflow'
import {
  claimServiceWorkOrder,
  completeServiceWorkOrder,
  notFinishServiceWorkOrder,
  forwardServiceWorkOrder,
  getServiceWorkOrder,
  listServiceWorkOrders,
  rejectServiceWorkOrder,
  startServiceWorkOrder,
  takeOverServiceWorkOrder,
  type ServiceWorkOrder,
  type ServiceWorkQueue,
  type ServiceWorkSummary,
  type ServiceWorkTeam,
  type WorkOrderAssignee,
  type WorkOrderChecklistItem,
  type WorkOrderHistoryItem,
} from './serviceWorkboardApi'

type IconName = 'arrow' | 'calendar' | 'check' | 'clock' | 'close' | 'document' | 'info' | 'location' | 'search' | 'tool' | 'transfer' | 'user' | 'warning'
type DialogKind = 'forward' | 'start' | 'complete' | 'takeover' | 'reject'
type QuickAction = 'claim' | 'start'
type JobButton = {
  key: string
  label: string
  tone: 'primary' | 'quiet' | 'danger' | 'success'
  quick?: QuickAction
  dialog?: DialogKind
}

// Same wording for both teams. Only the team name, the other team, and the hero text change.
const TEAM_COPY: Record<ServiceWorkTeam, { eyebrow: string; title: string; subtitle: string; otherTeam: ServiceWorkTeam; otherLabel: string }> = {
  GSO: {
    eyebrow: 'GSO operations',
    title: 'Service Workboard',
    subtitle: 'Facilities jobs that GSO Staff claim, work on, and mark complete.',
    otherTeam: 'ITSS',
    otherLabel: 'ITSS Support',
  },
  ITSS: {
    eyebrow: 'ITSS operations',
    title: 'ITSS Support Queue',
    subtitle: 'Computer laboratory and technical jobs that IT Staff claim, work on, and mark complete.',
    otherTeam: 'GSO',
    otherLabel: 'GSO Facilities',
  },
}

const QUEUES: Array<{ id: ServiceWorkQueue; label: string; count: keyof ServiceWorkSummary }> = [
  { id: 'new', label: 'New Jobs', count: 'new' },
  { id: 'review', label: 'Under Review', count: 'underReview' },
  { id: 'due_today', label: 'Due Today', count: 'dueToday' },
  { id: 'overdue', label: 'Overdue', count: 'overdue' },
  { id: 'active', label: 'My Active Jobs', count: 'active' },
  { id: 'awaiting_confirmation', label: 'Awaiting Requester Confirmation', count: 'awaitingConfirmation' },
  { id: 'closed', label: 'Closed History', count: 'closed' },
]

const NOTICE: Record<QuickAction, string> = {
  claim: 'Job claimed. It is now in My Active Jobs.',
  start: 'Work started. The requester has been told.',
}

const iconPaths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 10h17" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.25 2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v5M12 7h.01" /></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.25" /></>,
  search: <><circle cx="10.75" cy="10.75" r="5.75" /><path d="m15.1 15.1 4.15 4.15" /></>,
  tool: <path d="M14.7 6.3a5.3 5.3 0 0 0-7.4 7.4l-5.1 5.1a2.1 2.1 0 0 0 3 3l5.1-5.1a5.3 5.3 0 0 0 7.4-7.4l-3.1 3.1-3-3z" />,
  transfer: <><path d="M7 7h11l-3-3M17 17H6l3 3" /><path d="M18 7 6 7M6 17h12" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  warning: <><path d="m12 3 9 16H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
}

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  )
}

const EMPTY_SUMMARY: ServiceWorkSummary = {
  new: 0,
  underReview: 0,
  dueToday: 0,
  overdue: 0,
  inProgress: 0,
  active: 0,
  awaitingConfirmation: 0,
  closed: 0,
  total: 0,
}

const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const quietButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const dangerButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const successButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55'
const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const boxClass = 'rounded-2xl border-2 border-slate-300/80 bg-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5'

const toneClass: Record<JobButton['tone'], string> = {
  primary: primaryButton,
  quiet: quietButton,
  danger: dangerButton,
  success: successButton,
}

function readQueueParam(): ServiceWorkQueue {
  const value = new URLSearchParams(window.location.search).get('queue')
  return QUEUES.some((item) => item.id === value) ? (value as ServiceWorkQueue) : 'new'
}

function dateText(value?: string | null, withTime = false) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date)
}

function statusKey(status?: string | null) {
  return (status || '').trim().toLowerCase().replace(/[ _-]+/g, ' ')
}

function isOpenStatus(order: ServiceWorkOrder) {
  return !['closed', 'rejected', 'cancelled'].includes(statusKey(order.status))
}

function assigneeName(assignee?: WorkOrderAssignee) {
  if (!assignee) return ''
  return typeof assignee === 'string' ? assignee : assignee.name || assignee.email || ''
}

function assignedName(order: ServiceWorkOrder) {
  return assigneeName(order.claimedBy) || assigneeName(order.assignedTo) || ''
}

// "Others" shows the description the requester typed.
function categoryLabel(code?: string | null, detail?: unknown) {
  if (!code) return 'Service request'
  const label = SERVICE_CATEGORY_LABELS[code] || code.replace(/_/g, ' ').toLowerCase()
  const text = typeof detail === 'string' ? detail.trim() : ''
  return code === 'OTHERS' && text ? `${label}: ${text}` : label
}

function priorityStyle(priority?: string | null) {
  switch ((priority || '').toLowerCase()) {
    case 'urgent': return 'bg-rose-50 text-rose-700 ring-1 ring-rose-100'
    case 'high': return 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
    default: return 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
  }
}

function statusStyle(order: ServiceWorkOrder) {
  const status = statusKey(order.status)
  if (order.isOverdue) return { label: 'Overdue', tone: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' }
  if (status === 'awaiting requester confirmation') return { label: 'Awaiting your confirmation', tone: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100' }
  if (status === 'in progress') return { label: 'In progress', tone: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' }
  if (status === 'under review') return { label: 'Under review', tone: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100' }
  if (status === 'needs information') return { label: 'Information needed', tone: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100' }
  if (status === 'closed') return { label: 'Closed', tone: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' }
  if (status === 'rejected') return { label: 'Rejected', tone: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' }
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' }
  if (assignedName(order)) return { label: 'Claimed', tone: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100' }
  return { label: 'New', tone: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' }
}

function completedTasks(order: ServiceWorkOrder) {
  return (order.checklist ?? []).filter((task) => task.completed).length
}

// The buttons a staff member can use right now. The server checks the same rules; this only hides what would fail.
function jobButtons(order: ServiceWorkOrder, viewerId: string, otherLabel: string): { buttons: JobButton[]; waiting: string } {
  if (!isOpenStatus(order)) return { buttons: [], waiting: '' }
  const status = statusKey(order.status)
  const claimedById = order.assignedStaffId ? String(order.assignedStaffId) : ''
  const mine = Boolean(viewerId) && claimedById === viewerId
  const forward: JobButton = { key: 'forward', label: `Forward to ${otherLabel}`, tone: 'quiet', dialog: 'forward' }
  const reject: JobButton = { key: 'reject', label: 'Reject job', tone: 'danger', dialog: 'reject' }

  if (status === 'awaiting requester confirmation') {
    return {
      buttons: [],
      waiting: 'Waiting for the requester to confirm the result.',
    }
  }
  if (!claimedById) return { buttons: [{ key: 'claim', label: 'Claim job', tone: 'primary', quick: 'claim' }], waiting: '' }
  if (!mine) {
    return {
      buttons: [{ key: 'takeover', label: 'Take over', tone: 'quiet', dialog: 'takeover' }],
      waiting: `Claimed by ${assignedName(order) || 'another staff member'}.`,
    }
  }
  if (status === 'in progress') return { buttons: [{ key: 'complete', label: 'Mark completed', tone: 'primary', dialog: 'complete' }], waiting: '' }
  if (status === 'needs information') {
    return { buttons: [forward, reject], waiting: "Waiting for the requester's reply. The job returns to your queue when they answer." }
  }
  // Claimed by me and not in progress yet: start the work, or send it to the other team, or reject it.
  return {
    buttons: [
      { key: 'start', label: 'Start work', tone: 'primary', quick: 'start' },
      forward,
      reject,
    ],
    waiting: '',
  }
}

function dialogCopy(kind: DialogKind, otherLabel: string) {
  switch (kind) {
    case 'forward': return { heading: `Forward to ${otherLabel}`, description: 'Use this when the job belongs to the other team. It returns to the New Jobs queue there.', label: 'Handoff note (optional)', placeholder: 'What the other team should know.', required: false, submit: `Forward to ${otherLabel}` }
    case 'start': return { heading: 'Start work', description: 'The job moves to In Progress and the requester is told that work has started.', label: 'Start note (optional)', placeholder: 'e.g. Materials are on the way.', required: false, submit: 'Start work' }
    case 'complete': return { heading: 'Mark work completed', description: 'Confirm the job is finished. The requester is then asked to confirm the result.', label: '', placeholder: '', required: false, submit: 'Yes, mark completed' }
    case 'takeover': return { heading: 'Take over this job', description: 'The job moves to you. The reason stays in the job history.', label: 'Reason for taking over', placeholder: 'e.g. The assigned staff member is on leave.', required: true, submit: 'Take over job' }
    case 'reject': return { heading: 'Reject this job', description: 'Use this when the job is not for this team or cannot be done. The requester receives the reason.', label: 'Reason for rejection', placeholder: 'Explain why this job cannot be handled.', required: true, submit: 'Reject job' }
  }
}

// Same card as the GSO dashboard metrics: label and value on the left, icon on the right, a short note underneath.
function MetricCard({ label, value, note, icon }: { label: string; value: number; note: string; icon: IconName }) {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-100/75 via-blue-50/25 to-white p-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold text-slate-500 sm:text-xs">{label}</p>
          <p className="mt-1 text-xl font-black leading-none tracking-tight tabular-nums text-slate-900 sm:mt-2 sm:text-3xl">{value}</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm shadow-blue-900/5 sm:h-10 sm:w-10"><Icon name={icon} className="h-4 w-4 sm:h-5 sm:w-5" /></span>
      </div>
      <p className="mt-2 border-t border-blue-200/50 pt-2 text-[0.62rem] font-medium text-slate-500 sm:mt-4 sm:pt-3 sm:text-[0.68rem]">{note}</p>
    </div>
  )
}

// Activity entries are read into a short Taglish title, a colour, and the reason or expected date when there is one.
type ActivityView = { title: string; tone: 'blue' | 'amber' | 'emerald' | 'rose' | 'slate'; icon: IconName; reason?: string; expected?: string; detail?: string }
const TONE_DOT: Record<ActivityView['tone'], string> = { blue: 'bg-blue-600', amber: 'bg-amber-500', emerald: 'bg-emerald-600', rose: 'bg-rose-600', slate: 'bg-slate-400' }
const STATUS_ACTIVITY: Record<string, ActivityView & { keepNote?: boolean }> = {
  Submitted: { title: 'Submitted by requester', tone: 'slate', icon: 'document' },
  'Under Review': { title: 'Under review by team', tone: 'blue', icon: 'document' },
  'Needs Information': { title: 'Requested more information', tone: 'amber', icon: 'warning', keepNote: true },
  'In Progress': { title: 'Work started', tone: 'blue', icon: 'check' },
  'Awaiting Requester Confirmation': { title: 'Done, waiting for requester confirmation', tone: 'emerald', icon: 'check' },
  Closed: { title: 'Job closed', tone: 'emerald', icon: 'check' },
  Completed: { title: 'Job completed', tone: 'emerald', icon: 'check' },
  Rejected: { title: 'Job declined', tone: 'rose', icon: 'close', keepNote: true },
  Cancelled: { title: 'Cancelled by requester', tone: 'rose', icon: 'close', keepNote: true },
}

function activityOf(entry: WorkOrderHistoryItem): ActivityView {
  const note = (entry.note || '').trim()
  const pending = note.match(/^Not finished yet\. Reason: (.*?)(?:\. Expected finish: (\d{4}-\d{2}-\d{2}))?\.?$/)
  if (pending) return { title: 'Not finished yet', tone: 'amber', icon: 'clock', reason: pending[1], expected: pending[2] }
  if (/^Claimed by /i.test(note)) return { title: 'Claimed by staff', tone: 'blue', icon: 'user', detail: note.replace(/\.$/, '') }
  const mapped = STATUS_ACTIVITY[entry.status ?? '']
  if (mapped) return { ...mapped, detail: mapped.keepNote && note ? note : undefined }
  return { title: 'Job updated', tone: 'slate', icon: 'clock', detail: note || undefined }
}

// The newest "not finished yet" entry, shown at the top of the job while the job is still In Progress.
function PendingBanner({ order }: { order: ServiceWorkOrder }) {
  if (order.status !== 'In Progress') return null
  const latest = (order.history ?? []).slice().reverse().map(activityOf).find((view) => view.reason !== undefined)
  if (!latest) return null
  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <p className="text-[0.62rem] font-extrabold uppercase tracking-widest text-amber-700">Not finished yet</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <DetailValue label="Reason" value={latest.reason} icon="warning" />
        <DetailValue label="Expected finish" value={latest.expected ? dateText(latest.expected) : null} icon="calendar" />
      </div>
    </section>
  )
}

function DetailValue({ label, value, icon }: { label: string; value?: string | null; icon: IconName }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" /><span className="text-[0.58rem] font-extrabold uppercase tracking-widest">{label}</span></div>
      <p className="mt-1 truncate text-xs font-bold text-slate-800" title={value || undefined}>{value || 'Not set'}</p>
    </div>
  )
}

function ActivityItem({ entry, latest }: { entry: WorkOrderHistoryItem; latest: boolean }) {
  const view = activityOf(entry)
  return (
    <li className="relative flex gap-3">
      <span className={`mt-3 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${latest ? 'bg-blue-600' : TONE_DOT[view.tone]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900"><Icon name={view.icon} className="h-3.5 w-3.5 text-slate-500" />{view.title}</p>
        {view.reason && <div className="mt-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2"><p className="text-[0.56rem] font-extrabold uppercase tracking-widest text-amber-700">Reason</p><p className="mt-0.5 text-xs font-semibold text-slate-800">{view.reason}</p></div>}
        {view.expected && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[0.62rem] font-extrabold text-amber-800 shadow-sm"><Icon name="calendar" className="h-3 w-3" />Expected finish {dateText(view.expected)}</p>}
        {view.detail && <p className="mt-1.5 text-xs font-medium text-slate-600">{view.detail}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.62rem] font-semibold text-slate-400"><span>{entry.actorName || entry.changedBy || 'System'}</span><span aria-hidden="true">·</span><span>{dateText(entry.changedAt, true)}</span></p>
      </div>
    </li>
  )
}

function JobCard({ order, viewerId, otherLabel, busy, onOpen, onButton }: {
  order: ServiceWorkOrder
  viewerId: string
  otherLabel: string
  busy: boolean
  onOpen: () => void
  onButton: (button: JobButton) => void
}) {
  const state = statusStyle(order)
  const primary = jobButtons(order, viewerId, otherLabel).buttons.find((button) => button.tone === 'primary')
  const checklist = order.checklist ?? []
  const deadline = order.deadlineLabel || (order.targetDate ? dateText(order.targetDate) : 'No target date')
  const handler = assignedName(order)
  return (
    <article className={`group flex min-w-0 flex-col p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/10 sm:p-4.5 ${boxClass}`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2">
          <p className="text-[0.62rem] font-extrabold uppercase tracking-widest text-blue-700">{order.referenceNo}</p>
          <h2 className="mt-1 line-clamp-2 text-sm font-black leading-snug text-slate-900 transition group-hover:text-blue-800">{order.title || 'Service request'}</h2>
        </button>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.59rem] font-extrabold ${state.tone}`}>{state.label}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`rounded-md px-2 py-1 text-[0.59rem] font-extrabold ${priorityStyle(order.priority)}`}>{order.priority || 'Standard'}</span>
        <span className="max-w-48 truncate rounded-md bg-slate-100 px-2 py-1 text-[0.59rem] font-extrabold text-slate-600" title={categoryLabel(order.serviceCategory, order.formData?.serviceOther)}>{categoryLabel(order.serviceCategory, order.formData?.serviceOther)}</span>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[0.67rem] font-semibold text-slate-600">
        <p className="flex min-w-0 items-center gap-2"><Icon name="location" className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{order.location || 'Location not set'}</span></p>
        <p className={`flex min-w-0 items-center gap-2 ${order.isOverdue ? 'text-rose-700' : ''}`}><Icon name={order.isOverdue ? 'warning' : 'clock'} className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{deadline}</span></p>
        <p className="flex min-w-0 items-center gap-2"><Icon name="user" className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{handler ? `Claimed by ${handler}` : (order.requester?.name || 'Not claimed yet')}</span></p>
      </div>

      {checklist.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-[0.62rem] font-bold text-slate-500">
          <span>Task progress</span><span className="font-extrabold text-slate-700">{completedTasks(order)}/{checklist.length}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={onOpen} className={`${quietButton} flex-1`}><span>View job</span><Icon name="arrow" className="h-3.5 w-3.5" /></button>
        {primary && <button type="button" disabled={busy} onClick={() => onButton(primary)} className={`${primaryButton} flex-1`}>{primary.label}</button>}
      </div>
    </article>
  )
}

// Preset reasons for a complete job that is not finished yet. "Others" opens a text box.
const OTHER_REASON = 'Others'
const NOT_FINISHED_REASONS = [
  'Waiting for spare parts',
  'Waiting for materials or supplies',
  'Waiting for approval or budget',
  'Waiting for the requester (access or schedule)',
  'Needs a special tool or outside service',
  'The problem is bigger than expected',
]

function ActionDialogPanel({
  kind,
  order,
  otherLabel,
  onDismiss,
  onSubmit,
  busy,
  error,
}: {
  kind: DialogKind
  order: ServiceWorkOrder
  otherLabel: string
  onDismiss: () => void
  onSubmit: (input: { note: string; tasks: WorkOrderChecklistItem[]; incompleteReason: string; finished: boolean; expectedDate: string }) => void
  busy: boolean
  error: string
}) {
  const [note, setNote] = useState('')
  const [incompleteReason, setIncompleteReason] = useState('')
  const [tasks, setTasks] = useState(() => (order.checklist ?? []).map((task) => ({ ...task })))
  // Complete dialog only: finished (send to the requester) or not finished yet (the reason is kept in the job history).
  const [finished, setFinished] = useState(true)
  const [reasonChoice, setReasonChoice] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const copy = dialogCopy(kind, otherLabel)
  const isComplete = kind === 'complete'
  const notFinished = isComplete && !finished
  const allTasksDone = tasks.every((task) => task.completed)
  const otherReason = reasonChoice === OTHER_REASON
  const reasonText = otherReason ? incompleteReason.trim() : reasonChoice
  const todayKey = new Date().toLocaleDateString('en-CA')
  const canSubmit = notFinished
    ? Boolean(reasonText) && Boolean(expectedDate) && expectedDate >= todayKey
    : (!copy.required || Boolean(note.trim())) && (!isComplete || allTasksDone || Boolean(incompleteReason.trim()))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || busy) return
    // The completion note field was replaced by a yes/no confirmation; the backend still needs a note, so a fixed one is sent.
    onSubmit({ note: isComplete && !notFinished ? 'Work finished.' : note.trim(), tasks, incompleteReason: notFinished ? reasonText : incompleteReason.trim(), finished: !notFinished, expectedDate })
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="service-action-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.13em] text-blue-700">{order.referenceNo}</p>
            <h2 id="service-action-title" className="mt-1 text-base font-black tracking-tight text-slate-900">{copy.heading}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{copy.description}</p>
          </div>
          <button type="button" disabled={busy} onClick={onDismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog"><Icon name="close" /></button>
        </div>

        {isComplete && (
          <div role="radiogroup" aria-label="Is the job finished?" className="mt-4 grid grid-cols-2 gap-2">
            {[{ value: true, label: 'Finished' }, { value: false, label: 'Not finished yet' }].map((choice) => (
              <button key={choice.label} type="button" role="radio" aria-checked={finished === choice.value} disabled={busy} onClick={() => setFinished(choice.value)} className={`rounded-xl border px-3 py-2.5 text-xs font-extrabold transition ${finished === choice.value ? (choice.value ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-800') : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}>{choice.label}</button>
            ))}
          </div>
        )}

        {isComplete && !notFinished && tasks.length > 0 && (
          <fieldset disabled={busy} className="mt-4">
            <legend className="text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">Task checklist</legend>
            <div className="mt-2 space-y-2">
              {tasks.map((task, index) => (
                <label key={task.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${task.completed ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <input type="checkbox" checked={Boolean(task.completed)} onChange={() => setTasks((current) => current.map((item, taskIndex) => taskIndex === index ? { ...item, completed: !item.completed } : item))} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
                  <span className={`text-xs font-bold ${task.completed ? 'text-emerald-800' : 'text-slate-700'}`}>{task.title}</span>
                </label>
              ))}
            </div>
            {!allTasksDone && (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">Why are some tasks not finished?</span>
                <textarea value={incompleteReason} onChange={(event) => setIncompleteReason(event.target.value)} rows={3} maxLength={2000} placeholder="Explain what remains and the next step." className={fieldClass} />
              </label>
            )}
          </fieldset>
        )}

        {notFinished
          ? <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">Why is the job not finished yet?</span>
              <select value={reasonChoice} onChange={(event) => { setReasonChoice(event.target.value); setIncompleteReason('') }} className={fieldClass}>
                <option value="">Choose a reason</option>
                {NOT_FINISHED_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                <option value={OTHER_REASON}>{OTHER_REASON}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">Expected finish date</span>
              <input type="date" min={todayKey} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} className={fieldClass} />
            </label>
            {otherReason && <label className="block">
              <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">Describe the reason</span>
              <textarea autoFocus value={incompleteReason} onChange={(event) => setIncompleteReason(event.target.value)} rows={3} maxLength={2000} placeholder="Explain what is holding the job and the next step." className={fieldClass} />
            </label>}
            <span className="block text-[0.65rem] text-slate-500">The job stays pending In Progress. The reason is saved in the job history and the requester is notified.</span>
          </div>
          : isComplete
          ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-3.5">
            <p className="text-sm font-extrabold text-slate-900">Are you sure this job is finished?</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Once you confirm, the job moves to the requester to check the result.</p>
          </div>
          : <label className="mt-4 block">
            <span className="mb-1.5 block text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">{copy.label}</span>
            <textarea autoFocus={copy.required} value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={1000} placeholder={copy.placeholder} className={fieldClass} />
          </label>}

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onDismiss} className={quietButton}>Cancel</button>
          <button type="submit" disabled={busy || !canSubmit} className={kind === 'reject' ? dangerButton : primaryButton}>{busy ? 'Saving...' : notFinished ? 'Save reason' : copy.submit}</button>
        </div>
      </form>
    </div>
  )
}

export function ServiceWorkboard({ team }: { team: ServiceWorkTeam }) {
  const copy = TEAM_COPY[team]
  const [viewerId, setViewerId] = useState('')
  const [queue, setQueue] = useState<ServiceWorkQueue>(readQueueParam)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<ServiceWorkOrder[]>([])
  const [summary, setSummary] = useState<ServiceWorkSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<ServiceWorkOrder | null>(null)
  const [detailError, setDetailError] = useState('')
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await listServiceWorkOrders({ team, queue, search, limit: 60 })
      setOrders(response.workOrders)
      setSummary(response.summary)
    } catch (error) {
      setOrders([])
      setSummary(EMPTY_SUMMARY)
      setLoadError(error instanceof Error ? error.message : 'Unable to load jobs.')
    } finally {
      setLoading(false)
    }
  }, [team, queue, search])

  useEffect(() => {
    // Defer the first fetch by one task so the page shell paints first and queue changes never set state during the effect phase.
    const timer = window.setTimeout(() => { void reload() }, 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  useEffect(() => {
    let active = true
    void getCurrentUser().then((user) => { if (active) setViewerId(String(user.id)) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  // Notifications and dashboard links open a job directly: ?request=ID, and ?action=complete opens the completion form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestId = params.get('request')
    if (!requestId) return
    let active = true
    getServiceWorkOrder(requestId)
      .then((order) => {
        if (!active) return
        setSelected(order)
        if (params.get('action') === 'complete' && statusKey(order.status) === 'in progress') setDialog('complete')
      })
      .catch((error) => { if (active) setDetailError(error instanceof Error ? error.message : 'This job could not be opened.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busyId) return
      if (dialog) { setDialog(null); setActionError(''); return }
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, dialog, busyId])

  const openOrder = async (order: ServiceWorkOrder) => {
    setSelected(order)
    setDetailError('')
    try {
      setSelected(await getServiceWorkOrder(order.id))
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Unable to load full job details.')
    }
  }

  const applyUpdatedOrder = async (updated: ServiceWorkOrder, message: string) => {
    setSelected(updated)
    setNotice(message)
    setDialog(null)
    setActionError('')
    await reload()
  }

  const runButton = async (order: ServiceWorkOrder, button: JobButton) => {
    if (button.dialog) {
      setSelected(order)
      setActionError('')
      setDialog(button.dialog)
      return
    }
    if (!button.quick) return
    setBusyId(order.id)
    try {
      const quick = button.quick
      const updated = quick === 'claim'
        ? await claimServiceWorkOrder(order.id)
        : await startServiceWorkOrder(order.id)
      await applyUpdatedOrder(updated, NOTICE[quick])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The job could not be updated.')
    } finally {
      setBusyId('')
    }
  }

  const submitDialog = async (input: { note: string; tasks: WorkOrderChecklistItem[]; incompleteReason: string; finished?: boolean; expectedDate?: string }) => {
    if (!selected || !dialog) return
    setBusyId(selected.id)
    setActionError('')
    try {
      let updated: ServiceWorkOrder
      let message = 'Job updated.'
      if (dialog === 'forward') {
        updated = await forwardServiceWorkOrder(selected.id, copy.otherTeam, input.note)
        message = `Job forwarded to ${copy.otherTeam === 'ITSS' ? 'ITSS Support' : 'GSO Facilities'}.`
      } else if (dialog === 'start') {
        updated = await startServiceWorkOrder(selected.id, input.note)
        message = 'Work started.'
      } else if (dialog === 'complete' && input.finished === false) {
        updated = await notFinishServiceWorkOrder(selected.id, input.incompleteReason, input.expectedDate ?? '')
        message = 'Saved. The requester has been told the job is still in progress.'
      } else if (dialog === 'complete') {
        updated = await completeServiceWorkOrder(selected.id, {
          completionNote: input.note,
          taskUpdates: input.tasks.map((task) => ({ id: task.id, completed: Boolean(task.completed) })),
          ...(input.incompleteReason ? { incompleteReason: input.incompleteReason } : {}),
        })
        message = 'Completion sent. The requester has been asked to confirm.'
      } else if (dialog === 'takeover') {
        updated = await takeOverServiceWorkOrder(selected.id, input.note)
        message = 'You are now handling this job.'
      } else {
        updated = await rejectServiceWorkOrder(selected.id, input.note)
        message = 'Job rejected. The requester has been told why.'
      }
      await applyUpdatedOrder(updated, message)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The job could not be updated. Please try again.')
    } finally {
      setBusyId('')
    }
  }

  const selectQueue = (nextQueue: ServiceWorkQueue) => {
    setQueue(nextQueue)
    setSelected(null)
    setDetailError('')
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setSearch(searchDraft.trim())
  }

  const selectedStatus = selected ? statusStyle(selected) : null
  const selectedActions = selected ? jobButtons(selected, viewerId, copy.otherLabel) : null
  const actionBusy = busyId !== ''
  const priorityLabel = (order: ServiceWorkOrder) => order.priority || 'Standard'

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-white/8 px-3 py-1 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {copy.eyebrow}</span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-blue-100">{copy.subtitle}</p>
          </div>
          <a href="#service-jobs" className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:self-auto"><Icon name="document" className="h-4 w-4" /> View jobs</a>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Job summary">
        <MetricCard label="New jobs" value={summary.new} note="Waiting to be claimed" icon="document" />
        <MetricCard label="Due today" value={summary.dueToday} note="Target date is today" icon="calendar" />
        <MetricCard label="Overdue" value={summary.overdue} note="Past the target date" icon="warning" />
        <MetricCard label="Awaiting confirmation" value={summary.awaitingConfirmation} note="Waiting for the requester" icon="clock" />
      </section>

      <section id="service-jobs" className={`mt-6 overflow-hidden ${boxClass}`} aria-labelledby="service-jobs-title">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon name="tool" /></span><h2 id="service-jobs-title" className="text-base font-black tracking-tight text-slate-900">Jobs</h2></div>
            <p className="mt-1 text-xs font-medium text-slate-500">Open a job to see its details. Claim it first to make it yours.</p>
          </div>
          <form onSubmit={submitSearch} className="flex w-full max-w-md gap-2">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Search jobs</span><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search reference, requester, or location" className="h-10 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
            <button type="submit" className={quietButton}>Search</button>
          </form>
        </div>

        <div className="border-b border-slate-100 px-3 py-3 sm:px-5">
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Job queues">
            {QUEUES.map((item) => {
              const active = queue === item.id
              const count = summary[item.count]
              return <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => selectQueue(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[0.68rem] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${active ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><span>{item.label}</span><span className={`rounded-md px-1.5 py-0.5 text-[0.58rem] tabular-nums ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span></button>
            })}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {loadError && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700"><Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" /><span>{loadError}</span><button type="button" onClick={() => void reload()} className="ml-auto shrink-0 font-extrabold underline underline-offset-2">Try again</button></div>}
          {loading && <div className="grid min-h-72 place-items-center"><div className="text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600" /><p className="mt-3 text-xs font-bold text-slate-400">Loading jobs...</p></div></div>}
          {!loading && !loadError && orders.length === 0 && <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><Icon name="tool" className="h-5 w-5" /></span><h3 className="mt-3 text-sm font-black text-slate-800">No jobs here</h3><p className="mt-1 text-xs font-medium text-slate-500">{search ? 'Try a different search term.' : 'Nothing is waiting in this queue.'}</p></div></div>}
          {!loading && !loadError && orders.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{orders.map((order) => <JobCard key={order.id} order={order} viewerId={viewerId} otherLabel={copy.otherLabel} busy={busyId === order.id} onOpen={() => { void openOrder(order) }} onButton={(button) => { void runButton(order, button) }} />)}</div>}
        </div>
      </section>

      {notice && <div role="status" className="fixed bottom-5 right-5 z-70 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xl shadow-slate-900/15"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white"><Icon name="check" className="h-3.5 w-3.5" /></span><span>{notice}</span><button type="button" onClick={() => setNotice('')} className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss message"><Icon name="close" className="h-3.5 w-3.5" /></button></div>}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-[2px]" role="presentation">
          <button type="button" aria-label="Close job details" onClick={() => setSelected(null)} className="absolute inset-0 cursor-default" />
          <aside role="dialog" aria-modal="true" aria-labelledby="service-detail-title" className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[#f4f7fb] shadow-2xl">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.11em] text-blue-700">{selected.referenceNo}</p>
                  <h2 id="service-detail-title" className="mt-1 text-lg font-black tracking-tight text-slate-900">{selected.title || 'Service request'}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-[0.59rem] font-extrabold ${selectedStatus?.tone}`}>{selectedStatus?.label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[0.59rem] font-extrabold ${priorityStyle(selected.priority)}`}>{priorityLabel(selected)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.59rem] font-extrabold text-slate-600">{categoryLabel(selected.serviceCategory, selected.formData?.serviceOther)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800" aria-label="Close job details"><Icon name="close" /></button>
              </div>
            </header>

            <div className="flex-1 space-y-4 p-4 sm:p-6">
              {detailError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{detailError}</div>}
              {actionError && !dialog && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{actionError}</div>}

              <PendingBanner order={selected} />

              <section className={`${boxClass} p-4 shadow-slate-300/20`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <DetailValue label="Location" value={selected.location} icon="location" />
                  <DetailValue label="Target" value={selected.deadlineLabel || dateText(selected.targetDate)} icon={selected.isOverdue ? 'warning' : 'calendar'} />
                  <DetailValue label="Requester" value={selected.requester?.name} icon="user" />
                  <DetailValue label="Department" value={selected.requester?.department} icon="document" />
                  <DetailValue label="Claimed by" value={assignedName(selected) || 'Not claimed yet'} icon="user" />
                  <DetailValue label="Submitted" value={dateText(selected.createdAt, true)} icon="clock" />
                </div>
                {selected.description && <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-[0.62rem] font-extrabold uppercase tracking-widest text-slate-500">Reported concern</p><p className="mt-1.5 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-700">{selected.description}</p></div>}
              </section>

              <section className={`${boxClass} p-4 shadow-slate-300/20`}>
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-slate-900">Work checklist</h3><p className="mt-0.5 text-[0.65rem] font-medium text-slate-500">{selected.checklist?.length ? `${completedTasks(selected)} of ${selected.checklist.length} done` : 'No checklist items'}</p></div></div>
                {selected.checklist?.length ? <ul className="mt-3 space-y-2">{selected.checklist.map((task) => <li key={task.id} className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5"><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${task.completed ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300 bg-white'}`}>{task.completed && <Icon name="check" className="h-2.5 w-2.5" />}</span><span className="min-w-0"><span className={`block text-xs font-semibold ${task.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{task.title}</span>{task.details && <span className="mt-0.5 block text-[0.65rem] font-medium leading-relaxed text-slate-500">{task.details}</span>}</span></li>)}</ul> : null}
                {selected.completionNote && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3"><p className="text-[0.62rem] font-extrabold uppercase tracking-widest text-emerald-700">Completion note</p><p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-700">{selected.completionNote}</p></div>}
              </section>

              {selected.transfers && selected.transfers.length > 0 && (
                <section className={`${boxClass} p-4 shadow-slate-300/20`}>
                  <h3 className="text-sm font-black text-slate-900">Transfer history</h3>
                  <ol className="mt-3 space-y-2.5">{selected.transfers.map((entry) => <li key={entry.id} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white text-blue-700 shadow-sm"><Icon name="transfer" className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="text-xs font-bold text-slate-800">{entry.note}</p><p className="mt-0.5 text-[0.62rem] font-medium text-slate-400">{entry.actorName || entry.changedBy || 'System'} · {dateText(entry.changedAt, true)}</p></div></li>)}</ol>
                </section>
              )}

              <section className={`${boxClass} p-4 shadow-slate-300/20`}>
                <h3 className="text-sm font-black text-slate-900">Activity</h3>
                {selected.history?.length
                  ? <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-1">{selected.history.slice().reverse().map((entry, index) => <ActivityItem key={entry.id} entry={entry} latest={index === 0} />)}</ol>
                  : <p className="mt-2 text-xs font-medium text-slate-500">No activity recorded yet.</p>}
              </section>
            </div>

            {selectedActions && (selectedActions.buttons.length > 0 || selectedActions.waiting) && (
              <footer className="sticky bottom-0 border-t border-slate-200 bg-white p-4 shadow-[0_-10px_25px_rgba(15,23,42,0.06)] sm:px-6">
                {selectedActions.waiting && <p className="mb-2 flex items-center gap-2 text-[0.67rem] font-semibold text-slate-500"><Icon name="clock" className="h-3.5 w-3.5" /> {selectedActions.waiting}</p>}
                <div className="flex flex-wrap gap-2">
                  {selectedActions.buttons.map((button) => (
                    <button
                      key={button.key}
                      type="button"
                      disabled={actionBusy}
                      onClick={() => { void runButton(selected, button) }}
                      className={toneClass[button.tone]}
                    >
                      {busyId === selected.id && button.quick ? 'Saving...' : button.label}
                    </button>
                  ))}
                </div>
              </footer>
            )}
          </aside>
        </div>
      )}

      {selected && dialog && <ActionDialogPanel kind={dialog} order={selected} otherLabel={copy.otherLabel} busy={actionBusy} error={actionError} onDismiss={() => { if (!actionBusy) { setDialog(null); setActionError('') } }} onSubmit={(input) => { void submitDialog(input) }} />}
    </>
  )
}

export default function ServiceWorkboardPage() {
  return (
    <GsoPageFrame activePage="Service Workboard" searchPlaceholder="">
      <ServiceWorkboard team="GSO" />
    </GsoPageFrame>
  )
}
