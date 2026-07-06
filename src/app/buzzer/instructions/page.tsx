import RoundInstructions from '@/components/round-instructions'

export default function BuzzerInstructions() {
  return (
    <RoundInstructions
      emoji="🔔"
      eyebrow="Round 2 · Final Scholars Challenge"
      title="Buzzer Round"
      tagline="Both teams hear every question. Fastest finger wins the chance to answer."
      gradient="from-[#0a0a1f] via-[#1a1035] to-[#0a0a1f]"
      accent="#8b5cf6"
      rules={[
        'The quiz master reads a question aloud to both teams at once.',
        'Either team may buzz in at any time — even before the question ends.',
        'The team that buzzes first has 10 seconds to give a final answer.',
        'If they answer correctly, they score. If they get it wrong, the opposing team is offered a second chance.',
        'Ten questions in total — winners are decided on cumulative score.',
      ]}
      scoring={[
        { label: 'Correct on first buzz',      value: '+10', tone: 'green' },
        { label: 'Wrong on first buzz',        value: '−5',  tone: 'red' },
        { label: 'Second-chance correct',      value: '+5',  tone: 'blue' },
        { label: 'Time after buzz',            value: '10 s', tone: 'amber' },
      ]}
      hostAction={{
        label: 'Begin Buzzer Round',
        href: '/final-scholars-challenge/admin',
      }}
      footerNote="No penalty for staying silent. But a wrong buzz costs you and hands the opponent a free shot."
    />
  )
}
