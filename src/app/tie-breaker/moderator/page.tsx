'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import ModeratorOverlay from '@/components/moderator-overlay'

const CHANNEL = 'tie:state'
const TB_MS = 30_000

type TBQuestion = { id: string; text: string; answer: string }
type TBPool = { id: string; title: string; questions: TBQuestion[] }
type TBState = {
  phase: string
  teamA: string; teamB: string
  pools: TBPool[]
  chosenPoolA: string | null; chosenPoolB: string | null
  queueA: TBQuestion[]; queueB: TBQuestion[]
  currentQ: TBQuestion | null
  timerStart?: number | null
}

export default function TBModerator() {
  const [s, setS] = useState<TBState | null>(null)
  const [connected, setConnected] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, p => {
      setConnected(true)
      if (p) setS(p as TBState)
    })
    const tick = setInterval(() => setTick(t => t + 1), 250)
    return () => { unsub(); clearInterval(tick) }
  }, [])

  const expired = !!(s?.timerStart && Date.now() - s.timerStart >= TB_MS)

  let phaseLabel = 'Waiting for admin…'
  let currentQuestion: string | null = null
  let currentAnswer: string | null = null
  let nextQuestion: string | null = null
  let nextAnswer: string | null = null

  if (s) {
    const isA = s.phase === 'a_playing' || s.phase === 'announce_a' || s.phase === 'score_a'
    const queue = s.phase === 'a_playing' ? s.queueA : s.phase === 'b_playing' ? s.queueB : []
    const pool = isA ? s.pools?.find(p => p.id === s.chosenPoolA) : s.pools?.find(p => p.id === s.chosenPoolB)
    const q = s.currentQ ?? queue[0]
    const nq = queue[s.currentQ ? 0 : 1]

    phaseLabel =
      s.phase === 'a_playing' ? `${s.teamA} playing`
      : s.phase === 'b_playing' ? `${s.teamB} playing`
      : s.phase === 'announce_a' ? `${s.teamA} — up next`
      : s.phase === 'announce_b' ? `${s.teamB} — up next`
      : s.phase === 'score_a' ? `${s.teamA} score`
      : s.phase === 'score_b' ? `${s.teamB} score`
      : s.phase === 'compare' ? 'Head-to-head'
      : s.phase === 'intro' ? 'Instructions'
      : s.phase === 'setup' ? 'Setup'
      : s.phase

    const playing = s.phase === 'a_playing' || s.phase === 'b_playing'
    if (playing && expired) {
      phaseLabel = "Time's up — waiting for admin to advance"
    } else if (playing && q) {
      currentQuestion = pool ? `${pool.title}: ${q.text}` : q.text
      currentAnswer = q.answer
      if (nq && nq.id !== q.id) {
        nextQuestion = nq.text
        nextAnswer = nq.answer
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src="/tie-breaker/audience"
        className="absolute inset-0 w-full h-full border-0"
        title="Tie-breaker audience view (moderator mirror)"
      />
      <ModeratorOverlay
        round="Tie Breaker" roundEmoji="⚖️" phaseLabel={phaseLabel}
        currentQuestion={currentQuestion} currentAnswer={currentAnswer}
        nextQuestion={nextQuestion} nextAnswer={nextAnswer}
        connected={connected}
      />
    </div>
  )
}
