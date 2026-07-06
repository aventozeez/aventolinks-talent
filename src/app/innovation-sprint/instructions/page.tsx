import RoundInstructions from '@/components/round-instructions'

export default function InnovationSprintInstructions() {
  return (
    <RoundInstructions
      emoji="💡"
      eyebrow="Round 3 · Final Scholars Challenge"
      title="Innovation Sprint"
      tagline="Two real-world problems. Five steps each. Sixty seconds to arrange them into a working solution."
      gradient="from-[#001a1a] via-[#003030] to-[#0a0a1f]"
      accent="#22d3ee"
      rules={[
        'The quiz master presents a real-world problem alongside five jumbled solution steps.',
        'Each team has 60 seconds to arrange the five steps into the correct order.',
        'Two problems in total — teams alternate who solves first, both problems scored independently.',
        'Every step placed in the correct position scores points.',
        'Getting all five steps right earns a bonus on top of the per-step points.',
      ]}
      scoring={[
        { label: 'Per correct step',            value: '+10', tone: 'green' },
        { label: 'All 5 steps correct (bonus)', value: '+20', tone: 'blue' },
        { label: 'Max per problem',             value: '70',  tone: 'amber' },
        { label: 'Time per problem',            value: '60 s', tone: 'slate' },
      ]}
      hostAction={{
        label: 'Begin Innovation Sprint',
        href: '/final-scholars-challenge/admin',
      }}
      footerNote="Highest cumulative score across both problems wins the round."
    />
  )
}
