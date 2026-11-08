type Props = {
  message: string
  className?: string
}

export function QuoteDataWarning({ message, className = '' }: Props) {
  return (
    <p
      className={`rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95 ${className}`}
      role="status"
    >
      {message}
    </p>
  )
}
