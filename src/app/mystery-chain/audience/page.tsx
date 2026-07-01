'use client'

import { useEffect, useState, useRef } from 'react'
import { wsSubscribe } from '@/lib/ws-sync'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 60_000

type MCPhase =
  | 'setup' | 'intro'
  | 'pick_A' | 'story_A' | 'a_playing'
  | 'pick_B' | 'story_B' | 'b_playing'
  | 'pick_C' | 'story_C' | 'c_playing'
  | 'done'

type PackCard = { id: string; title: string; emoji: string; teaser: string }

type MCAudienceState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  packs: PackCard[]
  chosenA: string | null; chosenB: string | null; chosenC: string | null
  activePackTitle: string
  activePackEmoji: string
  activeOpeningStory: string
  activeRevealedStory: string[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  revealed: boolean
  currentPuzzle: { picture: string; clue: string; scrambled: string; answer?: string } | null
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function StoryPhase({ s, storyTeam }: { s: MCAudienceState; storyTeam: string }) {
  const fullText = s.activeOpeningStory
  const [displayed, setDisplayed] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)

  // Typewriter
  useEffect(() => {
    setDisplayed('')
    indexRef.current = 0
    setDone(false)
    const iv = setInterval(() => {
      indexRef.current++
      setDisplayed(fullText.slice(0, indexRef.current))
      if (indexRef.current >= fullText.length) {
        clearInterval(iv)
        setDone(true)
      }
    }, 28)
    return () => clearInterval(iv)
  }, [fullText])

  // Blinking cursor
  useEffect(() => {
    const iv = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex flex-col overflow-hidden relative">

      {/* Animated background — slow radar pulse */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1,2,3,4].map(i => (
          <div key={i} className="absolute rounded-full border border-purple-700/20"
            style={{
              width: `${i * 22}vw`, height: `${i * 22}vw`,
              animation: `ping ${2 + i * 0.6}s cubic-bezier(0,0,0.2,1) infinite`,
              animationDelay: `${i * 0.4}s`,
              opacity: 0.15,
            }} />
        ))}
        {/* Central glow */}
        <div className="absolute w-32 h-32 rounded-full bg-purple-900/30 blur-3xl" />
      </div>

      {/* Film-grain overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '150px' }} />

      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)' }} />

      <div className="relative z-10 flex flex-col flex-1 p-5 gap-4">
        <Scoreboard s={s} activeKey={null} />

        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-2">

          {/* Title */}
          <div className="text-center">
            <p className="text-purple-400 text-xs font-bold uppercase tracking-[0.3em] mb-1">{storyTeam} selected</p>
            <p className="text-white text-3xl font-black tracking-tight">
              {s.activePackEmoji} {s.activePackTitle}
            </p>
          </div>

          {/* Story box */}
          <div className="w-full max-w-2xl bg-black/50 border border-purple-800/40 rounded-2xl p-6 shadow-xl shadow-purple-900/20 backdrop-blur">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" style={{animationDelay:'0.2s'}} />
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" style={{animationDelay:'0.4s'}} />
              <p className="text-slate-500 text-xs font-mono ml-1 uppercase tracking-widest">INCIDENT REPORT — CLASSIFIED</p>
            </div>

            <p className="text-green-300 font-mono text-sm leading-7 min-h-[6rem]">
              {displayed}
              <span className={`inline-block w-0.5 h-4 bg-green-400 ml-0.5 align-middle ${cursorVisible ? 'opacity-100' : 'opacity-0'}`} />
            </p>
          </div>

          {/* Waiting indicator */}
          {done && (
            <div className="flex items-center gap-3 mt-2 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
              <p className="text-[#f5a623] text-sm font-bold tracking-wide">
                Waiting for riddles to begin…
              </p>
              <div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Scoreboard({ s, activeKey }: { s: MCAudienceState; activeKey: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[{name:s.teamA,score:s.scoreA,k:'A'},{name:s.teamB,score:s.scoreB,k:'B'},{name:s.teamC,score:s.scoreC,k:'C'}].map(t => (
        <div key={t.k} className={`rounded-xl p-3 text-center border transition-all ${
          activeKey === t.k ? 'bg-purple-600/30 border-purple-400 shadow-lg shadow-purple-500/20' : 'bg-white/5 border-white/10'
        }`}>
          {activeKey === t.k && <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest mb-1">Playing</p>}
          <p className="text-slate-300 text-sm font-semibold truncate">{t.name}</p>
          <p className="text-white text-3xl font-black">{t.score}</p>
        </div>
      ))}
    </div>
  )
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
  const playingTeamName = s?.phase === 'a_playing' ? s.teamA : s?.phase === 'b_playing' ? s.teamB : s?.phase === 'c_playing' ? s.teamC : ''
  const pickingTeam = s?.phase === 'pick_A' ? s.teamA : s?.phase === 'pick_B' ? s.teamB : s?.phase === 'pick_C' ? s.teamC : null
  const takenIds = s ? [s.chosenA, s.chosenB, s.chosenC].filter(Boolean) as string[] : []

  // Waiting
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
        <p className="text-slate-400 text-base mt-3 max-w-lg text-center">
          Four mysteries are waiting to be unlocked. Each team chooses one — then has{' '}
          <span className="text-[#f5a623] font-bold">60 seconds</span> to unscramble the words and reveal the full story.
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
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col p-4 gap-5">
      <Scoreboard s={s} activeKey={null} />
      <div className="text-center">
        <p className="text-purple-300 text-xs font-bold uppercase tracking-widest">Now Choosing</p>
        <p className="text-white text-3xl font-black mt-1">{pickingTeam}</p>
        <p className="text-slate-400 text-sm mt-1">Select your mystery below</p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {s.packs.map(pack => {
          const taken = takenIds.includes(pack.id)
          const takenBy = taken ? (pack.id === s.chosenA ? s.teamA : pack.id === s.chosenB ? s.teamB : s.teamC) : null
          return (
            <div key={pack.id} className={`relative rounded-2xl border p-5 flex flex-col items-center justify-center text-center ${
              taken ? 'bg-white/5 border-white/10 opacity-40' : 'bg-purple-900/20 border-purple-500/40'
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

  // Story phase — show opening scenario before riddles
  if (s.phase === 'story_A' || s.phase === 'story_B' || s.phase === 'story_C') {
    const storyTeam = s.phase === 'story_A' ? s.teamA : s.phase === 'story_B' ? s.teamB : s.teamC
    return <StoryPhase s={s} storyTeam={storyTeam} />
  }

  // Playing phase
  if (s.phase === 'a_playing' || s.phase === 'b_playing' || s.phase === 'c_playing') return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 flex flex-col gap-4">

      {/* Pack title */}
      <div className="text-center">
        <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Mystery Chain</p>
        <h1 className="text-white text-xl font-black">{s.activePackEmoji} {s.activePackTitle}</h1>
      </div>

      <Scoreboard s={s} activeKey={activeTeamKey} />

      {/* Timer */}
      <div className="bg-white/5 rounded-2xl p-4">
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
        </div>
        <p className="text-center font-black text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
        <p className="text-center text-slate-500 text-xs mt-1">{playingTeamName} is playing</p>
      </div>

      {/* Puzzle */}
      {s.currentPuzzle ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center gap-4">
          {/* Picture clue */}
          <div className="bg-black/30 rounded-2xl px-10 py-5">
            <p className="text-8xl">{s.currentPuzzle.picture}</p>
          </div>
          <p className="text-slate-400 text-sm">
            Clue: <span className="text-white font-semibold">{s.currentPuzzle.clue}</span>
          </p>
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

      {/* Story so far */}
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

      {/* Each team's story */}
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
