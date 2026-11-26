import type { ReactNode } from 'react'

// Shared pieces for the IT Admin pages, styled like the GSO metric cards and icon badges.
export type AdminGlyphName = 'alert' | 'arrow' | 'check' | 'clock' | 'history' | 'plus' | 'search' | 'users' | 'wrench'

const glyphs: Record<AdminGlyphName, ReactNode> = {
  alert: (
    <>
      <path d="m12 3 9 16H3L12 3Z" />
      <path d="M12 9v4M12 16h.01" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.25 2" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  plus: <path d="M12 5v14m-7-7h14" />,
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="5.75" />
      <path d="m15.1 15.1 4.15 4.15" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  wrench: <path d="M14.7 6.3a5.3 5.3 0 0 0-7.4 7.4l-5.1 5.1a2.1 2.1 0 0 0 3 3l5.1-5.1a5.3 5.3 0 0 0 7.4-7.4l-3.1 3.1-3-3z" />,
}

export function AdminGlyph({ name, className = 'h-4 w-4' }: { name: AdminGlyphName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {glyphs[name]}
    </svg>
  )
}

// A metric card. With an href it is a link with an arrow, like the GSO overview cards.
export function AdminMetricCard({ label, value, detail, icon, href, badgeTone = 'bg-blue-50 text-blue-700', valueTone = 'text-slate-900' }: {
  label: string
  value: number | string | undefined
  detail: string
  icon: AdminGlyphName
  href?: string
  badgeTone?: string
  valueTone?: string
}) {
  const shown = value === undefined ? '—' : typeof value === 'number' ? value.toLocaleString('en-PH') : value
  const body = (
    <>
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-bold leading-tight text-slate-500 sm:text-xs">{label}</p>
          <p className={`mt-1.5 text-xl font-black tracking-tight sm:mt-2 sm:text-3xl ${valueTone}`}>{shown}</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-blue-700 shadow-sm sm:h-10 sm:w-10">
          <AdminGlyph name={icon} className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-blue-200/50 pt-2 sm:mt-4 sm:pt-3">
        <span className={`rounded-lg px-2 py-0.5 text-[0.65rem] font-extrabold ${badgeTone}`}>{detail}</span>
        {href && <span className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700"><AdminGlyph name="arrow" /></span>}
      </div>
    </>
  )
  const cardClass = 'group rounded-2xl border-2 border-slate-300/80 bg-linear-to-br from-blue-100/75 via-blue-50/25 to-white p-3 shadow-md shadow-slate-300/35 ring-1 ring-slate-900/5 transition hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/15 sm:p-4'

  return href ? (
    <a href={href} className={`${cardClass} block transition hover:-translate-y-0.5 hover:border-blue-200`}>{body}</a>
  ) : (
    <article className={cardClass}>{body}</article>
  )
}
