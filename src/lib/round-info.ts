export type ScoringLine = {
  label: string
  value: string
  tone?: 'green' | 'red' | 'amber' | 'blue' | 'slate'
}

export type RoundInfo = {
  key: 'rapid_fire' | 'buzzer' | 'innovation_sprint' | 'mystery_chain' | 'audio_visual' | 'tie_breaker'
  emoji: string
  eyebrow: string
  title: string
  tagline: string
  gradient: string
  accent: string
  rules: string[]
  scoring: ScoringLine[]
  hostHref: string
  footerNote?: string
}

export const ROUND_INFO: Record<RoundInfo['key'], RoundInfo> = {
  rapid_fire: {
    key: 'rapid_fire',
    emoji: '⚡',
    eyebrow: 'Round 1 · Final Scholars Challenge',
    title: 'Rapid Fire',
    tagline: 'Sixty seconds. Ten questions. Answer as many as you can before the buzzer.',
    gradient: 'from-[#1a0f00] via-[#2a1500] to-[#0a0a1f]',
    accent: '#f5a623',
    rules: [
      'Each team gets its own 60-second window — Team A plays first, then Team B.',
      'Ten questions are queued in a random order for each team.',
      'The quiz master reads each question aloud; the team calls out the answer.',
      'Correct answers score points instantly. Wrong or skipped questions are set aside — no penalty.',
      'When the 60 seconds ends the round is over, even if questions remain in the queue.',
    ],
    scoring: [
      { label: 'Correct answer', value: '+10', tone: 'green' },
      { label: 'Wrong / skipped', value: '0', tone: 'slate' },
      { label: 'Time per team',   value: '60 s', tone: 'amber' },
    ],
    hostHref: '/final-scholars-challenge/admin',
    footerNote: 'Highest total after both teams have played moves on. Ties break in the next round.',
  },

  buzzer: {
    key: 'buzzer',
    emoji: '🔔',
    eyebrow: 'Round 2 · Final Scholars Challenge',
    title: 'Buzzer Round',
    tagline: 'Both teams hear every question. Fastest finger wins the chance to answer.',
    gradient: 'from-[#0a0a1f] via-[#1a1035] to-[#0a0a1f]',
    accent: '#8b5cf6',
    rules: [
      'The quiz master reads a question aloud to both teams at once.',
      'Either team may buzz in at any time — even before the question ends.',
      'The team that buzzes first has 10 seconds to give a final answer.',
      'If they answer correctly, they score. If they get it wrong, the opposing team is offered a second chance.',
      'Ten questions in total — winners are decided on cumulative score.',
    ],
    scoring: [
      { label: 'Correct on first buzz', value: '+10', tone: 'green' },
      { label: 'Wrong on first buzz',   value: '−5',  tone: 'red' },
      { label: 'Second-chance correct', value: '+5',  tone: 'blue' },
      { label: 'Time after buzz',       value: '10 s', tone: 'amber' },
    ],
    hostHref: '/final-scholars-challenge/admin',
    footerNote: 'No penalty for staying silent. But a wrong buzz costs you and hands the opponent a free shot.',
  },

  innovation_sprint: {
    key: 'innovation_sprint',
    emoji: '💡',
    eyebrow: 'Round 3 · Final Scholars Challenge',
    title: 'Innovation Sprint',
    tagline: 'Two real-world problems. Five steps each. Sixty seconds to arrange them into a working solution.',
    gradient: 'from-[#001a1a] via-[#003030] to-[#0a0a1f]',
    accent: '#22d3ee',
    rules: [
      'The quiz master presents a real-world problem alongside five jumbled solution steps.',
      'Each team has 60 seconds to arrange the five steps into the correct order.',
      'Two problems in total — teams alternate who solves first, both problems scored independently.',
      'Every step placed in the correct position scores points.',
      'Getting all five steps right earns a bonus on top of the per-step points.',
    ],
    scoring: [
      { label: 'Per correct step',            value: '+10', tone: 'green' },
      { label: 'All 5 steps correct (bonus)', value: '+20', tone: 'blue' },
      { label: 'Max per problem',             value: '70',  tone: 'amber' },
      { label: 'Time per problem',            value: '60 s', tone: 'slate' },
    ],
    hostHref: '/final-scholars-challenge/admin',
    footerNote: 'Highest cumulative score across both problems wins the round.',
  },

  mystery_chain: {
    key: 'mystery_chain',
    emoji: '🕵️',
    eyebrow: 'Semi-Final · Three-Team Mystery',
    title: 'Mystery Chain',
    tagline: 'A story begins. Solve the puzzles to unlock what happened next.',
    gradient: 'from-[#1a0a2a] via-[#2a0a1f] to-[#0a0a1f]',
    accent: '#ec4899',
    rules: [
      'The quiz master reads an opening story to all three teams — the same mystery for everyone.',
      'Each team is then given its own pool of puzzles that reveal different parts of the story.',
      'Teams take turns: 60 seconds to answer as many puzzles from their pool as they can, in order.',
      'Every correct answer scores points AND unlocks the next fragment of the story on the audience screen.',
      'The round ends after every team has played once — the highest-scoring team advances to the Grand Final.',
    ],
    scoring: [
      { label: 'Correct puzzle',    value: '+10', tone: 'green' },
      { label: 'Wrong / skipped',   value: '0',   tone: 'slate' },
      { label: 'Time per team',     value: '60 s', tone: 'amber' },
      { label: 'Puzzles per team',  value: 'up to 10', tone: 'blue' },
    ],
    hostHref: '/mystery-chain/admin',
    footerNote: 'Wrong answers don\'t cost points, but they leave that fragment of the story locked.',
  },

  tie_breaker: {
    key: 'tie_breaker',
    emoji: '🔔',
    eyebrow: 'Tie Breaker · Sudden Death',
    title: 'Tie Breaker',
    tagline: 'Thirty seconds each. Different pool per team. Highest score walks on.',
    gradient: 'from-[#1a0a1f] via-[#2a0a15] to-[#0a0a1f]',
    accent: '#ec4899',
    rules: [
      'The host has already picked a different pool for each team — 20 questions per pool.',
      'The team going first has 30 seconds to answer as many questions from their pool as they can.',
      'The quiz master reads each question aloud; the team calls out the answer.',
      'Correct answers score points. Wrong or skipped questions are put to the back of the queue — no penalty.',
      'When the 30 seconds ends the team\'s turn is over. The second team then plays their own pool.',
    ],
    scoring: [
      { label: 'Correct answer',   value: '+1', tone: 'green' },
      { label: 'Wrong / skipped',  value: '0',  tone: 'slate' },
      { label: 'Time per team',    value: '30 s', tone: 'amber' },
      { label: 'Questions in pool', value: '20', tone: 'blue' },
    ],
    hostHref: '/tie-breaker/admin',
    footerNote: 'The team with the higher score advances. If it\'s still a tie, we run it again on fresh pools.',
  },

  audio_visual: {
    key: 'audio_visual',
    emoji: '📺',
    eyebrow: 'Grand Final · Two-Team Showdown',
    title: 'Audio Visual Round',
    tagline: 'Watch the video clip. Pick a themed pool. Race to answer before time runs out.',
    gradient: 'from-[#001a2a] via-[#00253d] to-[#0a0a1f]',
    accent: '#3b82f6',
    rules: [
      'Both finalists watch a short video clip together — everything they need is inside it.',
      'After the video, Team A chooses one of three themed pools. Team B will pick from the remaining two.',
      'Team A then has 60 seconds to answer as many questions from their pool as they can.',
      'Team B then picks their pool (different from Team A) and gets their own 60-second window.',
      'Semi-final scores carry forward — the AV round adds on top. Highest total wins the Grand Final.',
    ],
    scoring: [
      { label: 'Correct answer',        value: '+10', tone: 'green' },
      { label: 'Wrong / skipped',       value: '0',   tone: 'slate' },
      { label: 'Time per team',         value: '60 s', tone: 'amber' },
      { label: 'Semi-final carry-over', value: 'yes', tone: 'blue' },
    ],
    hostHref: '/audio-visual/admin',
    footerNote: 'A tie at the end triggers a sudden-death buzzer round on the unused pool.',
  },
}
