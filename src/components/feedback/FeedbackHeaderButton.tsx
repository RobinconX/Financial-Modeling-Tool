type Props = {
  onClick: () => void
}

export function FeedbackHeaderButton({ onClick }: Props) {
  return (
    <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClick}>
      Feedback
    </button>
  )
}
