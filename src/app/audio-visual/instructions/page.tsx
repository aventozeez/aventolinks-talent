import RoundInstructions from '@/components/round-instructions'

export default function AudioVisualInstructions() {
  return (
    <RoundInstructions
      emoji="📺"
      eyebrow="Grand Final · Two-Team Showdown"
      title="Audio Visual Round"
      tagline="Watch the video. Pick a themed pool. Race to answer before time runs out."
      gradient="from-[#001a2a] via-[#00253d] to-[#0a0a1f]"
      accent="#3b82f6"
      rules={[
        'Both finalists watch a 2-minute video together — everything they need is inside it.',
        'After the video, Team A chooses one of three themed pools. Team B will pick from the remaining two.',
        'Team A then has 60 seconds to answer as many questions from their pool as they can.',
        'Team B then picks their pool (different from Team A) and gets their own 60-second window.',
        'Semi-final scores carry forward — the AV round adds on top. Highest total wins the Grand Final.',
      ]}
      scoring={[
        { label: 'Correct answer',          value: '+10', tone: 'green' },
        { label: 'Wrong / skipped',         value: '0',   tone: 'slate' },
        { label: 'Time per team',           value: '60 s', tone: 'amber' },
        { label: 'Semi-final carry-over',   value: 'yes', tone: 'blue' },
      ]}
      hostAction={{
        label: 'Begin Audio Visual Round',
        href: '/audio-visual/admin',
      }}
      footerNote="A tie at the end triggers a sudden-death buzzer round on the unused pool."
    />
  )
}
