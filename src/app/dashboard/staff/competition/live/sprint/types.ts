// Shared types & constants for Innovation Sprint
// Imported by: page.tsx (admin), display/page.tsx, play/page.tsx

export const SP_CHANNEL = 'sc_sp_live_v1'

export type SpPhase = 'setup' | 'playing' | 'reveal' | 'done'

export type SpLiveState = {
  phase: SpPhase
  teamAName: string
  teamBName: string
  scoreA: number           // cumulative sprint score across all problems
  scoreB: number
  problemTitle: string
  problemStatement: string
  stepsDisplay: string[]   // shuffled steps (what participants drag)
  stepsCorrect: string[]   // correct order — only populated in 'reveal' phase, else []
  timerStartedAt: number | null
  timerDuration: number    // always 30000
  teamASubmitted: boolean
  teamBSubmitted: boolean
  teamAAnswer: string[] | null
  teamBAnswer: string[] | null
  teamAStepScore: number | null
  teamBStepScore: number | null
  teamASpeedBonus: number | null
  teamBSpeedBonus: number | null
  teamASubmittedAt: number | null
  teamBSubmittedAt: number | null
}
