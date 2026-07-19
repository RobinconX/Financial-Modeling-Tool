import type { AnalysisMode } from '../types'

type Props = {
  mode: AnalysisMode
  onChange: (mode: AnalysisMode) => void
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
      {(
        [
          { id: 'easy', label: 'Easy' },
          { id: 'advanced', label: 'Advanced' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            mode === opt.id
              ? 'bg-emerald-500 text-black shadow'
              : 'text-white/60 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
