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
      ? `fixed top-3 right-3 z-40 flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.35)] ring-1 ${
          isLight
            ? 'bg-white/70 ring-black/10'
            : 'bg-black/40 ring-white/15'
        }`
      : `inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-0.5 ${
          isLight ? 'bg-white/70 ring-1 ring-black/10' : 'bg-black/40 ring-1 ring-white/15'
        }`

  const titleColour = isLight ? 'text-slate-900' : 'text-white'
  const regionColour = isLight ? 'text-slate-500' : 'text-white/60'

  return (
    <div className={shell} aria-label={`${COMPETITION_NAME} — ${COMPETITION_REGION}`}>
      <div className="relative w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/30 shrink-0 bg-white">
        <Image
          src="/aventolinks-logo.jpeg"
          alt="Aventolinks"
          fill
          sizes="28px"
          className="object-cover"
          priority
        />
      </div>
      <div className="leading-tight">
        <p className={`text-[10px] md:text-[11px] font-black tracking-wide ${titleColour}`}>
          {COMPETITION_NAME}
        </p>
        <p className={`text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.2em] ${regionColour}`}>
          {COMPETITION_REGION}
        </p>
      </div>
    </div>
  )
}
