'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import ModeratorOverlay from '@/components/moderator-overlay'

const CHANNEL = 'av:state'
const AV_MS = 60_000

type AVQuestion = { id: string; text: string; answer: string; revealed: boolean; answeredBy: 'A' | 'B' | null }
type AVPool = { id: string; title: string; questions: AVQuestion[] }
type AVState = {
  phase: string
  teamA: string; teamB: string
  pools: AVPool[]
  chosenPoolA: string | null; chosenPoolB: string | null
  queueA: AVQuestion[]; queueB: AVQuestion[]
  correctA: number; correctB: number
  timerStart?: number | null
  tieQuestions?: AVQuestion[]
  tieCurrentIdx?: number
  tieBuzzedBy?: 'A' | 'B' | null
}

export default function AVModerator() {
  const [s, setS] = useState<AVState | null>(null)
  const [connected, setConnected] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, p => {
      setConnected(true)
      if (p) setS(p as AVState)
    })
    const tick = setInterval(() => setTick(t => t + 1), 250)
    return () => { unsub(); clearInterval(tick) }
  }, [])

  const expired = !!(s?.timerStart && Date.now() - s.timerStart >= AV_MS)

  let phaseLabel = 'Waiting for admin…'
  let currentQuestion: string | null = null
  let currentAnswer: string | null = null
  let nextQuestion: string | null = null
  let nextAnswer: string | null = null

  if (s) {
    const isA = s.phase === 'qa_a'
    const isB = s.phase === 'qa_b'
    const queue = isA ? s.queueA : s.queueB
    const pool = isA ? s.pools?.find(p => p.id === s.chosenPoolA) : s.pools?.find(p => p.id === s.chosenPoolB)
    const q = queue?.[0], nq = queue?.[1]
    const correct = isA ? s.correctA : s.correctB

    phaseLabel =
      s.phase === 'watching' ? 'Video playing'
      : s.phase === 'qa_a' ? `${s.teamA} answering`
      : s.phase === 'qa_b' ? `${s.teamB} answering`
      : s.phase === 'pick_pool_a' ? `${s.teamA} picking`
      : s.phase === 'pick_pool_b' ? `${s.teamB} picking`
      : s.phase === 'score_a' ? `${s.teamA} score`
      : s.phase === 'score_b' ? `${s.teamB} score`
      : s.phase === 'compare_av' ? 'AV compare'
      : s.phase === 'compare_total' ? 'Cumulative compare'
      : s.phase === 'tie_break' ? 'Tie-break'
      : s.phase === 'done' ? 'Round done'
      : s.phase

    if ((isA || isB) && q) {
      currentQuestion = `Q${correct + 1} · ${pool?.title ?? ''}: ${q.text}`
      currentAnswer = q.answer
      nextQuestion = nq?.text ?? null
      nextAnswer = nq?.answer ?? null
      // Even after the 60s runs out, the admin still has a 5s grace window
      // to grade a last-second answer — keep the answer visible for them,
      // just flag the phase so the moderator knows time is up.
      if (expired) phaseLabel = "Time's up — grace window · admin still grading"
    } else if (s.phase === 'tie_break') {
      const tq = (s.tieQuestions ?? [])[s.tieCurrentIdx ?? 0]
      if (tq) {
        currentQuestion = tq.text
        currentAnswer = tq.answer
      }
      if (s.tieBuzzedBy) {
        phaseLabel += ` · ${s.tieBuzzedBy === 'A' ? s.teamA : s.teamB} buzzed`
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black">
      <iframe
        src="/audio-visual/audience"
        className="absolute inset-0 w-full h-full border-0"
        title="AV audience view (moderator mirror)"
      />
      <ModeratorOverlay
        round="Audio Visual" roundEmoji="📺" phaseLabel={phaseLabel}
        currentQuestion={currentQuestion} currentAnswer={currentAnswer}
        nextQuestion={nextQuestion} nextAnswer={nextAnswer}
        connected={connected}
      />
    </div>
  )
}
