import { useEffect, useId, useState, type FormEvent } from 'react'
import type { AppTab } from '../../types'
import { buildFeedbackContext } from '../../lib/feedbackContext'
import { isFeedbackFormConfigured, submitFeedbackReport } from '../../lib/feedbackSubmit'
import type { FeedbackType } from '../../lib/feedbackContext'
import {
  formatCooldownWait,
  readFeedbackRateStatus,
  recordFeedbackSent,
  type FeedbackRateStatus,
} from '../../lib/feedbackRateLimit'
import { FeatureGuideButton } from '../guides/FeatureGuideButton'

type Props = {
  tab: AppTab
  onClose: () => void
}

type Phase = 'form' | 'success' | 'error'

export function FeedbackDialog({ tab, onClose }: Props) {
  const titleId = useId()
  const [type, setType] = useState<FeedbackType>('bug')
  const [description, setDescription] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rateStatus, setRateStatus] = useState<FeedbackRateStatus>(() => readFeedbackRateStatus())

  const configured = isFeedbackFormConfigured()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const context = buildFeedbackContext(tab)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    const rate = readFeedbackRateStatus()
    setRateStatus(rate)
    if (!rate.allowed) {
      if (rate.reason === 'cooldown') {
        setErrorMessage(`Please wait ${formatCooldownWait(rate.waitMs)} before sending again.`)
      } else {
        setErrorMessage('Daily feedback limit reached. Try again tomorrow.')
      }
      setPhase('error')
      return
    }

    setBusy(true)
    const result = await submitFeedbackReport({
      type,
      description,
      context,
      honeypot,
    })
    setBusy(false)

    if (result.ok) {
      recordFeedbackSent()
      setRateStatus(readFeedbackRateStatus())
      setPhase('success')
      return
    }

    setErrorMessage(result.message)
    setPhase('error')
  }

  const rateBlocked = !rateStatus.allowed
  const submitDisabled = !configured || busy || rateBlocked

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg space-y-4 p-5 shadow-2xl"
        data-guide-anchor="settings.feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-white">
              {phase === 'success' ? 'Thanks — we got it' : 'Send feedback'}
            </h3>
            <p className="mt-0.5 text-xs text-white/45">
              Anonymous · no name or email · relayed to the maintainers
            </p>
          </div>
          <FeatureGuideButton id="settings.feedback" />
        </div>

        {phase === 'success' ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
              Thank you — your {type === 'bug' ? 'report' : 'idea'} is in. We will take it from here.
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : phase === 'error' ? (
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100/90">
              {errorMessage ?? 'Something went wrong.'}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClose}>
                Close
              </button>
              {configured && rateStatus.allowed ? (
                <button
                  type="button"
                  className="btn-primary !py-1.5 !text-xs"
                  onClick={() => {
                    setPhase('form')
                    setErrorMessage(null)
                  }}
                >
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            {!configured ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/85">
                Feedback is not enabled in this build. Set{' '}
                <code className="text-emerald-300/90">VITE_FEEDBACK_FORM_ACCESS_KEY</code> for local dev (
                <code className="text-emerald-300/90">.env.local</code>) — Pages builds use the workflow default.
                See <code className="text-emerald-300/90">docs/GITHUB_PAGES.md</code>.
              </p>
            ) : null}

            {rateBlocked && configured ? (
              <p className="text-xs text-amber-200/80">
                {rateStatus.reason === 'cooldown'
                  ? `Cooldown active — wait ${formatCooldownWait(rateStatus.waitMs)}.`
                  : 'Daily limit reached (10). Try again tomorrow.'}
              </p>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-white/70">Type</legend>
              <div className="flex gap-2">
                {(
                  [
                    ['bug', 'Bug'],
                    ['idea', 'Idea'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      type === value
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80'
                    }`}
                    aria-pressed={type === value}
                    onClick={() => setType(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-white/70">Description</span>
              <textarea
                className="input min-h-[120px] w-full resize-y text-sm"
                required
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? 'What happened? What did you expect?'
                    : 'What would help, and where in the app?'
                }
              />
            </label>

            <div className="rounded-lg border border-white/8 bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-white/40">
              <p className="mb-1 font-medium text-white/50">Included automatically (not personal)</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>
                  Version {context.packageVersion} · build {context.gitShaShort}
                </li>
                <li>Page: {context.tab}</li>
                <li>
                  {context.browser} on {context.os}
                </li>
              </ul>
            </div>

            <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
              <span>Leave blank</span>
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                className="btn-primary !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
