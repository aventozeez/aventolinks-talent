'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { SP_CHANNEL, type SpLiveState } from './types'

const TIMER_MS = 30000

function defaultState(): SpLiveState {
  return {
    phase: 'setup',
    teamAName: 'Team A',
    teamBName: 'Team B',
    scoreA: 0,
    scoreB: 0,
    problemTitle: '',
    problemStatement: '',
    stepsDisplay: [],
    stepsCorrect: [],
    timerStartedAt: null,
    timerDuration: TIMER_MS,
    teamASubmitted: false,
    teamBSubmitted: false,
    teamAAnswer: null,
    teamBAnswer: null,
    teamAStepScore: null,
    teamBStepScore: null,
    teamASpeedBonus: null,
    teamBSpeedBonus: null,
    teamASubmittedAt: null,
    teamBSubmittedAt: null,
  }
}

export default function SprintPlayScreen({ team }: { team: 'a' | 'b' }) {
  const [gameState, setGameState] = useState<SpLiveState>(defaultState())
  const [submitted, setSubmitted] = useState(false)
  const [items, setItems] = useState<string[]>([])
  const [countdown, setCountdown] = useState(30)
  const [hasMovedItem, setHasMovedItem] = useState(false)
  const [dots, setDots] = useState('')

  const stateRef = useRef<SpLiveState>(defaultState())
  const submittedRef = useRef(false)
  const itemsRef = useRef<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const dragIdxRef = useRef<number | null>(null)

  const color: 'blue' | 'purple' = team === 'a' ? 'blue' : 'purple'
  const accentBg = color === 'blue' ? 'bg-blue-600' : 'bg-purple-600'
  const accentText = color === 'blue' ? 'text-blue-300' : 'text-purple-300'
  const accentBorder = color === 'blue' ? 'border-blue-400' : 'border-purple-400'

  const applyState = (s: SpLiveState) => {
    const prev = stateRef.current
    stateRef.current = s
    setGameState(s)

    if (s.phase === 'playing' && (prev.phase !== 'playing' || prev.problemTitle !== s.problemTitle)) {
      submittedRef.current = false
      setSubmitted(false)
      setHasMovedItem(false)
      itemsRef.current = [...s.stepsDisplay]
      setItems([...s.stepsDisplay])
    }

    if (s.phase === 'setup') {
      submittedRef.current = false
      setSubmitted(false)
      setHasMovedItem(false)
    }

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (s.timerStartedAt && s.phase === 'playing') {
      const tick = () => {
        const elapsed = Date.now() - (stateRef.current.timerStartedAt ?? Date.now())
        const rem = Math.max(0, Math.ceil((TIMER_MS - elapsed) / 1000))
        setCountdown(rem)
        if (rem <= 0 && !submittedRef.current) handleAutoSubmit()
      }
      tick()
      timerRef.current = setInterval(tick, 200)
    }
  }

  const handleAutoSubmit = () => {
    if (submittedRef.current || !channelRef.current) return
    doSubmit(itemsRef.current)
  }

  const doSubmit = async (answer: string[]) => {
    if (submittedRef.current || !channelRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    await channelRef.current.send({
      type: 'broadcast',
      event: 'submit',
      payload: { team, answer, submittedAt: Date.now() },
    }).catch(() => {})
  }

  useEffect(() => {
    // ── 1. Initial DB load ────────────────────────────────────────────────────────
    ;(supabase as any).from('sc_sprint_session').select('*').eq('id', 'main').single()
      .then(({ data }: { data: SpLiveState | null }) => {
        if (data && data.phase && data.phase !== 'setup') applyState(data)
      }).catch(() => {})

    // ── 2. Broadcast — fast path ──────────────────────────────────────────────────
    const ch = supabase.channel(SP_CHANNEL)
    channelRef.current = ch
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applyState(payload as SpLiveState)
    })
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'ping', payload: {} }).catch(() => {})
      }
    })

    // ── 3. Postgres Changes — DB push ─────────────────────────────────────────────
    const pgCh = (supabase as any)
      .channel('sc_sp_team_db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sc_sprint_session', filter: 'id=eq.main' },
        (payload: { new: SpLiveState }) => { if (payload.new) applyState(payload.new) })
      .subscribe()

    // ── 4. DB poll every 2 s — cross-device fallback ──────────────────────────────
    const dbPoll = setInterval(async () => {
      try {
        const { data } = await (supabase as any)
          .from('sc_sprint_session').select('*').eq('id', 'main').single()
        if (data && data.phase) {
          const cur = stateRef.current
          if (data.phase !== cur.phase || data.problemTitle !== cur.problemTitle ||
              data.teamASubmitted !== cur.teamASubmitted || data.teamBSubmitted !== cur.teamBSubmitted) {
            applyState(data as SpLiveState)
          }
        }
      } catch { /* ignore */ }
    }, 2000)

    // ── 5. localStorage fallback — same-device ────────────────────────────────────
    const localPoll = setInterval(() => {
      try {
        const raw = localStorage.getItem('sc_sp_state')
        if (!raw) return
        const parsed: SpLiveState = JSON.parse(raw)
        if (parsed.phase !== stateRef.current.phase || parsed.problemTitle !== stateRef.current.problemTitle) {
          applyState(parsed)
        }
      } catch { /* ignore */ }
    }, 150)

    const dotsInt = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)

    return () => {
      supabase.removeChannel(ch)
      supabase.removeChannel(pgCh)
      clearInterval(dbPoll)
      clearInterval(localPoll)
      clearInterval(dotsInt)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── DnD ──────────────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragIdxRef.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    const from = dragIdxRef.current
    if (from === null || from === idx) return
    setItems(prev => {
      const next = [...prev]
      const [removed] = next.splice(from, 1)
      next.splice(idx, 0, removed)
      itemsRef.current = next
      return next
    })
    dragIdxRef.current = idx
    setHasMovedItem(true)
  }
  const handleDrop = () => { dragIdxRef.current = null }
  const moveUp = (idx: number) => {
    if (idx === 0) return
    setItems(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      itemsRef.current = next
      return next
    })
    setHasMovedItem(true)
  }
  const moveDown = (idx: number) => {
    if (idx === items.length - 1) return
    setItems(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      itemsRef.current = next
      return next
    })
    setHasMovedItem(true)
  }

  const {
    phase, teamAName, teamBName, scoreA, scoreB,
    problemTitle, problemStatement, stepsCorrect,
    teamAAnswer, teamBAnswer, teamAStepScore, teamBStepScore,
    teamASpeedBonus, teamBSpeedBonus,
  } = gameState

  const myName = team === 'a' ? teamAName : teamBName
  const oppName = team === 'a' ? teamBName : teamAName
  const myScore = team === 'a' ? scoreA : scoreB
  const oppScore = team === 'a' ? scoreB : scoreA
  const myAnswer = team === 'a' ? teamAAnswer : teamBAnswer
  const myStepScore = team === 'a' ? teamAStepScore : teamBStepScore
  const mySpeedBonus = team === 'a' ? teamASpeedBonus : teamBSpeedBonus

  // ─── SETUP ────────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">💡</div>
        <h1 className={`text-4xl font-black ${accentText}`}>{myName}</h1>
        <p className="text-xl text-slate-400">Waiting for sprint to begin{dots}</p>
        <div className="flex gap-2 mt-4">
          {[0, 1, 2].map(i => (
            <div key={i} className={`w-3 h-3 rounded-full ${color === 'blue' ? 'bg-blue-400' : 'bg-purple-400'}`}
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
      </div>
    )
  }

  // ─── DONE ─────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const won = myScore > oppScore
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-6xl">{won ? '🏆' : myScore === oppScore ? '🤝' : '💪'}</div>
        <h2 className="text-3xl font-black">Sprint Complete!</h2>
        <div className={`w-full max-w-xs py-8 rounded-3xl border-2 ${accentBorder} bg-white/5 text-center`}>
          <p className="text-sm text-slate-400 mb-1">{myName}</p>
          <p className={`text-7xl font-black ${accentText}`}>{myScore}</p>
        </div>
        <div className="w-full max-w-xs py-5 rounded-2xl border border-white/10 bg-white/5 text-center">
          <p className="text-sm text-slate-400 mb-1">{oppName}</p>
          <p className="text-5xl font-black text-slate-300">{oppScore}</p>
        </div>
      </div>
    )
  }

  // ─── PLAYING / REVEAL ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
      {/* Header */}
      <div className={`border-b border-white/10 px-5 py-3 flex items-center justify-between ${color === 'blue' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Your team</p>
          <p className={`text-lg font-black ${accentText}`}>{myName}</p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className={`text-2xl font-black ${accentText}`}>{myScore}</p>
            <p className="text-xs text-slate-500 truncate max-w-[80px]">{myName}</p>
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-center">
            <p className="text-2xl font-black text-slate-300">{oppScore}</p>
            <p className="text-xs text-slate-500 truncate max-w-[80px]">{oppName}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 py-6 gap-5 overflow-y-auto">

        {/* PLAYING — before submit */}
        {phase === 'playing' && !submitted && (
          <>
            <div className="bg-[#0d1f3c] border border-purple-500/30 rounded-2xl p-5">
              <h2 className="font-bold text-white text-lg mb-2">{problemTitle}</h2>
              <p className="text-slate-300 text-sm leading-relaxed">{problemStatement}</p>
            </div>
            <div className="flex items-center justify-between bg-[#070f1c] border border-white/10 rounded-xl px-5 py-3">
              <span className="text-sm text-slate-400">Time remaining</span>
              <span className={`text-2xl font-black ${countdown <= 5 ? 'text-red-400 animate-pulse' : accentText}`}>{countdown}s</span>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-400 text-center uppercase tracking-wider">Drag or tap arrows to order the steps</p>
              {items.map((item, idx) => (
                <div
                  key={item}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                  className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-4 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none"
                >
                  <span className="text-slate-500 text-lg">⠿</span>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-0.5">Step {idx + 1}</p>
                    <p className="text-sm text-white font-medium">{item}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs text-white">▲</button>
                    <button onClick={() => moveDown(idx)} disabled={idx === items.length - 1} className="p-1 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs text-white">▼</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => doSubmit(items)}
              className={`w-full py-4 ${accentBg} text-white font-black text-lg rounded-2xl active:scale-95 shadow-lg`}
              style={{ boxShadow: color === 'blue' ? '0 0 30px rgba(96,165,250,0.3)' : '0 0 30px rgba(167,139,250,0.3)' }}
            >
              SUBMIT ANSWER ✓
            </button>
          </>
        )}

        {/* PLAYING — after submit */}
        {phase === 'playing' && submitted && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            <div className="text-6xl">✓</div>
            <div className={`py-6 px-10 rounded-2xl border-2 ${accentBorder} bg-white/5`}>
              <p className="text-xl font-black text-white mb-2">Submitted!</p>
              <p className="text-slate-400">Waiting for {oppName}…</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-black ${countdown <= 5 ? 'text-red-400 animate-pulse' : accentText}`}>{countdown}s</span>
              <span className="text-slate-400 text-sm">remaining</span>
            </div>
          </div>
        )}

        {/* REVEAL */}
        {phase === 'reveal' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-black text-center">{problemTitle}</h2>
            <div className={`bg-[#0d1f3c] border-2 ${accentBorder} rounded-2xl p-5`}>
              <h3 className={`font-bold ${accentText} mb-3`}>Your Answer ({myName})</h3>
              <div className="space-y-2">
                {(myAnswer ?? items).map((step, i) => {
                  const isCorrect = step === stepsCorrect[i]
                  return (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${isCorrect ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <span className={`text-lg ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>{isCorrect ? '✓' : '✗'}</span>
                      <div>
                        <p className="text-xs text-slate-500">Step {i + 1}</p>
                        <p className={`text-sm font-medium ${isCorrect ? 'text-green-300' : 'text-red-300'}`}>{step}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="text-center mt-4 pt-3 border-t border-white/10">
                <p className="text-sm text-slate-400">Steps <span className={`${accentText} font-bold`}>+{myStepScore}</span> · Speed <span className="text-yellow-400 font-bold">+{mySpeedBonus}</span></p>
                <p className={`text-3xl font-black ${accentText} mt-1`}>+{(myStepScore ?? 0) + (mySpeedBonus ?? 0)} pts</p>
              </div>
            </div>
            <div className="bg-[#070f1c] border border-white/10 rounded-2xl p-4">
              <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-3">Correct Order</h3>
              <div className="space-y-2">
                {stepsCorrect.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <span className="w-5 h-5 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    <span className="text-sm text-slate-300">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
