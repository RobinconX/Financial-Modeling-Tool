import type { ReactNode } from 'react'
import type { DeleteUsage } from '../../lib/deleteUsage'

type Props = {
  children?: ReactNode
  usage: DeleteUsage
  idleDetail?: string
  usageLead?: string
  consequence?: string
}

export function DeleteUsageBody({
  children,
  usage,
  idleDetail = 'This cannot be undone.',
  usageLead = 'Still referenced elsewhere:',
  consequence,
}: Props) {
  const hasRefs = usage.refs.length > 0
  return (
    <>
      {children}
      {!hasRefs ? (
        <p>{idleDetail}</p>
      ) : (
        <>
          <p>{usageLead}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-white/80">
            {usage.refs.map((r, i) => (
              <li key={`${r.where}-${r.detail}-${i}`}>
                {r.where}
                <span className="text-white/45"> · {r.detail}</span>
              </li>
            ))}
          </ul>
          {consequence ? <p>{consequence}</p> : null}
        </>
      )}
    </>
  )
}
