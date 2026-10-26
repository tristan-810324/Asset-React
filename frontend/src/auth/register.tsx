import { useState, type FormEvent } from 'react'
import { registerBorrower, savePendingEmailVerification } from './authApi'

export default function Register() {
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') || '').trim()
    const email = String(formData.get('email') || '').trim()
    const password = String(formData.get('password') || '')
    const confirmPassword = String(formData.get('confirmPassword') || '')

    if (password !== confirmPassword) {
      setFeedback({ type: 'error', message: 'Passwords do not match. Please check and try again.' })
      setIsSubmitting(false)
      return
    }

    try {
      const pending = await registerBorrower(name, email, password)
      savePendingEmailVerification({ ...pending, flow: 'registration' })
      window.location.replace('/verify-email')
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to create your account. Please try again.' })
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-500 selection:text-white">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center lg:hidden"
        style={{ backgroundImage: "url('/dyci_img/homepage4.jpg')" }}
      >
        <div className="absolute inset-0 bg-linear-to-b from-white/40 via-white/20 to-slate-900/30 backdrop-blur-[3px]" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <section
          className="relative hidden min-h-107.5 overflow-hidden bg-cover bg-center lg:flex lg:min-h-screen"
          style={{ backgroundImage: "url('/dyci_img/homepage4.jpg')" }}
          aria-label="Dr. Yanga's Colleges campus"
        >
          <div className="absolute inset-0 bg-slate-950/60" />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/30 to-slate-950/10" />

          <a
            href="/"
            className="absolute left-7 top-7 z-10 inline-flex items-center gap-2 rounded-full bg-slate-950/60 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-slate-950/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span aria-hidden="true" className="text-lg leading-none">←</span>
            Back to Home
          </a>

          <div className="relative z-10 mt-auto max-w-xl px-8 pb-12 xl:px-12 xl:pb-14">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/50 px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-blue-200 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              DR. YANGA&apos;S COLLEGES, INC.
            </div>

            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-[3.2rem]">
              Create your
              <span className="mt-1 block">
                <span className="bg-linear-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
                  A.SSET
                </span>{' '}
                <span className="bg-linear-to-r from-sky-300 via-blue-200 to-indigo-200 bg-clip-text text-transparent">
                  account.
                </span>
              </span>
            </h1>

            <p className="mt-5 max-w-md text-sm font-medium leading-relaxed text-slate-200">
              Register to get started with the A.SSET Campus System.
            </p>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:bg-white lg:px-16 xl:px-20">
          <a
            href="/"
            className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 text-[0.7rem] font-extrabold text-slate-800 shadow-sm backdrop-blur-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:left-8 sm:top-6 sm:px-4 sm:py-2 sm:text-xs lg:hidden"
          >
            <span aria-hidden="true" className="text-base leading-none">←</span>
            Back to Home
          </a>

          <div className="relative z-10 w-full max-w-85 rounded-3xl bg-linear-to-b from-white/90 via-white/50 to-blue-400/30 p-px shadow-2xl shadow-slate-950/15 sm:max-w-105 lg:max-w-100 lg:bg-none lg:p-0 lg:shadow-none">
            <div className="w-full rounded-3xl bg-white/85 p-5 backdrop-blur-xl transition-all sm:p-7 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
              <div className="mb-3 text-center lg:hidden">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/15 bg-blue-50/70 px-2.5 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-blue-700 shadow-xs">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
                  A.SSET Campus System
                </span>
              </div>

              <div className="mb-3.5 flex items-center justify-center gap-2.5 sm:mb-5 sm:gap-3.5">
                <img
                  src="/dyci_img/A.sset.webp"
                  alt="A.SSET logo"
                  className="h-10 w-10 object-contain transition-transform hover:scale-105 sm:h-13 sm:w-13 lg:h-16 lg:w-16"
                />
                <div className="h-6 w-px bg-slate-300/80 sm:h-8" />
                <img
                  src="/dyci_img/dyci-logo.webp"
                  alt="Dr. Yanga's Colleges logo"
                  className="h-9 w-9 object-contain transition-transform hover:scale-105 sm:h-11 sm:w-11 lg:h-14 lg:w-14"
                />
              </div>

              <div className="mb-3.5 text-center sm:mb-5 sm:text-left">
                <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl lg:text-2xl">
                  Create borrower account
                </h2>
                <p className="mt-0.5 text-[0.7rem] font-medium text-slate-600 sm:text-xs">
                  Register with your email to request and track borrowed items.
                </p>
              </div>

              <form className="space-y-3 sm:space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="name" className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 sm:text-[0.68rem] lg:text-[0.7rem]">
                    Full name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    maxLength={120}
                    required
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm shadow-slate-900/5 outline-none transition duration-200 placeholder:text-slate-500 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 sm:h-11 sm:px-4 sm:text-sm lg:h-12"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 sm:text-[0.68rem] lg:text-[0.7rem]">
                    Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="yourname@example.com"
                    required
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm shadow-slate-900/5 outline-none transition duration-200 placeholder:text-slate-500 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 sm:h-11 sm:px-4 sm:text-sm lg:h-12"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 sm:text-[0.68rem] lg:text-[0.7rem]">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    minLength={8}
                    maxLength={72}
                    required
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm shadow-slate-900/5 outline-none transition duration-200 placeholder:text-slate-500 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 sm:h-11 sm:px-4 sm:text-sm lg:h-12"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 sm:text-[0.68rem] lg:text-[0.7rem]">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    minLength={8}
                    maxLength={72}
                    required
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-sm shadow-slate-900/5 outline-none transition duration-200 placeholder:text-slate-500 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15 sm:h-11 sm:px-4 sm:text-sm lg:h-12"
                  />
                </div>

                {feedback && (
                  <p
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}
                  >
                    {feedback.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[0.7rem] font-black uppercase tracking-[0.14em] text-white shadow-md shadow-blue-600/25 transition duration-200 hover:bg-blue-500 hover:shadow-blue-600/35 active:scale-[0.98] focus:outline-none focus-visible:ring-3 focus-visible:ring-blue-500/25 sm:h-11 sm:text-xs lg:h-12"
                >
                  {isSubmitting ? 'Creating account...' : 'Create account'}
                  <span aria-hidden="true" className="text-sm leading-none sm:text-base">→</span>
                </button>
              </form>

              <p className="mt-4 text-center text-[0.7rem] font-medium text-slate-600 sm:text-xs">
                Already have an account?{' '}
                <a href="/login" className="font-extrabold text-blue-600 transition hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
