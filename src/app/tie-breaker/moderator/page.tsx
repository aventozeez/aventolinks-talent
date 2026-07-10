'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import ModeratorShell, { ModCard } from '@/components/moderator-shell'

const CHANNEL = 'tie:state'
const ROUND_MS = 30_000

type TBQuestion = { id: string; text: string; answer: string }
type TBPool = { id: string; title: string; questions: TBQuestion[] }
type TBState = {
  phase: string
  teamA: string; teamB: string
  priorA: number; priorB: number
  scoreA: number; scoreB: number
  correctA: number; correctB: number
  pools: TBPool[]
  chosenPoolA: string | null; chosenPoolB: string | null
  queueA: TBQuestion[]; queueB: TBQuestion[]
  timerStart: number | null
  currentQ: TBQuestion | null
  showAnswer: boolean
}

function fmtSec(ms: number) { return `${Math.max(0, Math.ceil(ms / 1000))}s` }

export default function TBModerator() {
  const [s, setS] = useState<TBState | null>(null)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, p => {
      setConnected(true)
      if (p) setS(p as TBState)
    })
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => { unsub(); clearInterval(t) }
  }, [])

  if (!s) {
    return (
      <ModeratorShell round="Tie Breaker" roundEmoji="⚖️" phaseLabel="Waiting for admin…" connected={connected}
        nextUp="Admin will open the tie-breaker on their control screen">
        <div className="text-center text-slate-400 py-20">Connecting…</div>
      </ModeratorShell>
    )
  }

  const isA = s.phase === 'a_playing' || s.phase === 'announce_a' || s.phase === 'score_a'
  const playing = s.phase === 'a_playing' || s.phase === 'b_playing'
  const teamName = isA ? s.teamA : s.phase === 'b_playing' || s.phase === 'announce_b' || s.phase === 'score_b' ? s.teamB : null
  const queue = s.phase === 'a_playing' ? s.queueA : s.phase === 'b_playing' ? s.queueB : []
  const pool = isA ? s.pools?.find(p => p.id === s.chosenPoolA) : s.pools?.find(p => p.id === s.chosenPoolB)
  const q = s.currentQ ?? queue?.[0]
  const nextQ = queue?.[s.currentQ ? 0 : 1]
  const timeLeft = playing && s.timerStart ? Math.max(0, ROUND_MS - (now - s.timerStart)) : ROUND_MS

  const phaseLabel =
    s.phase === 'setup' ? 'Match setup'
    : s.phase === 'intro' ? 'Rules — waiting for admin'
    : s.phase === 'announce_a' ? `${s.teamA} — up next`
    : s.phase === 'a_playing' ? `${s.teamA} playing`
    : s.phase === 'score_a' ? `${s.teamA} — score reveal`
    : s.phase === 'announce_b' ? `${s.teamB} — up next`
    : s.phase === 'b_playing' ? `${s.teamB} playing`
    : s.phase === 'score_b' ? `${s.teamB} — score reveal`
    : s.phase === 'compare' ? 'Head-to-head compare'
    : s.phase

  const nextUp =
    s.phase === 'setup' ? 'Admin will pick teams + pools'
    : s.phase === 'intro' ? `${s.teamA} plays first`
    : s.phase === 'announce_a' ? `${s.teamA} — 30s`
    : s.phase === 'a_playing' ? (nextQ ? `Next: ${nextQ.text}` : `${s.teamA} score next`)
    : s.phase === 'score_a' ? `${s.teamB} up next`
    : s.phase === 'announce_b' ? `${s.teamB} — 30s`
    : s.phase === 'b_playing' ? (nextQ ? `Next: ${nextQ.text}` : `${s.teamB} score next`)
    : s.phase === 'score_b' ? 'Compare next'
    : s.phase === 'compare' ? 'Winner declared'
    : 'Standing by'

  return (
    <ModeratorShell round="Tie Breaker" roundEmoji="⚖️" phaseLabel={phaseLabel} nextUp={nextUp} connected={connected}>
      <div className="grid gap-4 md:gap-6 max-w-4xl mx-auto">
        {playing && q ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-lg md:text-2xl font-black text-white/80">{teamName} · {pool?.title}</p>
              <p className={`text-4xl md:text-6xl font-black tabular-nums ${timeLeft < 10_000 ? 'text-red-400' : 'text-yellow-300'}`}>{fmtSec(timeLeft)}</p>
            </div>
            <ModCard label="Question" tone="question">
              <p className="text-2xl md:text-4xl font-black leading-snug">{q.text}</p>
            </ModCard>
            <ModCard label="Answer" tone="answer">
              <p className="text-3xl md:text-5xl font-black text-yellow-200 leading-tight">{q.answer}</p>
            </ModCard>
            {nextQ && nextQ.id !== q.id && (
              <ModCard label="On deck">
                <p className="text-base md:text-lg text-white/70 leading-snug">{nextQ.text}</p>
                <p className="text-xs text-slate-500 mt-1">Answer: <span className="text-yellow-300 font-bold">{nextQ.answer}</span></p>
              </ModCard>
            )}
          </>
        ) : (
          <ModCard label="Standing by">
            <p className="text-2xl md:text-3xl font-black">{phaseLabel}</p>
          </ModCard>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-green-300">{s.teamA}</p>
            <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.scoreA}</p>
            <p className="text-xs text-slate-400">{s.correctA} correct</p>
          </div>
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{s.teamB}</p>
            <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.scoreB}</p>
            <p className="text-xs text-slate-400">{s.correctB} correct</p>
          </div>
        </div>
      </div>
    </ModeratorShell>
  )
}
