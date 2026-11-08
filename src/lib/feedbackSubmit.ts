import {
  feedbackEmailSubject,
  formatFeedbackContextBlock,
  type FeedbackContextPayload,
  type FeedbackType,
} from './feedbackContext'

export function getFeedbackFormAccessKey(): string | null {
  const raw = import.meta.env.VITE_FEEDBACK_FORM_ACCESS_KEY
  if (typeof raw !== 'string') return null
  const key = raw.trim()
  return key.length > 0 ? key : null
}

export function isFeedbackFormConfigured(): boolean {
  return getFeedbackFormAccessKey() !== null
}

export type FeedbackSubmitResult =
  | { ok: true }
  | { ok: false; kind: 'not_configured' | 'network' | 'rejected'; message: string }

export async function submitFeedbackReport(
  input: {
    type: FeedbackType
    description: string
    context: FeedbackContextPayload
    honeypot: string
  },
  fetchFn: typeof fetch = fetch,
): Promise<FeedbackSubmitResult> {
  if (input.honeypot.trim()) {
    return { ok: true }
  }

  const accessKey = getFeedbackFormAccessKey()
  if (!accessKey) {
    return {
      ok: false,
      kind: 'not_configured',
      message: 'Feedback is not configured on this build.',
    }
  }

  const description = input.description.trim()
  if (!description) {
    return { ok: false, kind: 'rejected', message: 'Please describe the bug or idea.' }
  }

  const contextBlock = formatFeedbackContextBlock(input.context)
  const bodyMessage = `${description}\n\n---\nAutomatic context (not personal):\n${contextBlock}`

  let res: Response
  try {
    res = await fetchFn('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        subject: feedbackEmailSubject(input.type),
        from_name: 'FMT App',
        type: input.type,
        message: bodyMessage,
        botcheck: '',
      }),
    })
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Could not reach the feedback service. Check your connection and try again.',
    }
  }

  let data: { success?: boolean; message?: string }
  try {
    data = (await res.json()) as { success?: boolean; message?: string }
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Unexpected response from the feedback service.',
    }
  }

  if (!res.ok || !data.success) {
    const detail = data.message?.trim()
    return {
      ok: false,
      kind: 'rejected',
      message: detail || 'The feedback service could not accept this submission.',
    }
  }

  return { ok: true }
}
