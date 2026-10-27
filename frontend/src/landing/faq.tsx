import { useRef, useState, type KeyboardEvent } from 'react'

type FaqItem = {
  id: string
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  {
    id: 'what-is-asset',
    question: 'What is A.SSET?',
    answer: "A.SSET is DYCI's equipment tracking portal for inventory, employee assignments, returns, and repair follow-up.",
  },
  {
    id: 'who-can-use',
    question: 'Who can use A.SSET?',
    answer: 'GSO Staff, IT Admin, and authorized requesters can sign in. Your account determines which workspace and tools are available.',
  },
  {
    id: 'borrow-equipment',
    question: 'How can I borrow equipment?',
    answer: 'Follow the borrowing process set by GSO. Check with the team for current availability and instructions before submitting a request.',
  },
  {
    id: 'get-help',
    question: 'Who should I contact for help?',
    answer: 'Contact GSO about equipment, requests, returns, or repairs. Contact IT Admin for sign-in and account access through official DYCI support channels.',
  },
]

export function FAQSection() {
  const [openId, setOpenId] = useState<string | null>(null)
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([])

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>, itemIndex: number) => {
    let focusIndex: number | null = null

    if (event.key === 'ArrowDown') focusIndex = (itemIndex + 1) % faqItems.length
    if (event.key === 'ArrowUp') focusIndex = (itemIndex + faqItems.length - 1) % faqItems.length
    if (event.key === 'Home') focusIndex = 0
    if (event.key === 'End') focusIndex = faqItems.length - 1

    if (focusIndex !== null) {
      event.preventDefault()
      triggerRefs.current[focusIndex]?.focus()
    }
  }

  return (
    <section id="faq" aria-labelledby="faq-heading" className="relative isolate overflow-hidden bg-[#f3f7fc] px-4 py-8 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-36 -top-40 h-120 w-120 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-48 -left-28 h-120 w-120 rounded-full bg-sky-100/90 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3.5 py-2 text-[0.65rem] font-extrabold uppercase tracking-[0.15em] text-blue-800 shadow-sm shadow-blue-900/5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-600" />Help center
            </p>
            <h2 id="faq-heading" className="mt-3 max-w-xl text-2xl font-black leading-[1.1] tracking-[-0.045em] text-slate-950 sm:mt-4 sm:text-4xl lg:text-4xl">
              Quick answers about <span className="text-blue-700">A.SSET.</span>
            </h2>
          </div>
          <p className="max-w-2xl text-xs leading-5 text-slate-600 sm:text-base sm:leading-8 lg:justify-self-end">
            A few essentials about portal access and equipment requests. For a specific concern, the right school team can help.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:mt-7 sm:gap-4 lg:mt-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-stretch">
          <aside className="relative isolate flex flex-col overflow-hidden rounded-[1.25rem] bg-[#081d42] bg-linear-to-br from-[#081d42] via-[#0b2b60] to-[#15528f] p-4 text-white shadow-[0_24px_70px_-36px_rgba(5,27,64,0.5)] sm:rounded-3xl sm:p-6">
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_100%_0%,rgba(125,211,252,0.24),transparent_38%),radial-gradient(circle_at_0%_100%,rgba(37,99,235,0.24),transparent_42%)]" />
            <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-sky-200">Need a hand?</p>
            <h3 className="mt-2.5 text-xl font-black leading-tight tracking-[-0.035em] sm:mt-3 sm:text-2xl">Talk to the right team.</h3>
            <p className="mt-2.5 max-w-md text-xs leading-5 text-blue-100/85 sm:mt-3 sm:text-sm sm:leading-7">
              GSO can help with equipment and borrowing. IT Admin can help with sign-in and account access.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
              <div className="rounded-xl border border-white/15 bg-white/8 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-[0.65rem] font-black text-white ring-1 ring-white/10 sm:h-10 sm:w-10 sm:rounded-xl sm:text-xs">GS</span>
                <span className="mt-2.5 block text-xs font-extrabold text-white sm:mt-3 sm:text-sm">GSO Staff</span>
                <span className="mt-1 block text-[0.65rem] leading-4 text-blue-100/70 sm:text-xs sm:leading-5">Equipment help</span>
              </div>
              <div className="rounded-xl border border-white/15 bg-white/8 p-3 backdrop-blur-sm sm:rounded-2xl sm:p-4">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-200/15 text-[0.65rem] font-black text-sky-100 ring-1 ring-white/10 sm:h-10 sm:w-10 sm:rounded-xl sm:text-xs">IT</span>
                <span className="mt-2.5 block text-xs font-extrabold text-white sm:mt-3 sm:text-sm">IT Admin</span>
                <span className="mt-1 block text-[0.65rem] leading-4 text-blue-100/70 sm:text-xs sm:leading-5">Access help</span>
              </div>
            </div>

         
          </aside>

          <div className="overflow-hidden rounded-[1.25rem] border border-blue-100 bg-white shadow-[0_18px_55px_-38px_rgba(15,37,79,0.35)] sm:rounded-[1.75rem]">
            <div className="flex items-center justify-between border-b border-blue-100 bg-white px-3.5 py-3 sm:px-6 sm:py-3.5">
              <div>
                <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.15em] text-blue-700">Frequently asked</p>
                <p className="mt-1 text-xs text-slate-500">Four quick essentials</p>
              </div>
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-700 sm:h-10 sm:w-10 sm:rounded-xl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 sm:h-5 sm:w-5">
                  <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </span>
            </div>

            {faqItems.map((item, index) => {
              const isOpen = openId === item.id
              const panelId = `${item.id}-panel`
              const triggerId = `${item.id}-trigger`

              return (
                <article key={item.id} className="border-b border-slate-100 last:border-b-0">
                  <h3>
                    <button
                      ref={(node) => { triggerRefs.current[index] = node }}
                      id={triggerId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpenId((current) => current === item.id ? null : item.id)}
                      onKeyDown={(event) => handleTriggerKeyDown(event, index)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-blue-50/70 focus:outline-none focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:gap-4 sm:px-6 sm:py-4"
                    >
                      <span aria-hidden="true" className={`hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-[0.62rem] font-extrabold sm:grid ${isOpen ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700'}`}>
                        0{index + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-[0.82rem] font-extrabold leading-5 text-slate-900 sm:text-sm sm:leading-6">{item.question}</span>
                      <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-base font-medium text-blue-700 transition-transform sm:h-9 sm:w-9 sm:text-lg ${isOpen ? 'rotate-45 bg-blue-100' : ''}`}>
                        +
                      </span>
                    </button>
                  </h3>
                  <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!isOpen} className="px-4 pb-4 sm:pl-19 sm:pr-7 sm:pb-6">
                    <p className="max-w-3xl border-l-2 border-blue-200 pl-3 text-xs leading-5 text-slate-600 sm:pl-4 sm:text-sm sm:leading-7">{item.answer}</p>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
