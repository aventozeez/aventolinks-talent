'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import ModeratorShell, { ModCard } from '@/components/moderator-shell'

const CHANNEL = 'av:state'
const ROUND_MS = 60_000

type AVQuestion = { id: string; text: string; answer: string; revealed: boolean; answeredBy: 'A' | 'B' | null }
type AVPool = { id: string; title: string; questions: AVQuestion[] }
type AVState = {
  phase: string
  teamA: string; teamB: string
  scoreA: number; scoreB: number
  mcScoreA: number; mcScoreB: number
  correctA: number; correctB: number
  pools: AVPool[]
  chosenPoolA: string | null; chosenPoolB: string | null
  queueA: AVQuestion[]; queueB: AVQuestion[]
  timerStart: number | null
  tieQuestions?: AVQuestion[]
  tieCurrentIdx?: number
  tieBuzzedBy?: 'A' | 'B' | null
}

function fmtSec(ms: number) { return `${Math.max(0, Math.ceil(ms / 1000))}s` }

export default function AVModerator() {
  const [s, setS] = useState<AVState | null>(null)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, p => {
      setConnected(true)
      if (p) setS(p as AVState)
    })
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => { unsub(); clearInterval(t) }
  }, [])

  if (!s) {
    return (
      <ModeratorShell round="Audio Visual" roundEmoji="📺" phaseLabel="Waiting for admin…" connected={connected}
        nextUp="Admin will open the AV round on their control screen">
        <div className="text-center text-slate-400 py-20">Connecting…</div>
      </ModeratorShell>
    )
  }

  const isA = s.phase === 'qa_a'
  const playing = isA || s.phase === 'qa_b'
  const teamName = isA ? s.teamA : s.phase === 'qa_b' ? s.teamB : null
  const queue = isA ? s.queueA : s.queueB
  const pool = isA ? s.pools?.find(p => p.id === s.chosenPoolA) : s.pools?.find(p => p.id === s.chosenPoolB)
  const q = queue?.[0]
  const nextQ = queue?.[1]
  const correct = isA ? s.correctA : s.correctB
  const timeLeft = playing && s.timerStart ? Math.max(0, ROUND_MS - (now - s.timerStart)) : ROUND_MS

  const phaseLabel =
    s.phase === 'idle' ? 'Waiting for handoff'
    : s.phase === 'watching' ? 'Both teams watching the video'
    : s.phase === 'pick_pool_a' ? `${s.teamA} — picking a pool`
    : s.phase === 'qa_a' ? `${s.teamA} answering`
    : s.phase === 'score_a' ? `${s.teamA} — score reveal`
    : s.phase === 'break' ? 'Break — Team B on deck'
    : s.phase === 'pick_pool_b' ? `${s.teamB} — picking a pool`
    : s.phase === 'qa_b' ? `${s.teamB} answering`
    : s.phase === 'score_b' ? `${s.teamB} — score reveal`
    : s.phase === 'compare_av' ? 'AV head-to-head'
    : s.phase === 'compare_total' ? 'Cumulative compare'
    : s.phase === 'tie_break' ? 'Tie-breaker — sudden death'
    : s.phase === 'done' ? 'Round complete'
    : s.phase === 'declare_first_runnerup' ? 'Declaring First Runner Up'
    : s.phase === 'declare_winner' ? 'Declaring the Winner'
    : s.phase

  const nextUp =
    s.phase === 'idle' ? `${s.teamA} vs ${s.teamB} — Grand Final incoming`
    : s.phase === 'watching' ? `Team A picks a pool after the video`
    : s.phase === 'pick_pool_a' ? `${s.teamA} answers 60s in the chosen pool`
    : s.phase === 'qa_a' ? (nextQ ? `Next question: ${nextQ.text}` : `${s.teamA} score next`)
    : s.phase === 'score_a' ? `${s.teamB} picks next`
    : s.phase === 'pick_pool_b' ? `${s.teamB} answers 60s in the chosen pool`
    : s.phase === 'qa_b' ? (nextQ ? `Next question: ${nextQ.text}` : `${s.teamB} score next`)
    : s.phase === 'score_b' ? 'AV head-to-head next'
    : s.phase === 'compare_av' ? 'Cumulative compare next'
    : s.phase === 'compare_total' ? 'Runner Up + Winner declarations next'
    : s.phase === 'tie_break' ? 'Sudden death — first team to buzz answers'
    : 'Standing by'

  const stepHint = playing ? `Q ${correct + 1} / up to ${pool?.questions.length ?? 0}` : undefined

  return (
    <ModeratorShell round="Audio Visual" roundEmoji="📺" phaseLabel={phaseLabel} stepHint={stepHint} nextUp={nextUp} connected={connected}>
      <div className="grid gap-4 md:gap-6 max-w-4xl mx-auto">
        {playing && q ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-lg md:text-2xl font-black text-white/80">{teamName} · {pool?.title}</p>
              <p className={`text-4xl md:text-6xl font-black tabular-nums ${timeLeft < 10_000 ? 'text-red-400' : 'text-yellow-300'}`}>{fmtSec(timeLeft)}</p>
            </div>
            <ModCard label={`Question ${correct + 1}`} tone="question">
              <p className="text-2xl md:text-4xl font-black leading-snug">{q.text}</p>
            </ModCard>
            <ModCard label="Answer" tone="answer">
              <p className="text-3xl md:text-5xl font-black text-yellow-200 leading-tight">{q.answer}</p>
            </ModCard>
            {nextQ && (
              <ModCard label="On deck">
                <p className="text-base md:text-lg text-white/70 leading-snug">{nextQ.text}</p>
                <p className="text-xs text-slate-500 mt-1">Answer: <span className="text-yellow-300 font-bold">{nextQ.answer}</span></p>
              </ModCard>
            )}
          </>
        ) : s.phase === 'tie_break' ? (
          <ModCard label="Sudden death — buzzer" tone="warning">
            {(s.tieQuestions ?? [])[s.tieCurrentIdx ?? 0] ? (
              <>
                <p className="text-2xl md:text-3xl font-black">{(s.tieQuestions ?? [])[s.tieCurrentIdx ?? 0].text}</p>
                <p className="text-yellow-200 text-2xl md:text-3xl font-black mt-4">Answer: {(s.tieQuestions ?? [])[s.tieCurrentIdx ?? 0].answer}</p>
                {s.tieBuzzedBy && <p className="mt-3 text-amber-300 font-black">🔔 {s.tieBuzzedBy === 'A' ? s.teamA : s.teamB} buzzed</p>}
              </>
            ) : (
              <p className="text-slate-400">Waiting for question…</p>
            )}
          </ModCard>
        ) : (
          <ModCard label="Standing by">
            <p className="text-2xl md:text-3xl font-black">{phaseLabel}</p>
          </ModCard>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-green-300">{s.teamA}</p>
            <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.scoreA - s.mcScoreA}</p>
            <p className="text-xs text-slate-400">AV only · total {s.scoreA}</p>
          </div>
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{s.teamB}</p>
            <p className="text-3xl md:text-4xl font-black text-white tabular-nums">{s.scoreB - s.mcScoreB}</p>
            <p className="text-xs text-slate-400">AV only · total {s.scoreB}</p>
          </div>
        </div>
      </div>
    </ModeratorShell>
  )
}
