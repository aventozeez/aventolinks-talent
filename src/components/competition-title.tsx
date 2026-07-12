/**
 * Full competition title, always stacked on three lines:
 *   Aventolinks
 *   Scholars Challenge 2026
 *   Oyo State Edition
 *
 * The three lines share the same font weight but the middle line is the
 * headline (largest). Sizes scale with the `size` prop; caller can override
 * text colour via `className` on the wrapper.
 */
type Props = {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Optional highlight — the middle "Scholars Challenge 2026" line gets a gradient */
  gradient?: boolean
}

export const COMPETITION_LINE_1 = 'Aventolinks'
export const COMPETITION_LINE_2 = 'Scholars Challenge 2026'
export const COMPETITION_LINE_3 = 'Oyo State Edition'
export const COMPETITION_FULL_NAME = `${COMPETITION_LINE_1} ${COMPETITION_LINE_2} ${COMPETITION_LINE_3}`

const sizeMap: Record<NonNullable<Props['size']>, { top: string; mid: string; bot: string }> = {
  sm: { top: 'text-xs md:text-sm',    mid: 'text-lg md:text-xl',   bot: 'text-[10px] md:text-xs'  },
  md: { top: 'text-sm md:text-base',  mid: 'text-2xl md:text-3xl', bot: 'text-xs md:text-sm'     },
  lg: { top: 'text-base md:text-lg',  mid: 'text-4xl md:text-5xl', bot: 'text-sm md:text-base'   },
  xl: { top: 'text-lg md:text-xl',    mid: 'text-6xl md:text-8xl', bot: 'text-base md:text-lg'   },
}

export default function CompetitionTitle({ size = 'md', className = '', gradient = false }: Props) {
  const sizes = sizeMap[size]
  return (
    <div className={`flex flex-col items-center text-center leading-tight ${className}`}>
      <p className={`${sizes.top} font-black uppercase tracking-[0.35em] text-[#FFD700]`}>
        {COMPETITION_LINE_1}
      </p>
      <p
        className={`${sizes.mid} font-black leading-[1.05] mt-1 ${
          gradient
            ? 'bg-gradient-to-r from-[#FFD700] via-[#F5A623] to-[#FFD700] bg-clip-text text-transparent drop-shadow-[0_8px_24px_rgba(245,166,35,0.35)]'
            : 'text-white'
        }`}
      >
        {COMPETITION_LINE_2}
      </p>
      <p className={`${sizes.bot} font-black uppercase tracking-[0.4em] text-white/80 mt-1`}>
        {COMPETITION_LINE_3}
      </p>
    </div>
  )
}
