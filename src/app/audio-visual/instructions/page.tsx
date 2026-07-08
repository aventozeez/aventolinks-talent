import RoundInstructions from '@/components/round-instructions'
import { ROUND_INFO } from '@/lib/round-info'

export default function AudioVisualInstructions() {
  const info = ROUND_INFO.audio_visual
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
        label: 'Begin Audio Visual Round',
        href: info.hostHref,
      }}
      footerNote={info.footerNote}
    />
  )
}
