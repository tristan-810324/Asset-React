import { useState, type FormEvent } from 'react'
import { dashboardPathForRoles, saveAuthToken, savePendingEmailVerification, signIn } from './authApi'

export default function Login() {
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') || '').trim()
    const password = String(formData.get('password') || '')

    try {
      const result = await signIn(email, password)
      if ('requiresEmailVerification' in result) {
        savePendingEmailVerification(result)
        window.location.replace('/verify-email')
        return
      }

      const destination = dashboardPathForRoles(result.user.roles)

      if (!destination) {
        throw new Error('Walang dashboard role ang account na ito. Makipag-ugnayan sa IT Admin.')
      }

      saveAuthToken(result.token)
      window.location.replace(destination)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Hindi makapag-sign in. Subukan muli.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-500 selection:text-white">
      {/* Mobile/iPad Full Background Image with Soft Light Overlay */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center lg:hidden"
        style={{ backgroundImage: "url('/dyci_img/homepage7.jpg')" }}
      >
        <div className="absolute inset-0 bg-linear-to-b from-white/40 via-white/20 to-slate-900/30 backdrop-blur-[3px]" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Hero Image Section (Desktop Only) */}
        <section
          className="relative hidden min-h-107.5 overflow-hidden bg-cover bg-center lg:flex lg:min-h-screen"
          style={{ backgroundImage: "url('/dyci_img/homepage7.jpg')" }}
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

            {/* Headline at Gradient Colors */}
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-[3.2rem]">
              Welcome to your
              <span className="mt-1 block">
                <span className="bg-linear-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent">
                  modern asset{" "}
                </span>
                <span className="bg-linear-to-r from-sky-300 via-blue-200 to-indigo-200 bg-clip-text text-transparent">
                  command.
                </span>
              </span>
            </h1>

            {/* Subtitle Text */}
            <p className="mt-5 max-w-md text-sm font-medium leading-relaxed text-slate-200">
              Seamlessly manage school deployments, equipment tracking, and live audit logs in one unified platform—<strong className="font-extrabold text-white">ensuring campus readiness every day.</strong>
            </p>
          </div>
        </section>

        {/* Login Form Section */}
        <section className="relative flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:bg-white lg:px-16 xl:px-20">
          <a
            href="/"
            className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 text-[0.7rem] font-extrabold text-slate-800 shadow-sm backdrop-blur-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:left-8 sm:top-6 sm:px-4 sm:py-2 sm:text-xs lg:hidden"
          >
            <span aria-hidden="true" className="text-base leading-none">←</span>
            Back to Home
          </a>

          {/* Ultra-Responsive Frosted Glass Wrapper */}
          <div className="relative z-10 w-full max-w-85 rounded-3xl p-px bg-linear-to-b from-white/90 via-white/50 to-blue-400/30 shadow-2xl shadow-slate-950/15 sm:max-w-105 lg:max-w-100 lg:bg-none lg:p-0 lg:shadow-none">
            
            <div className="w-full rounded-3xl bg-white/85 p-5 backdrop-blur-xl transition-all sm:p-7 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">

              {/* Header Badge (Mobile/Tablet Only) */}
              <div className="mb-3 text-center lg:hidden">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/15 bg-blue-50/70 px-2.5 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-blue-700 shadow-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                  A.SSET Campus System
                </span>
              </div>

              {/* Logos */}
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

              <div className="mb-3.5 text-center sm:text-left sm:mb-5">
                <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl lg:text-2xl">
                  Sign in
                </h2>
                <p className="mt-0.5 text-[0.7rem] font-medium text-slate-600 sm:text-xs">
                  Sign in using your registered email account.
                </p>
              </div>

              <form className="space-y-3 sm:space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 sm:text-[0.68rem] lg:text-[0.7rem]"
                  >
                    DYCI Email Address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="yourname@example.com"
                    required
                    className="h-10 w-full rounded-xl border border-white/90 bg-white/70 px-3.5 text-xs font-medium text-slate-900 shadow-xs backdrop-blur-md outline-none transition duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-3 focus:ring-blue-500/15 sm:h-11 sm:px-4 sm:text-sm lg:h-12"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-700 sm:text-[0.68rem] lg:text-[0.7rem]"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    className="h-10 w-full rounded-xl border border-white/90 bg-white/70 px-3.5 text-xs font-medium text-slate-900 shadow-xs backdrop-blur-md outline-none transition duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-3 focus:ring-blue-500/15 sm:h-11 sm:px-4 sm:text-sm lg:h-12"
                  />
                </div>

                <div className="flex justify-end pt-0.5">
                  <a
                    href="/forgot-password"
                    className="text-[0.7rem] font-bold text-blue-600 transition hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:text-xs"
                  >
                    Forgot password?
                  </a>
                </div>

                {errorMessage && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {errorMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                  className="mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[0.7rem] font-black uppercase tracking-[0.14em] text-white shadow-md shadow-blue-600/25 transition duration-200 hover:bg-blue-500 hover:shadow-blue-600/35 active:scale-[0.98] focus:outline-none focus-visible:ring-3 focus-visible:ring-blue-500/25 sm:h-11 sm:text-xs lg:h-12"
                >
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                  <span aria-hidden="true" className="text-sm leading-none sm:text-base">→</span>
                </button>
              </form>

            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
