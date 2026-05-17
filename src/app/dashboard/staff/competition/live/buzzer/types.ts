// Shared types & constants for Buzzer Round
// Imported by: page.tsx (admin), display/page.tsx, buzz/page.tsx

export const BZ_CHANNEL = 'sc_bz_live_v1'

export type BzPhase = 'setup' | 'ready' | 'open' | 'buzzed' | 'bonus' | 'done'

export type BzLiveState = {
  phase: BzPhase
  teamAName: string
  teamBName: string
  scoreA: number
  scoreB: number
  questionText: string
  questionSubject: string
  questionIndex: number
  totalQuestions: number
  buzzedTeam: 'a' | 'b' | null
  bonusTeam: 'a' | 'b' | null
  buzzStartedAt: number | null   // epoch ms — all clients calc countdown from this
  timerDuration: number          // always 10000
}
