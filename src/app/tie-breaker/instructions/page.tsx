import RoundInstructions from '@/components/round-instructions'
import { ROUND_INFO } from '@/lib/round-info'

export default function TieBreakerInstructions() {
  const info = ROUND_INFO.tie_breaker
  return (
    <RoundInstructions
      emoji={info.emoji}
      eyebrow={info.eyebrow}
      title={info.title}
      tagline={info.tagline}
      gradient={info.gradient}
      accent={info.accent}
      rules={info.rules}
      scoring={info.scoring}
      hostAction={{
        label: 'Begin Tie Breaker',
        href: info.hostHref,
      }}
      footerNote={info.footerNote}
    />
  )
}
