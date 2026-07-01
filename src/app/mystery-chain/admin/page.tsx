'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { wsBroadcast } from '@/lib/ws-sync'

const CHANNEL = 'mc:state'
const MC_TIME_MS = 180_000 // 3 minutes
const MC_PTS = 10

type MCPhase = 'setup' | 'story' | 'a_playing' | 'b_playing' | 'c_playing' | 'done'

type MCPuzzle = {
  id: string
  clue: string
  scrambled: string
  answer: string
  storySnippet: string
}

type MCState = {
  phase: MCPhase
  teamA: string; teamB: string; teamC: string
  packTitle: string; openingStory: string
  queueA: MCPuzzle[]; queueB: MCPuzzle[]; queueC: MCPuzzle[]
  revealedA: string[]; revealedB: string[]; revealedC: string[]
  scoreA: number; scoreB: number; scoreC: number
  timerStart: number | null
  revealed: boolean
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function safeForAudience(s: MCState) {
  const getQueue = () => {
    if (s.phase === 'a_playing') return s.queueA
    if (s.phase === 'b_playing') return s.queueB
    if (s.phase === 'c_playing') return s.queueC
    return []
  }
  const activeRevealed = s.phase === 'a_playing' ? s.revealedA : s.phase === 'b_playing' ? s.revealedB : s.revealedC
  const q = getQueue()
  const puzzle = q[0] ?? null
  return {
    phase: s.phase,
    teamA: s.teamA, teamB: s.teamB, teamC: s.teamC,
    packTitle: s.packTitle, openingStory: s.openingStory,
    scoreA: s.scoreA, scoreB: s.scoreB, scoreC: s.scoreC,
    revealedA: s.revealedA, revealedB: s.revealedB, revealedC: s.revealedC,
    activeRevealedStory: activeRevealed,
    timerStart: s.timerStart,
    revealed: s.revealed,
    currentPuzzle: puzzle ? {
      clue: puzzle.clue,
      scrambled: puzzle.scrambled,
      answer: s.revealed ? puzzle.answer : undefined,
    } : null,
  }
}

const SILENT_WARNING_PACK = {
  packTitle: 'The Silent Warning',
  openingStory: `At 8:15 AM, students arrived at Crescent Academy for the annual Scholars Challenge. Everything appeared normal. At 10:30 AM, a teacher noticed something unusual. The school was not under attack yet — but all the signs suggested that something dangerous was about to happen. The teams have 3 minutes to uncover the threat.`,
  puzzles: [
    { clue: 'The weakest part of any system.', scrambled: 'KNLI', answer: 'LINK', storySnippet: 'Investigators discovered a weak link in the school\'s safety system.' },
    { clue: 'A person present where they are not authorized to be.', scrambled: 'RTUINRDE', answer: 'INTRUDER', storySnippet: 'Security footage showed a possible intruder.' },
    { clue: 'A place selected for special attention.', scrambled: 'RAGTTE', answer: 'TARGET', storySnippet: 'The intruder appeared interested in a specific target.' },
    { clue: 'Choosing the perfect moment.', scrambled: 'GMNITI', answer: 'TIMING', storySnippet: 'Whoever planned this understood timing perfectly.' },
    { clue: 'Information passed secretly.', scrambled: 'SGAESME', answer: 'MESSAGE', storySnippet: 'A coded message was discovered.' },
    { clue: 'Careful examination to discover the truth.', scrambled: 'YAANLSIS', answer: 'ANALYSIS', storySnippet: 'The analysis revealed a disturbing pattern.' },
    { clue: 'Continuous observation.', scrambled: 'NIMTOROING', answer: 'MONITORING', storySnippet: 'Monitoring showed unusual movement around the campus.' },
    { clue: 'A signal that demands immediate action.', scrambled: 'TREAL', answer: 'ALERT', storySnippet: 'The school issued an alert.' },
    { clue: 'Organized movement away from danger.', scrambled: 'AUEVTCAIOON', answer: 'EVACUATION', storySnippet: 'A precautionary evacuation began.' },
    { clue: 'The final objective of every safety plan.', scrambled: 'NTEITCOPRO', answer: 'PROTECTION', storySnippet: 'The school and its students were finally safe under full protection.' },
  ],
}

const defaultState = (): MCState => ({
  phase: 'setup',
  teamA: '', teamB: '', teamC: '',
  packTitle: SILENT_WARNING_PACK.packTitle, openingStory: SILENT_WARNING_PACK.openingStory,
  queueA: [], queueB: [], queueC: [],
  revealedA: [], revealedB: [], revealedC: [],
  scoreA: 0, scoreB: 0, scoreC: 0,
  timerStart: null, revealed: false,
})

export default function MCAdminPage() {
  const [s, setS] = useState<MCState>(defaultState())
  const [timeLeft, setTimeLeft] = useState(MC_TIME_MS)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const stateRef = useRef(s)
  stateRef.current = s

  const [clue, setClue] = useState('')
  const [scrambled, setScrambled] = useState('')
  const [answer, setAnswer] = useState('')
  const [storySnippet, setStorySnippet] = useState('')
  const [puzzles, setPuzzles] = useState<MCPuzzle[]>(
    SILENT_WARNING_PACK.puzzles.map(p => ({ ...p, id: crypto.randomUUID() }))
  )

  const broadcast = useCallback((st: MCState) => {
    wsBroadcast(CHANNEL, safeForAudience(st))
  }, [])

  const update = useCallback((st: MCState) => {
    setS(st)
    broadcast(st)
  }, [broadcast])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const playing = ['a_playing', 'b_playing', 'c_playing'].includes(s.phase)
    if (!playing || !s.timerStart) { setTimeLeft(MC_TIME_MS); return }

    const tick = () => {
      const left = Math.max(0, MC_TIME_MS - (Date.now() - (stateRef.current.timerStart ?? 0)))
      setTimeLeft(left)
      if (left === 0) {
        const cur = stateRef.current
        if (!['a_playing', 'b_playing', 'c_playing'].includes(cur.phase)) return
        const next: MCState = {
          ...cur,
          phase: cur.phase === 'a_playing' ? 'b_playing' : cur.phase === 'b_playing' ? 'c_playing' : 'done',
          timerStart: cur.phase !== 'c_playing' ? Date.now() : null,
          revealed: false,
        }
        setS(next)
        broadcast(next)
        clearInterval(timerRef.current!)
      }
    }
    tick()
    timerRef.current = setInterval(tick, 250)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s.phase, s.timerStart, broadcast])

  const loadSilentWarning = () => {
    setPuzzles(SILENT_WARNING_PACK.puzzles.map(p => ({ ...p, id: crypto.randomUUID() })))
    setS(prev => ({ ...prev, packTitle: SILENT_WARNING_PACK.packTitle, openingStory: SILENT_WARNING_PACK.openingStory }))
  }

  const addPuzzle = () => {
    if (!clue.trim() || !scrambled.trim() || !answer.trim()) return
    setPuzzles(prev => [...prev, {
      id: crypto.randomUUID(),
      clue: clue.trim(),
      scrambled: scrambled.trim().toUpperCase(),
      answer: answer.trim(),
      storySnippet: storySnippet.trim(),
    }])
    setClue(''); setScrambled(''); setAnswer(''); setStorySnippet('')
  }

  const removePuzzle = (id: string) => setPuzzles(prev => prev.filter(p => p.id !== id))

  const startGame = () => {
    if (!s.teamA || !s.teamB || !s.teamC || puzzles.length === 0) return
    const q = [...puzzles]
    const next: MCState = {
      ...s,
      phase: 'story',
      queueA: [...q], queueB: [...q], queueC: [...q],
      revealedA: [], revealedB: [], revealedC: [],
      scoreA: 0, scoreB: 0, scoreC: 0,
      timerStart: null, revealed: false,
    }
    update(next)
  }

  const startTeam = (phase: MCPhase) => {
    update({ ...s, phase, timerStart: Date.now(), revealed: false })
  }

  const action = (result: 'correct' | 'wrong' | 'skip') => {
    const cur = stateRef.current
    const qKey = cur.phase === 'a_playing' ? 'queueA' : cur.phase === 'b_playing' ? 'queueB' : 'queueC'
    const scoreKey = cur.phase === 'a_playing' ? 'scoreA' : cur.phase === 'b_playing' ? 'scoreB' : 'scoreC'
    const revKey = cur.phase === 'a_playing' ? 'revealedA' : cur.phase === 'b_playing' ? 'revealedB' : 'revealedC'
    const queue = [...cur[qKey]]
    if (queue.length === 0) return

    const puzzle = queue.shift()!
    if (result === 'wrong' || result === 'skip') queue.push(puzzle)

    const nextRevealed = result === 'correct' && puzzle.storySnippet
      ? [...cur[revKey], puzzle.storySnippet]
      : [...cur[revKey]]

    const next: MCState = {
      ...cur,
      [qKey]: queue,
      [scoreKey]: result === 'correct' ? cur[scoreKey] + MC_PTS : cur[scoreKey],
      [revKey]: nextRevealed,
      revealed: false,
    }
    update(next)
  }

  const reveal = () => update({ ...s, revealed: !s.revealed })

  const nextTeam = () => {
    const next: MCState = {
      ...s,
      phase: s.phase === 'a_playing' ? 'b_playing' : s.phase === 'b_playing' ? 'c_playing' : 'done',
      timerStart: s.phase !== 'c_playing' ? Date.now() : null,
      revealed: false,
    }
    update(next)
  }

  const reset = () => { setS(defaultState()); setPuzzles([]) }

  const currentQueue = s.phase === 'a_playing' ? s.queueA : s.phase === 'b_playing' ? s.queueB : s.queueC
  const currentPuzzle = currentQueue[0] ?? null
  const currentTeamName = s.phase === 'a_playing' ? s.teamA : s.phase === 'b_playing' ? s.teamB : s.teamC
  const currentRevealed = s.phase === 'a_playing' ? s.revealedA : s.phase === 'b_playing' ? s.revealedB : s.revealedC
  const pct = timeLeft / MC_TIME_MS
  const timerColor = pct > 0.4 ? '#22c55e' : pct > 0.2 ? '#f59e0b' : '#ef4444'
  const isPlaying = ['a_playing', 'b_playing', 'c_playing'].includes(s.phase)

  return (
    <div className="min-h-screen bg-[#0a1628] text-white p-4">
      <div className="max-w-3xl mx-auto space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest">Standalone Test</p>
            <h1 className="text-white text-2xl font-black">🔮 Mystery Chain</h1>
          </div>
          <div className="flex gap-2 items-center">
            <a href="/mystery-chain/audience" target="_blank"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Open Audience ↗
            </a>
            {s.phase !== 'setup' && (
              <button onClick={reset} className="text-xs bg-red-600/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-600/30">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* ── SETUP ── */}
        {s.phase === 'setup' && (
          <div className="space-y-4">
            <button onClick={loadSilentWarning}
              className="w-full bg-gradient-to-r from-yellow-600/30 to-orange-600/30 border border-yellow-500/40 text-yellow-300 font-bold py-3 rounded-xl hover:from-yellow-600/40 hover:to-orange-600/40 flex items-center justify-center gap-2">
              ⚡ Load &quot;The Silent Warning&quot; Pack (10 puzzles)
            </button>

            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold">Pack Info</h2>
              <input value={s.packTitle} onChange={e => setS(p => ({ ...p, packTitle: e.target.value }))}
                placeholder="Pack title" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              <textarea value={s.openingStory} onChange={e => setS(p => ({ ...p, openingStory: e.target.value }))}
                placeholder="Opening scenario story shown before the round starts…"
                rows={4} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
            </div>

            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold">Teams</h2>
              <div className="grid grid-cols-3 gap-3">
                {(['teamA','teamB','teamC'] as const).map((k, i) => (
                  <input key={k} value={s[k]} onChange={e => setS(p => ({ ...p, [k]: e.target.value }))}
                    placeholder={`Team ${['A','B','C'][i]} name`}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                ))}
              </div>
            </div>

            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold">Puzzles ({puzzles.length})</h2>
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                <input value={clue} onChange={e => setClue(e.target.value)}
                  placeholder="Clue" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <input value={scrambled} onChange={e => setScrambled(e.target.value.toUpperCase())}
                  placeholder="Scrambled word" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono" />
                <input value={answer} onChange={e => setAnswer(e.target.value)}
                  placeholder="Answer" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
                <input value={storySnippet} onChange={e => setStorySnippet(e.target.value)}
                  placeholder="Story snippet revealed on correct answer (optional)"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  onKeyDown={e => e.key === 'Enter' && addPuzzle()} />
                <button onClick={addPuzzle} disabled={!clue || !scrambled || !answer}
                  className="w-full bg-[#f5a623] text-black font-bold py-2 rounded-lg text-sm hover:bg-[#e09510] disabled:opacity-40">
                  + Add Puzzle
                </button>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {puzzles.map((p, i) => (
                  <div key={p.id} className="flex items-start gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                    <span className="text-slate-500 text-xs mt-0.5 w-5 shrink-0">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#f5a623] text-sm font-mono font-bold">{p.scrambled}</p>
                      <p className="text-slate-400 text-xs">Clue: {p.clue}</p>
                      <p className="text-green-400 text-xs">Answer: {p.answer}</p>
                      {p.storySnippet && <p className="text-blue-400 text-xs italic mt-0.5">&ldquo;{p.storySnippet}&rdquo;</p>}
                    </div>
                    <button onClick={() => removePuzzle(p.id)} className="text-red-400 hover:text-red-300 text-xs shrink-0">✕</button>
                  </div>
                ))}
                {puzzles.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-2">No puzzles yet. Load a pack above or add manually.</p>
                )}
              </div>
            </div>

            <button onClick={startGame}
              disabled={!s.teamA || !s.teamB || !s.teamC || puzzles.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black py-4 rounded-xl text-lg">
              Start Mystery Chain →
            </button>
          </div>
        )}

        {/* ── STORY ── */}
        {s.phase === 'story' && (
          <div className="space-y-4">
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6">
              <p className="text-purple-300 text-xs font-bold uppercase tracking-widest mb-3">Opening Scenario</p>
              <p className="text-white text-base leading-relaxed">{s.openingStory || '(No opening story set)'}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[{name:s.teamA,q:s.queueA.length},{name:s.teamB,q:s.queueB.length},{name:s.teamC,q:s.queueC.length}].map((t,i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                  <p className="text-slate-300 text-sm font-semibold">{t.name}</p>
                  <p className="text-slate-500 text-xs">{t.q} puzzles</p>
                </div>
              ))}
            </div>
            <button onClick={() => startTeam('a_playing')}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-4 rounded-xl text-lg">
              ▶ Start {s.teamA}
            </button>
          </div>
        )}

        {/* ── PLAYING ── */}
        {isPlaying && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-bold">{currentTeamName} is playing</span>
                <span className="text-slate-400 text-sm">{currentQueue.length} left in queue</span>
              </div>
              <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: timerColor }} />
              </div>
              <p className="text-center font-black text-5xl mt-2" style={{ color: timerColor }}>{fmtTime(timeLeft)}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[{name:s.teamA,score:s.scoreA,k:'A'},{name:s.teamB,score:s.scoreB,k:'B'},{name:s.teamC,score:s.scoreC,k:'C'}].map(t => {
                const active = (s.phase === 'a_playing' && t.k==='A') || (s.phase === 'b_playing' && t.k==='B') || (s.phase === 'c_playing' && t.k==='C')
                return (
                  <div key={t.k} className={`rounded-xl p-3 text-center border ${active ? 'bg-purple-600/20 border-purple-500' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-slate-300 text-xs font-semibold truncate">{t.name}</p>
                    <p className="text-white text-2xl font-black">{t.score}</p>
                  </div>
                )
              })}
            </div>

            {currentRevealed.length > 0 && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-2">Story Unlocked So Far</p>
                <div className="space-y-1">
                  {currentRevealed.map((snippet, i) => (
                    <p key={i} className="text-blue-100 text-sm leading-relaxed">
                      <span className="text-blue-400 font-bold mr-1">{i + 1}.</span>{snippet}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {currentPuzzle ? (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-slate-400 text-sm flex-1">Clue: <span className="text-white font-semibold">{currentPuzzle.clue}</span></p>
                  <button onClick={reveal} className={`text-xs px-3 py-1 rounded-lg border font-semibold shrink-0 ${s.revealed ? 'bg-green-600/30 border-green-500 text-green-300' : 'bg-white/5 border-white/20 text-slate-400'}`}>
                    {s.revealed ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <p className="text-[#f5a623] text-4xl font-black tracking-[0.25em] text-center">{currentPuzzle.scrambled}</p>
                {s.revealed && (
                  <p className="text-green-400 text-xl font-bold text-center">{currentPuzzle.answer}</p>
                )}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-slate-500">
                No more puzzles in queue
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => action('correct')}
                className="py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm">
                ✓ Correct<br/><span className="text-xs font-normal opacity-75">+{MC_PTS} pts · story revealed</span>
              </button>
              <button onClick={() => action('wrong')}
                className="py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm border border-red-500/30">
                ✗ Wrong<br/><span className="text-xs font-normal opacity-75">Recycle to back</span>
              </button>
              <button onClick={() => action('skip')}
                className="py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10">
                ↷ Skip<br/><span className="text-xs font-normal opacity-75">Recycle to back</span>
              </button>
            </div>

            <button onClick={nextTeam}
              className="w-full border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 py-3 rounded-xl text-sm font-semibold">
              {s.phase === 'c_playing' ? 'End Round →' : `Time Up — Move to ${s.phase === 'a_playing' ? s.teamB : s.teamC} →`}
            </button>
          </div>
        )}

        {/* ── DONE ── */}
        {s.phase === 'done' && (
          <div className="space-y-4">
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-6">
              <p className="text-[#f5a623] text-xs font-bold uppercase tracking-widest text-center mb-4">
                Final Results — {s.packTitle}
              </p>
              <div className="space-y-3">
                {[{name:s.teamA,score:s.scoreA,rev:s.revealedA},{name:s.teamB,score:s.scoreB,rev:s.revealedB},{name:s.teamC,score:s.scoreC,rev:s.revealedC}]
                  .sort((a,b) => b.score - a.score)
                  .map((t, i) => (
                    <div key={t.name} className="bg-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{['🥇','🥈','🥉'][i]}</span>
                          <span className="text-white font-bold">{t.name}</span>
                        </div>
                        <span className="text-white text-2xl font-black">{t.score} pts</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1 ml-9">{t.rev.length} story clues unlocked</p>
                    </div>
                  ))
                }
              </div>
            </div>
            <button onClick={reset} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl">
              Start New Game
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
