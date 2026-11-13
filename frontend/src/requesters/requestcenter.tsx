import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import RequesterLayout from './requesterlayout'
import { useRequesterIdentity } from './requesteridentitycontext'
import { type RequestType } from './requesterApi'

type IconName = 'arrow' | 'building' | 'cart' | 'clipboard' | 'package' | 'truck' | 'warning' | 'wrench'

const iconPaths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  building: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01" />,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.25V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v.75M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  package: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  warning: <><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />,
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>
}

const services: Array<{ type: RequestType; title: string; detail: string; icon: IconName }> = [
  { type: 'FACILITY_USE', title: 'Facility Use Permit', detail: 'Reserve a campus venue and list needed equipment.', icon: 'building' },
  { type: 'JOB_REQUEST', title: 'Job / Service Request', detail: 'Describe the work, location, and target date.', icon: 'wrench' },
  { type: 'LOSS_DAMAGE_REPORT', title: 'Loss / Damage Report', detail: 'Report lost or damaged school property.', icon: 'warning' },
]

const newRequestHref = (type: RequestType) => `/requester/requests/new?type=${type}`
const cardClass = 'group flex min-h-0 flex-col rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-100/75 via-blue-50/25 to-white p-4 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/15 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 lg:min-h-48 sm:p-5'
const cardIconClass = 'grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm shadow-blue-900/5 sm:h-11 sm:w-11'
const eyebrowClass = 'text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-blue-700'

function StartLabel({ children = 'Start request' }: { children?: ReactNode }) {
  return <span className="mt-3 inline-flex items-center gap-1.5 text-[0.68rem] font-extrabold text-blue-700 sm:mt-4 sm:text-xs">{children}<Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" /></span>
}

type ConfirmTarget = { title: string; detail: string; href: string; icon: IconName }

function VerifyIdentityPrompt({ onClose }: { onClose: () => void }) {
  const { openIdentityPrompt } = useRequesterIdentity()
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const handleComplete = () => {
    openIdentityPrompt()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="identity-warning-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border-2 border-amber-200 bg-white p-5 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-100 bg-amber-50 text-amber-700"><Icon name="warning" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="identity-warning-title" className="text-base font-black tracking-tight text-slate-900">Complete your details first</h2>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium leading-relaxed text-slate-600">Your staff details must be verified by GSO before you can submit requests. Complete your employee information in the next step.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border-2 border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm hover:bg-slate-50">Not now</button>
          <button type="button" onClick={handleComplete} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-extrabold text-white shadow-sm shadow-amber-900/20 transition hover:bg-amber-700">Complete your details<Icon name="arrow" className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}

function RequestConfirmDialog({ target, onClose }: { target: ConfirmTarget; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="request-confirm-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border-2 border-slate-300/80 bg-white p-5 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={cardIconClass}><Icon name={target.icon} className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className={eyebrowClass}>Start request</p>
            <h2 id="request-confirm-title" className="mt-1 text-base font-black tracking-tight text-slate-900">{target.title}</h2>
          </div>
        </div>
        <p className="mt-4 text-xs font-medium leading-relaxed text-slate-600">{target.detail}</p>
        <p className="mt-2 text-xs font-bold text-slate-700">Next, answer the request form on the next page.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border-2 border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 shadow-sm hover:bg-slate-50">Cancel</button>
          <a href={target.href} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white shadow-sm shadow-blue-900/20 transition hover:bg-blue-700">Continue to form<Icon name="arrow" className="h-4 w-4" /></a>
        </div>
      </div>
    </div>
  )
}

function RequestCenterContent() {
  const { identity } = useRequesterIdentity()
  const verified = identity?.status === 'Verified'
  const [confirming, setConfirming] = useState<ConfirmTarget | null>(null)
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false)
  const openConfirm = (event: MouseEvent<HTMLAnchorElement>, target: ConfirmTarget) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    if (!verified) {
      setShowVerifyPrompt(true)
    } else {
      setConfirming(target)
    }
  }
  const lockedMessage = identity?.status === 'Pending'
    ? 'Your account is waiting for GSO verification. Requests unlock once it is approved.'
    : identity?.status === 'Needs Correction'
      ? 'GSO asked for corrections. Update your details in Profile, then resubmit.'
      : 'Complete your staff details in Profile and submit them for GSO verification. Requests stay locked until your account is verified.'
  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl bg-[#09244a] px-5 py-6 text-white shadow-xl shadow-blue-950/15 sm:px-7 sm:py-7">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(96,165,250,0.42),transparent_28%),radial-gradient(circle_at_72%_100%,rgba(14,165,233,0.2),transparent_36%)]" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-100"><span className="h-1.5 w-1.5 rounded-full bg-blue-200" /> School services</span>
          <h1 className="mt-3 text-xl font-black tracking-tight sm:mt-4 sm:text-3xl">Choose a request</h1>
          <p className="mt-1.5 max-w-2xl text-xs font-medium leading-relaxed text-blue-100 sm:mt-2 sm:text-sm">{verified ? 'Your verified identity is attached automatically.' : lockedMessage} Track updates in My Requests.</p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="inventory-heading">
        <p className={eyebrowClass}>Equipment & supplies</p>
        <h2 id="inventory-heading" className="mt-1 text-lg font-black tracking-tight text-slate-900">Inventory</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <article className="overflow-hidden rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-50/60 via-white to-white shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 lg:col-span-2">
            <div className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
              <span className={cardIconClass}><Icon name="clipboard" className="h-5 w-5" /></span>
              <div className="min-w-0">
                <span className="block text-sm font-black tracking-tight text-slate-900 sm:text-base">Request for Issuance</span>
                <span className="mt-1 block text-[0.68rem] font-medium leading-relaxed text-slate-500">Tell GSO what your department needs.</span>
              </div>
            </div>
            <div className="divide-y divide-blue-100 p-2 sm:p-3">
              <a href="/requester/requests/new?type=ITEM_REQUEST" onClick={(event) => openConfirm(event, { title: 'Request an item', detail: 'Choose a catalog item or describe what you need.', href: '/requester/requests/new?type=ITEM_REQUEST', icon: 'package' })} className="group flex items-center gap-3 rounded-xl bg-linear-to-r from-blue-50/50 to-white p-3 transition hover:from-blue-50/70 hover:to-white focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700"><Icon name="package" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-black leading-tight tracking-tight text-slate-900">Request an item</span><span className="mt-0.5 hidden text-[0.68rem] font-medium text-slate-500 lg:block">Choose a catalog item or describe what you need.</span></span>
                <Icon name="arrow" className="h-4 w-4 shrink-0 text-blue-700 transition group-hover:translate-x-1" />
              </a>
            </div>
          </article>

          <a href={newRequestHref('BORROWING')} onClick={(event) => openConfirm(event, { title: 'Borrow equipment', detail: 'Use it, then return it by the date you set. Items you keep go under Request an item.', href: newRequestHref('BORROWING'), icon: 'package' })} className={cardClass}>
            <span className={cardIconClass}><Icon name="package" /></span>
            <span className="mt-3 text-base font-black tracking-tight text-slate-900">Borrow equipment</span>
            <span className="mt-1.5 flex-1 text-xs font-medium leading-relaxed text-slate-500">Use it, then return it by the date you set. Items you keep go under Request an item.</span>
            <StartLabel>Browse inventory</StartLabel>
          </a>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="services-heading">
        <p className={eyebrowClass}>School services</p>
        <h2 id="services-heading" className="mt-1 text-lg font-black tracking-tight text-slate-900">Other requests</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {services.map((card) => (
            <a key={card.type} href={newRequestHref(card.type)} onClick={(event) => openConfirm(event, { title: card.title, detail: card.detail, href: newRequestHref(card.type), icon: card.icon })} className={cardClass}>
              <span className={cardIconClass}><Icon name={card.icon} /></span>
              <span className="mt-2 text-sm font-black leading-tight tracking-tight text-slate-900 sm:mt-3 sm:text-base">{card.title}</span>
              <span className="mt-1.5 hidden flex-1 text-xs font-medium leading-relaxed text-slate-500 lg:block">{card.detail}</span>
              <StartLabel />
            </a>
          ))}

          <article className="flex min-h-48 flex-col rounded-2xl border-2 border-dashed border-slate-300 bg-linear-to-br from-blue-50/60 via-white to-white p-5 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 shadow-sm shadow-blue-900/5"><Icon name="truck" /></span>
            <span className="mt-2 text-sm font-black leading-tight tracking-tight text-slate-700 sm:mt-3 sm:text-base">Vehicle / Other Services</span>
            <span className="mt-1.5 hidden flex-1 text-xs font-medium leading-relaxed text-slate-500 lg:block">Official forms and approvals still required.</span>
            <span className="mt-3 inline-flex w-fit rounded-full bg-slate-200 px-2.5 py-1 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-600">Not available</span>
          </article>
        </div>
      </section>
      <p className="mt-5 text-[0.68rem] leading-relaxed text-slate-500">GSO reviews every request. Track updates in <a href="/requester/my-requests" className="font-extrabold text-blue-700 hover:underline">My Requests</a>.</p>
      {showVerifyPrompt && <VerifyIdentityPrompt onClose={() => setShowVerifyPrompt(false)} />}
      {confirming && <RequestConfirmDialog target={confirming} onClose={() => setConfirming(null)} />}
    </div>
  )
}

export default function RequestCenter() {
  return <RequesterLayout title="Request Center" subtitle="Choose a request type."><RequestCenterContent /></RequesterLayout>
}
