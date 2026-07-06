import RoundInstructions from '@/components/round-instructions'

export default function MysteryChainInstructions() {
  return (
    <RoundInstructions
      emoji="🕵️"
      eyebrow="Semi-Final · Three-Team Mystery"
      title="Mystery Chain"
      tagline="A story begins. Solve the puzzles to unlock what happened next."
      gradient="from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f]"
      accent="#ec4899"
      rules={[
        'The quiz master reads an opening story to all three teams — the same mystery for everyone.',
        'Each team is then given its own pool of puzzles that reveal different parts of the story.',
        'Teams take turns: 60 seconds to answer as many puzzles from their pool as they can, in order.',
        'Every correct answer scores points AND unlocks the next fragment of the story on the audience screen.',
        'The round ends after every team has played once — the highest-scoring team advances to the Grand Final.',
      ]}
      scoring={[
        { label: 'Correct puzzle',    value: '+10', tone: 'green' },
        { label: 'Wrong / skipped',   value: '0',   tone: 'slate' },
        { label: 'Time per team',     value: '60 s', tone: 'amber' },
        { label: 'Puzzles per team',  value: 'up to 10', tone: 'blue' },
      ]}
      hostAction={{
        label: 'Begin Mystery Chain',
        href: '/mystery-chain/admin',
      }}
      footerNote="Wrong answers don't cost points, but they leave that fragment of the story locked."
    />
  )
}
