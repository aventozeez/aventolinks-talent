'use client'
import { useEffect, useState } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'
import ModeratorShell, { ModCard } from '@/components/moderator-shell'

const CHANNEL = 'mc:state:mod'
const MC_MS = 60_000

type MCPuzzle = { id: string; picture: string; clue: string; scrambled: string; answer: string; storySnippet: string }
type MCPack = { id: string; title: string; emoji: string; teaser: string; openingStory: string; puzzles: MCPuzzle[] }
type MCState = {
  phase: string
  teamA: string; teamB: string; teamC: string
  scoreA: number; scoreB: number; scoreC: number
  packs: MCPack[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  queueA: MCPuzzle[]; queueB: MCPuzzle[]; queueC: MCPuzzle[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  timerStart: number | null
  revealed: boolean
}

function fmtSec(ms: number) { return `${Math.max(0, Math.ceil(ms / 1000))}s` }

export default function MCModerator() {
  const [s, setS] = useState<MCState | null>(null)
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, p => {
      setConnected(true)
      if (p) setS(p as MCState)
    })
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => { unsub(); clearInterval(t) }
  }, [])

  if (!s) {
    return (
      <ModeratorShell round="Mystery Chain" roundEmoji="🔒" phaseLabel="Waiting for admin…" connected={connected}
        nextUp="Admin will open a match on their control screen">
        <div className="text-center text-slate-400 py-20">Connecting…</div>
      </ModeratorShell>
    )
  }

  const activeLetter: 'A' | 'B' | 'C' | null =
    s.phase === 'a_playing' || s.phase === 'story_A' || s.phase === 'summary_A' || s.phase === 'pick_A' ? 'A'
    : s.phase === 'b_playing' || s.phase === 'story_B' || s.phase === 'summary_B' || s.phase === 'pick_B' ? 'B'
    : s.phase === 'c_playing' || s.phase === 'story_C' || s.phase === 'summary_C' || s.phase === 'pick_C' ? 'C'
    : null

  const activeName = activeLetter === 'A' ? s.teamA : activeLetter === 'B' ? s.teamB : activeLetter === 'C' ? s.teamC : null
  const activeQueue = activeLetter === 'A' ? s.queueA : activeLetter === 'B' ? s.queueB : activeLetter === 'C' ? s.queueC : []
  const activeRevealed = activeLetter === 'A' ? s.revealedA : activeLetter === 'B' ? s.revealedB : activeLetter === 'C' ? s.revealedC : []
  const chosenId = activeLetter === 'A' ? s.chosenA : activeLetter === 'B' ? s.chosenB : activeLetter === 'C' ? s.chosenC : null
  const activePack = chosenId ? s.packs.find(p => p.id === chosenId) : null
  const puzzle = activeQueue[0] ?? null
  const nextPuzzle = activeQueue[1] ?? null

  const playing = s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing'
  const timeLeft = playing && s.timerStart ? Math.max(0, MC_MS - (now - s.timerStart)) : MC_MS

  const phaseLabel =
    s.phase === 'setup' ? 'Match setup'
    : s.phase === 'intro' ? 'Rules — waiting for admin'
    : s.phase === 'pick_A' ? `${s.teamA} — picking a pack`
    : s.phase === 'story_A' ? `${s.teamA} — opening story`
    : s.phase === 'a_playing' ? `${s.teamA} playing`
    : s.phase === 'summary_A' ? `${s.teamA} — summary`
    : s.phase === 'pick_B' ? `${s.teamB} — picking a pack`
    : s.phase === 'story_B' ? `${s.teamB} — opening story`
    : s.phase === 'b_playing' ? `${s.teamB} playing`
    : s.phase === 'summary_B' ? `${s.teamB} — summary`
    : s.phase === 'pick_C' ? `${s.teamC} — picking a pack`
    : s.phase === 'story_C' ? `${s.teamC} — opening story`
    : s.phase === 'c_playing' ? `${s.teamC} playing`
    : s.phase === 'summary_C' ? `${s.teamC} — summary`
    : s.phase === 'compare_mc' ? 'MC head-to-head'
    : s.phase === 'compare_total' ? 'Cumulative head-to-head'
    : s.phase === 'done' ? 'Round complete'
    : s.phase

  const nextUp =
    s.phase === 'setup' ? 'Admin will pick teams and start'
    : s.phase === 'intro' ? `${s.teamA} picks first`
    : s.phase === 'pick_A' ? `${s.teamA} opening story next`
    : s.phase === 'story_A' ? `${s.teamA} starts riddles when animation ends`
    : s.phase === 'a_playing' ? (nextPuzzle ? `Next clue: ${nextPuzzle.clue}` : `${s.teamA} summary next`)
    : s.phase === 'summary_A' ? `${s.teamB} picks next`
    : s.phase === 'b_playing' ? (nextPuzzle ? `Next clue: ${nextPuzzle.clue}` : `${s.teamB} summary next`)
    : s.phase === 'summary_B' ? `${s.teamC} picks next`
    : s.phase === 'c_playing' ? (nextPuzzle ? `Next clue: ${nextPuzzle.clue}` : `${s.teamC} summary next`)
    : s.phase === 'summary_C' ? 'MC head-to-head next'
    : s.phase === 'compare_mc' ? 'Cumulative compare next'
    : s.phase === 'compare_total' ? 'Second Runner Up declaration next'
    : s.phase === 'done' ? 'Grand Final — Audio Visual is next'
    : 'Standing by'

  const stepHint = playing ? `Puzzle ${activeRevealed.length + 1} / ${activePack?.puzzles.length ?? 10}` : undefined

  return (
    <ModeratorShell round="Mystery Chain" roundEmoji="🔒" phaseLabel={phaseLabel} stepHint={stepHint} nextUp={nextUp} connected={connected}>
      <div className="grid gap-4 md:gap-6 max-w-4xl mx-auto">
        {playing && puzzle && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-lg md:text-2xl font-black text-white/80">{activeName} · {activePack?.title}</p>
              <p className={`text-4xl md:text-6xl font-black tabular-nums ${timeLeft < 10_000 ? 'text-red-400' : 'text-yellow-300'}`}>{fmtSec(timeLeft)}</p>
            </div>
            <ModCard label={`Clue · picture ${puzzle.picture}`} tone="question">
              <p className="text-xl md:text-3xl font-black leading-snug">{puzzle.clue}</p>
              <p className="mt-4 text-slate-400 text-sm md:text-base">Scrambled: <span className="text-white font-mono tracking-widest">{puzzle.scrambled}</span></p>
            </ModCard>
            <ModCard label="Answer" tone="answer">
              <p className="text-4xl md:text-6xl font-black text-yellow-200 tracking-widest">{puzzle.answer}</p>
              <p className="text-slate-300 text-sm md:text-base mt-3 leading-snug">Unlocks: <span className="text-white">{puzzle.storySnippet}</span></p>
            </ModCard>
            {nextPuzzle && (
              <ModCard label="On deck">
                <p className="text-base md:text-lg text-white/70 leading-snug">{nextPuzzle.clue}</p>
                <p className="text-xs text-slate-500 mt-1">Scrambled: <span className="font-mono tracking-widest">{nextPuzzle.scrambled}</span> · Answer: <span className="text-yellow-300 font-bold">{nextPuzzle.answer}</span></p>
              </ModCard>
            )}
          </>
        )}
        {!playing && (
          <ModCard label="Standing by">
            <p className="text-2xl md:text-3xl font-black">{phaseLabel}</p>
            {activePack && <p className="text-slate-400 mt-3">{activePack.title} · {activePack.emoji}</p>}
          </ModCard>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-green-300 truncate">{s.teamA}</p>
            <p className="text-2xl md:text-3xl font-black text-white tabular-nums">{s.scoreA}</p>
          </div>
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 truncate">{s.teamB}</p>
            <p className="text-2xl md:text-3xl font-black text-white tabular-nums">{s.scoreB}</p>
          </div>
          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-purple-300 truncate">{s.teamC}</p>
            <p className="text-2xl md:text-3xl font-black text-white tabular-nums">{s.scoreC}</p>
          </div>
        </div>
      </div>
    </ModeratorShell>
  )
}
