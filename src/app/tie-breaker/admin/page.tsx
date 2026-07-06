'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'
import { supabase } from '@/lib/supabase'

const CHANNEL = 'tie:state'

type RegisteredTeam = { id: string; name: string; school: string }

type TBQuestion = { id: string; text: string; answer: string }

type TBState = {
  phase: 'setup' | 'live' | 'won'
  teamA: string
  teamB: string
  scoreA: number    // score coming in from prior rounds (informational)
  scoreB: number
  questions: TBQuestion[]
  currentIdx: number
  buzzedBy: 'A' | 'B' | null
  triedThisQ: ('A' | 'B')[]
  winner: 'A' | 'B' | null
}

// A default question bank the host can edit. General-knowledge / mixed —
// meant as a fallback set to keep the tie-breaker moving.
const DEFAULT_QUESTIONS: Omit<TBQuestion, 'id'>[] = [
  { text: 'What is the capital of Nigeria?', answer: 'Abuja' },
  { text: 'How many states are there in Nigeria?', answer: '36' },
  { text: 'Who is credited with inventing the light bulb?', answer: 'Thomas Edison' },
  { text: 'What is the largest planet in our solar system?', answer: 'Jupiter' },
  { text: 'What is the chemical symbol for gold?', answer: 'Au' },
  { text: 'What is the tallest mountain in the world?', answer: 'Mount Everest' },
  { text: 'Who wrote the play "Romeo and Juliet"?', answer: 'William Shakespeare' },
  { text: 'What is the speed of light in km per second (approximately)?', answer: '300,000' },
  { text: 'In which continent is the Sahara desert located?', answer: 'Africa' },
  { text: 'What year did Nigeria gain independence?', answer: '1960' },
  { text: 'How many bones are there in the adult human body?', answer: '206' },
  { text: 'What is the smallest prime number?', answer: '2' },
  { text: 'Which planet is known as the Red Planet?', answer: 'Mars' },
  { text: 'What is the currency of Ghana?', answer: 'Cedi' },
  { text: 'Who painted the Mona Lisa?', answer: 'Leonardo da Vinci' },
]

const DEFAULT_STATE: TBState = {
  phase: 'setup',
  teamA: '', teamB: '',
  scoreA: 0, scoreB: 0,
  questions: DEFAULT_QUESTIONS.map(q => ({ ...q, id: crypto.randomUUID() })),
  currentIdx: 0,
  buzzedBy: null,
  triedThisQ: [],
  winner: null,
}

export default function TieBreakerAdmin() {
  const [s, setS] = useState<TBState>(DEFAULT_STATE)
  const [teams, setTeams] = useState<RegisteredTeam[]>([])
  const [editingQ, setEditingQ] = useState<string | null>(null)
  const [newQ, setNewQ] = useState({ text: '', answer: '' })

  const skipBroadcast = useRef(true)
  const broadcast = useCallback((st: TBState) => wsBroadcast(CHANNEL, st), [])
  const update = useCallback((patch: Partial<TBState>) => {
    setS(prev => ({ ...prev, ...patch }))
  }, [])

  // Hydrate from any existing DB row when the page loads
  useEffect(() => {
    const unsub = wsSubscribe(CHANNEL, (payload) => {
      if (skipBroadcast.current) {
        skipBroadcast.current = false
        // Only take the incoming state if this is the first payload we see
        // and the current phase is still setup (we haven't done anything yet).
        setS(prev => prev.phase === 'setup' ? (payload as TBState) : prev)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (skipBroadcast.current) return
    broadcast(s)
  }, [s, broadcast])

  // Ensure any state change we make gets broadcast
  useEffect(() => {
    // Wait a tick before enabling broadcasts so we don't rebroadcast the initial default
    const t = setTimeout(() => { skipBroadcast.current = false }, 300)
    return () => clearTimeout(t)
  }, [])

  // Load registered teams for the dropdown
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('fsc_teams')
          .select('id, name, school')
          .eq('status', 'active')
          .order('name')
        if (!cancelled && data) setTeams(data as RegisteredTeam[])
      } catch { /* offline — dropdown just stays empty */ }
    })()
    return () => { cancelled = true }
  }, [])

  const currentQ = s.questions[s.currentIdx]

  function start() {
    if (!s.teamA.trim() || !s.teamB.trim()) return
    if (s.questions.length === 0) return
    update({ phase: 'live', currentIdx: 0, buzzedBy: null, triedThisQ: [], winner: null })
  }

  function buzz(team: 'A' | 'B') {
    if (s.phase !== 'live') return
    if (s.buzzedBy) return
    if (s.triedThisQ.includes(team)) return
    update({ buzzedBy: team })
  }

  function markCorrect() {
    if (!s.buzzedBy) return
    const winner = s.buzzedBy
    update({ phase: 'won', winner, buzzedBy: null })
  }

  function markWrong() {
    if (!s.buzzedBy) return
    const already = [...s.triedThisQ, s.buzzedBy] as ('A' | 'B')[]
    const other = s.buzzedBy === 'A' ? 'B' : 'A'
    if (!already.includes(other)) {
      // Other team gets a chance on the same question
      update({ buzzedBy: null, triedThisQ: already })
    } else {
      nextQuestion()
    }
  }

  function nextQuestion() {
    const nextIdx = s.currentIdx + 1
    if (nextIdx >= s.questions.length) {
      update({ currentIdx: 0, buzzedBy: null, triedThisQ: [] })
    } else {
      update({ currentIdx: nextIdx, buzzedBy: null, triedThisQ: [] })
    }
  }

  const reset = () => update({ ...DEFAULT_STATE, questions: s.questions })

  // Question editing
  const updateQ = (id: string, field: 'text' | 'answer', val: string) => {
    setS(p => ({ ...p, questions: p.questions.map(q => q.id === id ? { ...q, [field]: val } : q) }))
  }
  const deleteQ = (id: string) => {
    setS(p => ({ ...p, questions: p.questions.filter(q => q.id !== id) }))
  }
  const addQ = () => {
    if (!newQ.text.trim()) return
    setS(p => ({
      ...p,
      questions: [...p.questions, { id: crypto.randomUUID(), text: newQ.text.trim(), answer: newQ.answer.trim() }],
    }))
    setNewQ({ text: '', answer: '' })
  }

  return (
    <div className="h-screen bg-[#0a1628] text-white p-3 overflow-hidden">
      <div className="max-w-4xl mx-auto space-y-3 h-full overflow-y-auto pr-1">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">Admin Control</p>
            <h1 className="text-white text-lg font-black">🔔 Tie Breaker</h1>
          </div>
          <div className="flex gap-2">
            <a href="/tie-breaker/audience" target="_blank" rel="noopener noreferrer"
              className="text-xs bg-purple-600/30 border border-purple-500/40 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-600/50">
              Audience ↗
            </a>
            {s.phase !== 'setup' && (
              <button onClick={reset} className="text-xs bg-red-600/20 border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg">
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Setup */}
        {s.phase === 'setup' && (
          <div className="space-y-3">
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
              <h2 className="text-white font-bold text-sm">Team Names &amp; Prior Scores</h2>
              <p className="text-slate-400 text-xs">Prior scores are just for display — they don&apos;t affect the buzzer round.</p>
              <div className="grid grid-cols-2 gap-3">
                {(['A', 'B'] as const).map(letter => {
                  const nameKey = `team${letter}` as const
                  const scoreKey = `score${letter}` as const
                  return (
                    <div key={letter} className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Team {letter}</label>
                      {teams.length > 0 ? (
                        <select
                          value={s[nameKey]}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm">
                          <option value="">— select team —</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.name}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={s[nameKey]}
                          onChange={e => update({ [nameKey]: e.target.value } as Partial<TBState>)}
                          placeholder={`Team ${letter} name`}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm" />
                      )}
                      <input
                        type="number" min="0"
                        value={s[scoreKey] || ''}
                        onChange={e => update({ [scoreKey]: Number(e.target.value) || 0 } as Partial<TBState>)}
                        placeholder="Prior score"
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Questions */}
            <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">Buzzer Questions ({s.questions.length})</h2>
                <p className="text-[10px] text-slate-500">Edit or replace — {DEFAULT_QUESTIONS.length} are pre-loaded</p>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {s.questions.map((q, i) => (
                  <div key={q.id} className="bg-slate-800/60 rounded-lg p-2 flex items-start gap-2">
                    <span className="text-[10px] text-slate-500 font-bold w-5 shrink-0 mt-1">{i + 1}</span>
                    <div className="flex-1 space-y-1">
                      {editingQ === q.id ? (<>
                        <input
                          value={q.text}
                          onChange={e => updateQ(q.id, 'text', e.target.value)}
                          className="w-full bg-slate-700 border border-slate-500 rounded px-2 py-1 text-white text-xs"
                          placeholder="Question" autoFocus />
                        <input
                          value={q.answer}
                          onChange={e => updateQ(q.id, 'answer', e.target.value)}
                          className="w-full bg-slate-700 border border-green-500/40 rounded px-2 py-1 text-green-300 text-xs"
                          placeholder="Answer" />
                        <button onClick={() => setEditingQ(null)} className="text-[10px] text-purple-400 hover:text-purple-300">Done editing</button>
                      </>) : (<>
                        <p className="text-white text-xs leading-snug">{q.text}</p>
                        <p className={`text-[10px] ${q.answer ? 'text-green-400' : 'text-red-400/70 italic'}`}>
                          {q.answer ? `A: ${q.answer}` : '⚠ Answer not set'}
                        </p>
                      </>)}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {editingQ !== q.id && (
                        <button onClick={() => setEditingQ(q.id)} className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-700">Edit</button>
                      )}
                      <button onClick={() => deleteQ(q.id)} className="text-[10px] text-slate-600 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-slate-700">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-slate-800/40 rounded-lg p-2 space-y-1 border border-dashed border-slate-600">
                <input value={newQ.text} onChange={e => setNewQ(p => ({ ...p, text: e.target.value }))}
                  placeholder="New question…" className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-xs" />
                <input value={newQ.answer} onChange={e => setNewQ(p => ({ ...p, answer: e.target.value }))}
                  placeholder="Answer…" onKeyDown={e => e.key === 'Enter' && addQ()}
                  className="w-full bg-slate-700 border border-green-500/30 rounded px-2 py-1 text-green-300 text-xs" />
                <button onClick={addQ} disabled={!newQ.text.trim()}
                  className="text-[10px] bg-purple-600/40 hover:bg-purple-600/70 disabled:opacity-40 text-purple-300 px-2 py-1 rounded font-semibold">
                  + Add
                </button>
              </div>
            </div>

            <button onClick={start}
              disabled={!s.teamA.trim() || !s.teamB.trim() || s.questions.length === 0}
              className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl text-base">
              🔔 Start Buzzer Round →
            </button>
          </div>
        )}

        {/* Live buzzer round */}
        {s.phase === 'live' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-center">
                <p className="text-green-400 font-bold text-sm truncate">{s.teamA}</p>
                <p className="text-white text-2xl font-black">{s.scoreA}</p>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-center">
                <p className="text-blue-400 font-bold text-sm truncate">{s.teamB}</p>
                <p className="text-white text-2xl font-black">{s.scoreB}</p>
              </div>
            </div>

            <div className="text-center py-2 bg-pink-900/30 rounded-xl border border-pink-500/50">
              <p className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">Tie-Breaker · Buzzer Round</p>
              <p className="text-white text-sm font-bold mt-0.5">Question {s.currentIdx + 1} of {s.questions.length}</p>
            </div>

            {currentQ && (
              <div className="bg-[#0d1f3c] border border-slate-700 rounded-xl p-4 space-y-3">
                <p className="text-lg font-bold leading-snug text-center">{currentQ.text}</p>
                <div className="rounded-xl p-3 bg-green-500/15 border border-green-500/40 text-center">
                  <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Answer</p>
                  <p className="text-green-300 text-2xl font-black">{currentQ.answer}</p>
                </div>
              </div>
            )}

            {!s.buzzedBy && (<>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => buzz('A')} disabled={s.triedThisQ.includes('A')}
                  className="py-4 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-black text-white">
                  🔔 {s.teamA} Buzzes
                </button>
                <button onClick={() => buzz('B')} disabled={s.triedThisQ.includes('B')}
                  className="py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl font-black text-white">
                  🔔 {s.teamB} Buzzes
                </button>
              </div>
              <button onClick={nextQuestion}
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 rounded-lg text-xs">
                ↷ No one knows — Next question
              </button>
              {s.triedThisQ.length > 0 && (
                <p className="text-center text-slate-500 text-[11px] italic">
                  Already tried this one: {s.triedThisQ.map(t => t === 'A' ? s.teamA : s.teamB).join(' and ')}
                </p>
              )}
            </>)}

            {s.buzzedBy && (<>
              <p className="text-center text-sm">
                <span className={s.buzzedBy === 'A' ? 'text-green-400 font-bold' : 'text-blue-400 font-bold'}>
                  {s.buzzedBy === 'A' ? s.teamA : s.teamB}
                </span>
                {' '}buzzed in!
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={markCorrect}
                  className="py-4 bg-green-600 hover:bg-green-500 rounded-xl font-black text-white">
                  ✓ Correct · WINNER
                </button>
                <button onClick={markWrong}
                  className="py-4 bg-red-700 hover:bg-red-600 rounded-xl font-black text-white">
                  ✗ Wrong
                </button>
              </div>
            </>)}
          </div>
        )}

        {/* Winner declared */}
        {s.phase === 'won' && s.winner && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500 rounded-2xl p-6 text-center space-y-3">
              <p className="text-yellow-300 text-xs font-bold uppercase tracking-[0.3em]">Tie-Breaker Winner</p>
              <div className="text-6xl animate-bounce">🏆</div>
              <p className="text-white text-3xl font-black">
                {s.winner === 'A' ? s.teamA : s.teamB}
              </p>
              <p className="text-slate-300 text-sm">wins the buzzer round</p>
            </div>
            <button onClick={reset} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl">
              Run Another Tie-Breaker
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
