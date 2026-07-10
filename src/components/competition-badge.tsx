import Image from 'next/image'

export const COMPETITION_NAME = 'Aventolinks Scholars Challenge 2026'
export const COMPETITION_REGION = 'Oyo State'

type Props = {
  /** 'corner' floats in the top-right; 'inline' renders in place for use inside headers */
  variant?: 'corner' | 'inline'
  /** Optional dark or light background hint — the badge auto-picks contrast */
  tone?: 'dark' | 'light'
}

export default function CompetitionBadge({ variant = 'corner', tone = 'dark' }: Props) {
  const isLight = tone === 'light'
  const shell =
    variant === 'corner'
      ? `fixed top-2 right-2 z-40 flex items-center justify-center rounded-full p-0.5 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-1 ${
          isLight ? 'bg-white/70 ring-black/10' : 'bg-black/40 ring-white/15'
        }`
      : `inline-flex items-center justify-center rounded-full p-0.5 ${
          isLight ? 'bg-white/70 ring-1 ring-black/10' : 'bg-black/40 ring-1 ring-white/15'
        }`

  return (
    <div
      className={shell}
      aria-label={`${COMPETITION_NAME} — ${COMPETITION_REGION}`}
      title={`${COMPETITION_NAME} — ${COMPETITION_REGION}`}
    >
      <div className="relative w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/30 shrink-0 bg-white">
        <Image
          src="/aventolinks-logo.jpeg"
          alt="Aventolinks"
          fill
          sizes="24px"
          className="object-cover"
          priority
        />
      </div>
    </div>
  )
}
