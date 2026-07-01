'use client'

import { useEffect, useState, useRef } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 180_000

type MCPhase =
  | 'setup' | 'intro'
  | 'pick_A' | 'a_playing'
  | 'pick_B' | 'b_playing'
  | 'pick_C' | 'c_playing'
  | 'done'

type PackCard = { id: string; title: string; emoji: string; teaser: string }

type MCAudienceState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  packs: PackCard[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  activePackTitle: string
  activeRevealedStory: string[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  revealed: boolean
  currentPuzzle: { clue: string; scrambled: string; answer?: string } | null
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function MCAudiencePage() {
  const [s, setS] = useState<MCAudienceState | null>(null)
  const [timeLeft, setTimeLeft] = useState(MC_TIME_MS)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (data: MCAudienceState) => setS(data))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!s?.timerStart) { setTimeLeft(MC_TIME_MS); return }
    const tick = () => setTimeLeft(Math.max(0, MC_TIME_MS - (Date.now() - (s.timerStart ?? 0))))
    tick(); timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s?.timerStart])

  const pct = timeLeft / MC_TIME_MS
  const timerColor = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#f59e0b' : '#ef4444'

  const activeTeamKey = s?.phase === 'a_playing' ? 'A' : s?.phase === 'b_playing' ? 'B' : s?.phase === 'c_playing' ? 'C' : null
  const pickingTeam = s?.phase === 'pick_A' ? s.teamA : s?.phase === 'pick_B' ? s.teamB : s?.phase === 'pick_C' ? s.teamC : null
  const takenIds = s ? [s.chosenA, s.chosenB, s.chosenC].filter(Boolean) as string[] : []

  // Waiting screen
  if (!s || s.phase === 'setup') return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="text-6xl">🔮</div>
        <p className="text-white text-3xl font-black">Mystery Chain</p>
        <p className="text-slate-500 text-lg">Waiting for the round to begin…</p>
      </div>
    </div>
  )

  // Intro
  if (s.phase === 'intro') return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest mb-2">Grand Finale</p>
        <h1 className="text-white text-4xl font-black">🔮 Mystery Chain</h1>
        <p className="text-slate-400 text-base mt-3 max-w-lg">
          Four mysteries are waiting to be unlocked. Each team chooses one — then has 3 minutes to unscramble the words and reveal the full story.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
        {s.packs.map(p => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
            <p className="text-4xl mb-2">{p.emoji}</p>
            <p className="text-white font-black text-sm">{p.title}</p>
            <p className="text-slate-500 text-xs mt-1">{p.teaser}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
        {[s.teamA, s.teamB, s.teamC].map((t, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className="text-slate-500 text-xs">Team {['A','B','C'][i]}</p>
            <p className="text-white font-bold text-sm">{t}</p>
          </div>
        ))}
      </div>
    </div>
  )

  // Pick phase
  if (s.phase === 'pick_A' || s.phase === 'pick_B' || s.phase === 'pick_C') return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col p-4 gap-6">
      {/* Scores */}
      <div className="grid grid-cols-3 gap-3">
        {[{name:s.teamA,score:s.scoreA,k:'A'},{name:s.teamB,score:s.scoreB,k:'B'},{name:s.teamC,score:s.scoreC,k:'C'}].map(t => (
          <div key={t.k} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
            <p className="text-slate-300 text-xs font-semibold truncate">{t.name}</p>
            <p className="text-white text-2xl font-black">{t.score}</p>
          </div>
        ))}
      </div>

      {/* Picking prompt */}
      <div className="text-center">
        <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">Now Choosing</p>
        <p className="text-white text-3xl font-black mt-1">{pickingTeam}</p>
        <p className="text-slate-400 text-sm mt-1">Select your mystery below</p>
      </div>

      {/* Mystery cards */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        {s.packs.map(pack => {
          const taken = takenIds.includes(pack.id)
          const takenBy = taken
            ? pack.id === s.chosenA ? s.teamA : pack.id === s.chosenB ? s.teamB : s.teamC
            : null
          return (
            <div key={pack.id} className={`relative rounded-2xl border p-5 flex flex-col items-center justify-center text-center transition-all ${
              taken
                ? 'bg-white/5 border-white/10 opacity-40'
                : 'bg-purple-900/20 border-purple-500/40'
            }`}>
              {taken && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/60">
                  <p className="text-white text-xs">Chosen by</p>
                  <p className="text-[#f5a623] font-black text-base">{takenBy}</p>
                </div>
              )}
              <p className="text-5xl mb-3">{pack.emoji}</p>
              <p className="text-white font-black">{pack.title}</p>
              <p className="text-slate-400 text-xs mt-1">{pack.teaser}</p>
            </div>
          )
        })}
      </div>
    </div>
  )

  // Playing phase
  if (s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing') {
    const teamName = s.phase === 'a_playing' ? s.teamA : s.phase === 'b_playing' ? s.teamB : s.teamC
    return (
      <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-4">

        {/* Header with pack name */}
        <div className="text-center">
          <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mystery Chain</p>
          <h1 className="text-white text-xl font-black">{s.activePackTitle}</h1>
        </div>

        {/* Scoreboard */}
        <div className="grid grid-cols-3 gap-3">
          {[{name:s.teamA,score:s.scoreA,k:'A'},{name:s.teamB,score:s.scoreB,k:'B'},{name:s.teamC,score:s.scoreC,k:'C'}].map(t => (
            <div key={t.k} className={`rounded-xl p-4 text-center border transition-all ${
              activeTeamKey === t.k
                ? 'bg-purple-600/30 border-purple-400 shadow-lg shadow-purple-500/20'
                : 'bg-white/5 border-white/10'
            }`}>
              {activeTeamKey === t.k && (
                <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest mb-1">Now Playing</p>
              )}
              <p className="text-slate-300 text-sm font-semibold truncate">{t.name}</p>
              <p className="text-white text-3xl font-black">{t.score}</p>
            </div>
          ))}
        </div>

        {/* Timer */}
        <div className="bg-white/5 rounded-2xl p-4">
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
          </div>
          <p className="text-center font-black text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
          <p className="text-center text-slate-500 text-xs mt-1">{teamName} is playing</p>
        </div>

        {/* Puzzle */}
        {s.currentPuzzle ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center text-center gap-4">
            <p className="text-slate-400 text-sm">Clue: <span className="text-white font-semibold">{s.currentPuzzle.clue}</span></p>
            <p className="text-[#f5a623] text-5xl font-black tracking-[0.3em]">{s.currentPuzzle.scrambled}</p>
            {s.revealed && s.currentPuzzle.answer && (
              <div className="bg-green-500/20 border border-green-500/40 rounded-xl px-6 py-3">
                <p className="text-green-300 text-xs font-bold uppercase tracking-widest mb-1">Answer</p>
                <p className="text-white text-2xl font-black">{s.currentPuzzle.answer}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500">No more puzzles in queue</p>
          </div>
        )}

        {/* Story revealed so far */}
        {s.activeRevealedStory && s.activeRevealedStory.length > 0 && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-4">
            <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-3 text-center">Story Unfolding…</p>
            <div className="space-y-2">
              {s.activeRevealedStory.map((snippet, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-blue-500 font-bold text-sm shrink-0">{i + 1}.</span>
                  <p className="text-blue-100 text-sm leading-relaxed">{snippet}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Done
  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-6 items-center justify-center">
      <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mysteries Solved — Final Results</p>

      <div className="w-full max-w-sm space-y-3">
        {[
          {name:s.teamA,score:s.scoreA,rev:s.revealedA,cid:s.chosenA},
          {name:s.teamB,score:s.scoreB,rev:s.revealedB,cid:s.chosenB},
          {name:s.teamC,score:s.scoreC,rev:s.revealedC,cid:s.chosenC},
        ].sort((a,b) => b.score - a.score).map((t, i) => {
          const pack = s.packs.find(p => p.id === t.cid)
          return (
            <div key={t.name} className={`rounded-xl px-5 py-4 border ${
              i === 0 ? 'bg-yellow-500/20 border-yellow-500/40' :
              i === 1 ? 'bg-slate-500/20 border-slate-500/30' :
              'bg-orange-900/20 border-orange-900/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                  <div>
                    <p className="text-white font-bold">{t.name}</p>
                    <p className="text-slate-400 text-xs">{pack?.emoji} {pack?.title} · {t.rev.length} clues</p>
                  </div>
                </div>
                <span className="text-white text-2xl font-black">{t.score}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Show each team's revealed story */}
      <div className="w-full max-w-2xl space-y-4">
        {[
          {name:s.teamA,rev:s.revealedA,cid:s.chosenA},
          {name:s.teamB,rev:s.revealedB,cid:s.chosenB},
          {name:s.teamC,rev:s.revealedC,cid:s.chosenC},
        ].filter(t => t.rev.length > 0).map(t => {
          const pack = s.packs.find(p => p.id === t.cid)
          return (
            <div key={t.name} className="bg-blue-900/10 border border-blue-800/30 rounded-2xl p-4">
              <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-2">
                {t.name} — {pack?.emoji} {pack?.title}
              </p>
              <div className="space-y-1">
                {t.rev.map((snippet, i) => (
                  <p key={i} className="text-blue-100 text-sm leading-relaxed">
                    <span className="text-blue-400 font-bold mr-1">{i + 1}.</span>{snippet}
                  </p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
