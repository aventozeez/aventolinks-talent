import RoundInstructions from '@/components/round-instructions'

export default function RapidFireInstructions() {
  return (
    <RoundInstructions
      emoji="⚡"
      eyebrow="Round 1 · Final Scholars Challenge"
      title="Rapid Fire"
      tagline="Sixty seconds. Ten questions. Answer as many as you can before the buzzer."
      gradient="from-[#1a0f00] via-[#2a1500] to-[#0a0a1f]"
      accent="#f5a623"
      rules={[
        'Each team gets its own 60-second window — Team A plays first, then Team B.',
        'Ten questions are queued in a random order for each team.',
        'The quiz master reads each question aloud; the team calls out the answer.',
        'Correct answers score points instantly. Wrong or skipped questions are set aside — no penalty.',
        'When the 60 seconds ends the round is over, even if questions remain in the queue.',
      ]}
      scoring={[
        { label: 'Correct answer', value: '+10', tone: 'green' },
        { label: 'Wrong / skipped', value: '0', tone: 'slate' },
        { label: 'Time per team',   value: '60 s', tone: 'amber' },
      ]}
      hostAction={{
        label: 'Begin Rapid Fire',
        href: '/final-scholars-challenge/admin',
      }}
      footerNote="Highest total after both teams have played moves on. Ties break in the next round."
    />
  )
}
