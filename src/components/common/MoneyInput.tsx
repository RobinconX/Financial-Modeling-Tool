import { useEffect, useState } from 'react'
import { cleanMoneyAmount, formatMoney, parseMoney } from '../../lib/format'

/** Clean number for text inputs — strips float noise (e.g. 399.99999999994 → 400). */
export function formatInputNumber(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value)) return ''
  const factor = 10 ** maxDecimals
  const rounded = Math.round(value * factor) / factor
  if (Object.is(rounded, -0)) return '0'
  // Avoid scientific notation for normal money ranges
  if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-6)) {
    return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '')
  }
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

type Props = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  hint?: string
  disabled?: boolean
  currency?: string
  /**
   * When true, parent is only updated on blur/Enter (recommended for share prices
   * that convert to market cap — avoids mid-keystroke float feedback loops).
   */
  commitOnBlur?: boolean
  /** Max decimal places when formatting the committed display value */
  displayDecimals?: number
}

export function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  disabled,
  currency = 'USD',
  commitOnBlur = false,
  displayDecimals = 6,
}: Props) {
  const [text, setText] = useState(() =>
    value == null ? '' : formatInputNumber(value, displayDecimals),
  )
  const [focused, setFocused] = useState(false)

  // Sync from parent only when not editing — prevents float noise from wiping keystrokes
  useEffect(() => {
    if (focused) return
    if (value == null) {
      setText('')
      return
    }
    setText(formatInputNumber(value, displayDecimals))
  }, [value, focused, displayDecimals])

  function commit(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) {
      onChange(null)
      setText('')
      return
    }
    const parsed = parseMoney(trimmed)
    if (parsed == null) {
      // Revert to last known good value
      setText(value == null ? '' : formatInputNumber(value, displayDecimals))
      return
    }
    const cleaned = cleanMoneyAmount(parsed) ?? parsed
    onChange(cleaned)
    setText(formatInputNumber(cleaned, displayDecimals))
  }

  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder ?? 'e.g. 50B or 50000000000'}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          if (commitOnBlur) return
          if (!raw.trim()) {
            onChange(null)
            return
          }
          // Allow intermediate strings like "3." or "1.5B" incomplete — only push valid parses
          const parsed = parseMoney(raw)
          if (parsed != null) onChange(parsed)
        }}
        onBlur={() => {
          setFocused(false)
          commit(text)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      {(hint || value != null) && (
        <p className="mt-1 text-[11px] text-white/35">
          {hint ?? (value != null ? `= ${formatMoney(value, currency)}` : null)}
        </p>
      )}
    </div>
  )
}

type NumberProps = {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  step?: string
  min?: number
  disabled?: boolean
}

export function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  step = 'any',
  min,
  disabled,
}: NumberProps) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type="number"
        step={step}
        min={min}
        disabled={disabled}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') {
            onChange(null)
            return
          }
          const n = Number(v)
          onChange(Number.isFinite(n) ? n : null)
        }}
      />
    </div>
  )
}
