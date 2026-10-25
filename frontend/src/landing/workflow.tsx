import type { ReactNode } from 'react'

type WorkflowStep = {
  number: string
  title: string
  description: string
  icon: ReactNode
}

const steps: WorkflowStep[] = [
  {
    number: '01',
    title: 'Record',
    description: 'Keep item details and equipment records organized.',
    icon: <><path d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1.5-1.5Z" /><path d="M14 3.5V8h4M9 12h6M9 16h6" /></>,
  },
  {
    number: '02',
    title: 'Issue',
    description: 'Record equipment assignments to employees.',
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M20 8v6m-3-3h6" /></>,
  },
  {
    number: '03',
    title: 'Return',
    description: 'Update the equipment record when it is returned.',
    icon: <><path d="M4 7h12a4 4 0 1 1 0 8h-1" /><path d="m8 3-4 4 4 4M20 17H8a4 4 0 1 0 0 8h1" transform="translate(0 -2)" /></>,
  },
  {
    number: '04',
    title: 'Repair',
    description: 'Follow up on items that need repair.',
    icon: <><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3.4-3.4 3.4-3Z" /></>,
  },
]

export function WorkflowSection() {
  return (
    <section id="workflow" aria-labelledby="lifecycle-heading" className="relative isolate overflow-hidden bg-[#081d42] px-4 py-8 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_5%,rgba(37,99,235,0.24),transparent_38%),radial-gradient(ellipse_at_88%_72%,rgba(14,165,233,0.2),transparent_34%)]" />
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-20">
        <defs>
          <pattern id="workflow-dot-pattern" width="36" height="36" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="#bfdbfe" fillOpacity="0.65" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#workflow-dot-pattern)" />
      </svg>

      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-blue-100 backdrop-blur-sm">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-300" />Equipment lifecycle
            </p>
            <h2 id="lifecycle-heading" className="mt-3 max-w-3xl text-2xl font-black leading-[1.08] tracking-[-0.045em] text-white sm:mt-4 sm:text-4xl lg:text-5xl">
              A simple four-step <span className="text-sky-200">equipment journey.</span>
            </h2>
          </div>
          <p className="max-w-xl text-xs leading-5 text-blue-100/80 sm:text-base sm:leading-7 lg:justify-self-end">
            Follow each item through the everyday work of recording, issuing, returning, and repair follow-up.
          </p>
        </div>

        <div className="relative mt-6 sm:mt-8 lg:mt-10">
          <div aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-linear-to-r from-blue-300/10 via-sky-200/70 to-blue-300/10 lg:block" />
          <ol className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {steps.map((step) => (
              <li key={step.number} className="relative min-w-0">
                <div className="relative z-10 flex items-center gap-3 lg:justify-center">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-sky-100/40 bg-[#0d2c5d] text-[0.62rem] font-black tracking-wide text-sky-100 shadow-[0_0_0_5px_rgba(8,29,66,0.9)] sm:h-12 sm:w-12 sm:text-xs sm:shadow-[0_0_0_6px_rgba(8,29,66,0.9)]">
                    {step.number}
                  </span>
                  <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.12em] text-blue-200/70 sm:text-[0.65rem] sm:tracking-[0.18em] lg:hidden">Step {step.number}</span>
                </div>
                <article className="mt-3 flex min-h-40 flex-col rounded-[1.25rem] border border-white/15 bg-white/7 p-3.5 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.65)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-sky-200/40 hover:bg-white/10 sm:mt-4 sm:min-h-52 sm:rounded-3xl sm:p-6 lg:min-h-56">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/10 text-sky-200 shadow-inner shadow-white/5 sm:h-12 sm:w-12 sm:rounded-2xl">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 sm:h-7 sm:w-7" aria-hidden="true">
                      {step.icon}
                    </svg>
                  </span>
                  <div className="mt-auto pt-4 sm:pt-6">
                    <h3 className="text-base font-extrabold tracking-tight text-white sm:text-xl">{step.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-blue-100/75 sm:mt-2.5 sm:text-sm sm:leading-6">{step.description}</p>
                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 sm:mt-5 sm:pt-3.5">
                      <span className="text-[0.5rem] font-extrabold uppercase tracking-widest text-sky-100/65 sm:text-[0.62rem] sm:tracking-[0.14em]">Equipment lifecycle</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-sky-200/80 sm:h-4 sm:w-4" aria-hidden="true">
                        <path d="M5 12h14m-6-6 6 6-6 6" />
                      </svg>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
