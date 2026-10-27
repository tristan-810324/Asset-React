import { useEffect, useState, type FormEvent } from 'react'
import {
  clearPendingEmailVerification,
  dashboardPathForRoles,
  getPendingEmailVerification,
  resendEmailVerificationOtp,
  saveAuthToken,
  savePendingEmailVerification,
  verifyEmailOtp,
} from './authApi'

export default function VerifyEmailOtp() {
  const [pending, setPending] = useState(getPendingEmailVerification)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(60)

  useEffect(() => {
    if (!pending) window.location.replace('/login')
  }, [pending])

  useEffect(() => {
    if (!pending || resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [pending, resendSeconds])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pending || isSubmitting || isResending) return

    setErrorMessage('')
    setNoticeMessage('')
    setIsSubmitting(true)
    const formData = new FormData(event.currentTarget)
    const otp = String(formData.get('otp') || '').trim()

    try {
      const result = await verifyEmailOtp(pending.challengeId, otp)
      const destination = dashboardPathForRoles(result.user.roles)
      if (!destination) throw new Error('This account does not have a dashboard role. Please contact the IT Admin.')

      clearPendingEmailVerification()
      if (pending.flow === 'registration') {
        window.location.replace('/login#verified')
        return
      }

      saveAuthToken(result.token)
      window.location.replace(destination)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'We could not verify your email. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!pending || isSubmitting || isResending || resendSeconds > 0) return

    setErrorMessage('')
    setNoticeMessage('')
    setIsResending(true)

    try {
      const result = await resendEmailVerificationOtp(pending.challengeId)
      if ('alreadyVerified' in result) {
        clearPendingEmailVerification()
        window.location.replace('/login')
        return
      }

      const updatedPending = { ...pending, ...result }
      savePendingEmailVerification(updatedPending)
      setPending(updatedPending)
      setResendSeconds(60)
      setNoticeMessage(result.message || 'A new verification code has been sent to your email.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to resend the code. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <main className="relative min-h-screen font-['Plus_Jakarta_Sans'] text-slate-900 selection:bg-blue-500 selection:text-white">
      <div className="fixed inset-0 z-0 bg-cover bg-center lg:hidden" style={{ backgroundImage: "url('/dyci_img/homepage2.jpg')" }}>
        <div className="absolute inset-0 bg-linear-to-b from-white/40 via-white/20 to-slate-900/30 backdrop-blur-[3px]" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        <section
          className="relative hidden min-h-107.5 overflow-hidden bg-cover bg-center lg:flex lg:min-h-screen"
          style={{ backgroundImage: "url('/dyci_img/homepage2.jpg')" }}
          aria-label="Dr. Yanga's Colleges campus"
        >
          <div className="absolute inset-0 bg-slate-950/60" />
          <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/30 to-slate-950/10" />
          <a href="/" className="absolute left-7 top-7 z-10 inline-flex items-center gap-2 rounded-full bg-slate-950/60 px-4 py-2.5 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-slate-950/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
            <span aria-hidden="true" className="text-lg leading-none">←</span>
            Back to Home
          </a>

          <div className="relative z-10 mt-auto max-w-xl px-8 pb-12 xl:px-12 xl:pb-14">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/50 px-3.5 py-1.5 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-blue-200 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              DR. YANGA&apos;S COLLEGES, INC.
            </div>
            <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-[3.2rem]">
              One more step to
              <span className="mt-1 block bg-linear-to-r from-amber-300 via-amber-400 to-sky-200 bg-clip-text text-transparent">
                secure your account.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-sm font-medium leading-relaxed text-slate-200">
              Enter the verification code sent to your email to continue securely.
            </p>
          </div>
        </section>

        <section className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:bg-white lg:px-16 xl:px-20">
          <a href="/login" className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 text-[0.7rem] font-extrabold text-slate-800 shadow-sm backdrop-blur-md transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:left-8 sm:top-6 sm:px-4 sm:py-2 sm:text-xs lg:hidden">
            <span aria-hidden="true" className="text-base leading-none">←</span>
            Back to sign in
          </a>

          <div className="relative z-10 w-full max-w-85 rounded-3xl bg-white/85 p-5 shadow-2xl shadow-slate-950/15 backdrop-blur-xl sm:max-w-105 sm:p-7 lg:max-w-100 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
            <div className="mb-3 text-center lg:hidden">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/15 bg-blue-50/70 px-2.5 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-blue-700 shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                A.SSET Campus System
              </span>
            </div>

            <div className="mb-4 flex items-center justify-center gap-2.5 sm:mb-5 sm:gap-3.5">
              <img src="/dyci_img/A.sset.webp" alt="A.SSET logo" className="h-10 w-10 object-contain transition-transform hover:scale-105 sm:h-13 sm:w-13 lg:h-16 lg:w-16" />
              <div className="h-6 w-px bg-slate-300/80 sm:h-8" />
              <img src="/dyci_img/dyci-logo.webp" alt="Dr. Yanga's Colleges logo" className="h-9 w-9 object-contain transition-transform hover:scale-105 sm:h-11 sm:w-11 lg:h-14 lg:w-14" />
            </div>

            <div className="mb-5 text-center sm:text-left">
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">Verify your email</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                This is the first sign-in for <span className="font-bold text-slate-800">{pending?.email || 'your account'}</span>. Enter the 6-digit code sent to your email. This email only needs to be verified once.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="verification-otp" className="mb-1 block text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-700">Verification code</label>
                <input
                  id="verification-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-center shadow-sm shadow-slate-900/5 text-lg font-bold tracking-[0.5em] outline-none transition placeholder:tracking-[0.5em] placeholder:text-slate-400 hover:border-blue-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/15"
                />
              </div>

              {errorMessage && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{errorMessage}</p>}
              {noticeMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{noticeMessage}</p>}

              <button type="submit" disabled={isSubmitting || isResending || !pending} aria-busy={isSubmitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 sm:h-12">
                {isSubmitting ? 'Verifying...' : 'Verify and continue'}
                <span aria-hidden="true">→</span>
              </button>
            </form>

            <div className="mt-5 border-t border-slate-200/70 pt-4 text-center">
              <p className="text-xs font-semibold text-slate-600">Didn&apos;t receive or find the code?</p>
              <button type="button" onClick={handleResend} disabled={!pending || isSubmitting || isResending || resendSeconds > 0} aria-busy={isResending} className="mt-2 text-xs font-extrabold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400">
                {isResending ? 'Sending new code…' : resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
              </button>
              <a href="/login" className="mt-3 block text-xs font-extrabold text-blue-600 hover:underline">Back to sign in</a>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
