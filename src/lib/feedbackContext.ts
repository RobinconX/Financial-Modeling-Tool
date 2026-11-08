import type { AppTab } from '../types'
import { getAppBuildInfo } from './appBuildInfo'
import { summarizeUserAgent } from './parseUserAgent'

const TAB_LABELS: Record<AppTab, string> = {
  projections: 'Projections',
  portfolio: 'Portfolio',
  overview: 'Overview',
  history: 'History',
  'income-cost': 'Budget',
  savings: 'Savings',
  settings: 'Data & backup',
}

export type FeedbackType = 'bug' | 'idea'

export type FeedbackContextPayload = {
  packageVersion: string
  gitShaShort: string
  tab: string
  browser: string
  os: string
}

export function buildFeedbackContext(tab: AppTab, userAgent = navigator.userAgent): FeedbackContextPayload {
  const { packageVersion, gitShaShort } = getAppBuildInfo()
  const { browser, os } = summarizeUserAgent(userAgent)
  return {
    packageVersion,
    gitShaShort,
    tab: TAB_LABELS[tab],
    browser,
    os,
  }
}

export function formatFeedbackContextBlock(ctx: FeedbackContextPayload): string {
  return [
    `App version: ${ctx.packageVersion}`,
    `Build: ${ctx.gitShaShort}`,
    `Page: ${ctx.tab}`,
    `Browser: ${ctx.browser}`,
    `OS: ${ctx.os}`,
  ].join('\n')
}

export function feedbackEmailSubject(type: FeedbackType): string {
  return type === 'bug' ? '[FMT] Bug report' : '[FMT] Feature idea'
}
