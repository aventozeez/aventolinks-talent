'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { BZ_CHANNEL, type BzLiveState } from './buzzer/types'
import { SP_CHANNEL, type SpLiveState } from './sprint/types'

const BZ_TIMER_MS = 10000
const SP_TIMER_MS = 30000

function defaultBzState(): BzLiveState {
  return {
    phase: 'setup',
    teamAName: 'Team A',
    teamBName: 'Team B',
    scoreA: 0,
    scoreB: 0,
    questionText: '',
    questionSubject: '',
    questionIndex: 0,
    totalQuestions: 0,
    buzzedTeam: null,
    bonusTeam: null,
    buzzStartedAt: null,
    timerDuration: BZ_TIMER_MS,
  }
}

function defaultSpState(): SpLiveState {
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
    timerDuration: SP_TIMER_MS,
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

export default function TeamScreen({ team }: { team: 'a' | 'b' }) {
  // ── Buzzer state ───────────────────────────────────────────────────────────────
  const [bzState, setBzState] = useState<BzLiveState>(defaultBzState())
  const [buzzStatus, setBuzzStatus] = useState<'idle' | 'sent'>('idle')
  const [bzCountdown, setBzCountdown] = useState(10)

  const bzStateRef = useRef<BzLiveState>(defaultBzState())
  const bzChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const bzTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Sprint state ───────────────────────────────────────────────────────────────
  const [spState, setSpState] = useState<SpLiveState>(defaultSpState())
  const [submitted, setSubmitted] = useState(false)
  const [items, setItems] = useState<string[]>([])
  const [spCountdown, setSpCountdown] = useState(30)

  const spStateRef = useRef<SpLiveState>(defaultSpState())
  const spChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const spTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const submittedRef = useRef(false)
  const itemsRef = useRef<string[]>([])
  const dragIdxRef = useRef<number | null>(null)

  // ── Shared ─────────────────────────────────────────────────────────────────────
  const [dots, setDots] = useState('')

  const color: 'blue' | 'purple' = team === 'a' ? 'blue' : 'purple'
  const accentText  = color === 'blue' ? 'text-blue-300'    : 'text-purple-300'
  const accentBg    = color === 'blue' ? 'bg-blue-600'       : 'bg-purple-600'
  const accentBorder= color === 'blue' ? 'border-blue-400'   : 'border-purple-400'
  const accentBgLight=color === 'blue' ? 'bg-blue-500/20'    : 'bg-purple-500/20'
  const accentGlow  = color === 'blue'
    ? '0 0 80px rgba(96,165,250,0.5)'
    : '0 0 80px rgba(167,139,250,0.5)'

  // ── Buzzer helpers ─────────────────────────────────────────────────────────────
  const applyBzState = (s: BzLiveState) => {
    bzStateRef.current = s
    setBzState(s)
    if (s.phase === 'open') setBuzzStatus('idle')
    if (bzTimerRef.current) { clearInterval(bzTimerRef.current); bzTimerRef.current = null }
    if (s.buzzStartedAt && (s.phase === 'buzzed' || s.phase === 'bonus')) {
      const tick = () => {
        const elapsed = Date.now() - (bzStateRef.current.buzzStartedAt ?? Date.now())
        setBzCountdown(Math.max(0, Math.ceil((BZ_TIMER_MS - elapsed) / 1000)))
      }
      tick()
      bzTimerRef.current = setInterval(tick, 200)
    }
  }

  const handleBuzz = async () => {
    if (!bzChannelRef.current || buzzStatus !== 'idle') return
    setBuzzStatus('sent')
    try {
      await bzChannelRef.current.send({ type: 'broadcast', event: 'buzzed', payload: { team } })
    } catch { /* ignore */ }
  }

  // ── Sprint helpers ─────────────────────────────────────────────────────────────
  const doSubmit = async (answer: string[]) => {
    if (submittedRef.current || !spChannelRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    await spChannelRef.current.send({
      type: 'broadcast',
      event: 'submit',
      payload: { team, answer, submittedAt: Date.now() },
    }).catch(() => {})
  }

  const handleAutoSubmit = () => {
    if (submittedRef.current || !spChannelRef.current) return
    doSubmit(itemsRef.current)
  }

  const applySpState = (s: SpLiveState) => {
    const prev = spStateRef.current
    spStateRef.current = s
    setSpState(s)

    if (s.phase === 'playing' && (prev.phase !== 'playing' || prev.problemTitle !== s.problemTitle)) {
      submittedRef.current = false
      setSubmitted(false)
      itemsRef.current = [...s.stepsDisplay]
      setItems([...s.stepsDisplay])
    }
    if (s.phase === 'setup') {
      submittedRef.current = false
      setSubmitted(false)
    }

    if (spTimerRef.current) { clearInterval(spTimerRef.current); spTimerRef.current = null }
    if (s.timerStartedAt && s.phase === 'playing') {
      const tick = () => {
        const elapsed = Date.now() - (spStateRef.current.timerStartedAt ?? Date.now())
        const rem = Math.max(0, Math.ceil((SP_TIMER_MS - elapsed) / 1000))
        setSpCountdown(rem)
        if (rem <= 0 && !submittedRef.current) handleAutoSubmit()
      }
      tick()
      spTimerRef.current = setInterval(tick, 200)
    }
  }

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────────
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
  }
  const moveDown = (idx: number) => {
    if (idx === items.length - 1) return
    setItems(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      itemsRef.current = next
      return next
    })
  }

  // ── Effects ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // ── 1. Initial DB load — immediately shows current state when opening mid-round
    const loadFromDB = async () => {
      try {
        const { data } = await (supabase as any)
          .from('sc_buzzer_session').select('*').eq('id', 'main').single()
        if (data && data.phase && data.phase !== 'setup') applyBzState(data as BzLiveState)
      } catch { /* table may not exist yet */ }
      try {
        const { data } = await (supabase as any)
          .from('sc_sprint_session').select('*').eq('id', 'main').single()
        if (data && data.phase && data.phase !== 'setup') applySpState(data as SpLiveState)
      } catch { /* table may not exist yet */ }
    }
    loadFromDB()

    // ── 2. Broadcast channels — fast path (sub-second) ──────────────────────────
    const bzCh = supabase.channel(BZ_CHANNEL)
    bzChannelRef.current = bzCh
    bzCh.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applyBzState(payload as BzLiveState)
    })
    bzCh.subscribe((status) => {
      if (status === 'SUBSCRIBED') bzCh.send({ type: 'broadcast', event: 'ping', payload: {} }).catch(() => {})
    })

    const spCh = supabase.channel(SP_CHANNEL)
    spChannelRef.current = spCh
    spCh.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applySpState(payload as SpLiveState)
    })
    spCh.subscribe((status) => {
      if (status === 'SUBSCRIBED') spCh.send({ type: 'broadcast', event: 'ping', payload: {} }).catch(() => {})
    })

    // ── 3. Postgres Changes — reliable DB push (works even if broadcast drops) ──
    const pgCh = (supabase as any)
      .channel('sc_team_db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sc_buzzer_session', filter: 'id=eq.main' },
        (payload: { new: BzLiveState }) => { if (payload.new) applyBzState(payload.new) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sc_sprint_session', filter: 'id=eq.main' },
        (payload: { new: SpLiveState }) => { if (payload.new) applySpState(payload.new) })
      .subscribe()

    // ── 4. DB poll every 2 s — cross-device fallback if Realtime isn't enabled ──
    const dbPoll = setInterval(async () => {
      try {
        const { data: bz } = await (supabase as any)
          .from('sc_buzzer_session').select('*').eq('id', 'main').single()
        if (bz && bz.phase) {
          const cur = bzStateRef.current
          if (bz.phase !== cur.phase || bz.questionIndex !== cur.questionIndex ||
              bz.buzzedTeam !== cur.buzzedTeam || bz.bonusTeam !== cur.bonusTeam) {
            applyBzState(bz as BzLiveState)
          }
        }
      } catch { /* ignore */ }
      try {
        const { data: sp } = await (supabase as any)
          .from('sc_sprint_session').select('*').eq('id', 'main').single()
        if (sp && sp.phase) {
          const cur = spStateRef.current
          if (sp.phase !== cur.phase || sp.problemTitle !== cur.problemTitle ||
              sp.teamASubmitted !== cur.teamASubmitted || sp.teamBSubmitted !== cur.teamBSubmitted) {
            applySpState(sp as SpLiveState)
          }
        }
      } catch { /* ignore */ }
    }, 2000)

    // ── 5. localStorage polling — same-device / same-browser fallback ───────────
    const localPoll = setInterval(() => {
      try {
        const bzRaw = localStorage.getItem('sc_bz_state')
        if (bzRaw) {
          const p: BzLiveState = JSON.parse(bzRaw)
          if (
            p.phase !== bzStateRef.current.phase ||
            p.questionIndex !== bzStateRef.current.questionIndex ||
            p.buzzedTeam !== bzStateRef.current.buzzedTeam ||
            p.bonusTeam !== bzStateRef.current.bonusTeam
          ) applyBzState(p)
        }
        const spRaw = localStorage.getItem('sc_sp_state')
        if (spRaw) {
          const p: SpLiveState = JSON.parse(spRaw)
          if (p.phase !== spStateRef.current.phase || p.problemTitle !== spStateRef.current.problemTitle) {
            applySpState(p)
          }
        }
      } catch { /* ignore */ }
    }, 150)

    const dotsInt = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)

    return () => {
      supabase.removeChannel(bzCh)
      supabase.removeChannel(spCh)
      supabase.removeChannel(pgCh)
      clearInterval(dbPoll)
      clearInterval(localPoll)
      clearInterval(dotsInt)
      if (bzTimerRef.current) clearInterval(bzTimerRef.current)
      if (spTimerRef.current) clearInterval(spTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active round detection ─────────────────────────────────────────────────────
  //   Sprint > Buzzer > Waiting (Rapid Fire or between rounds)
  const activeRound =
    spState.phase !== 'setup' ? 'sprint' :
    bzState.phase !== 'setup' ? 'buzzer' :
    'waiting'

  // ══════════════════════════════════════════════════════════════════════════════
  // WAITING (Rapid Fire in progress or between rounds)
  // ══════════════════════════════════════════════════════════════════════════════
  if (activeRound === 'waiting') {
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">⚡</div>
        <h1 className={`text-4xl font-black ${accentText}`}>
          {team === 'a' ? 'Team A' : 'Team B'}
        </h1>
        <p className="text-xl text-slate-400">Watch the main screen{dots}</p>
        <p className="text-sm text-slate-600 mt-2 text-center max-w-xs">
          Your buzzer and sprint controls will appear here when your round begins
        </p>
        <div className="flex gap-2 mt-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${color === 'blue' ? 'bg-blue-400' : 'bg-purple-400'}`}
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:0.2;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // BUZZER ROUND
  // ══════════════════════════════════════════════════════════════════════════════
  if (activeRound === 'buzzer') {
    const {
      phase: bzPhase,
      teamAName: bzTeamA, teamBName: bzTeamB,
      scoreA: bzScoreA, scoreB: bzScoreB,
      questionText, questionSubject,
      buzzedTeam, bonusTeam,
      questionIndex, totalQuestions,
    } = bzState

    const bzMyName  = team === 'a' ? bzTeamA  : bzTeamB
    const bzOppName = team === 'a' ? bzTeamB  : bzTeamA
    const bzMyScore = team === 'a' ? bzScoreA : bzScoreB
    const bzOppScore= team === 'a' ? bzScoreB : bzScoreA

    const isBuzzedMe = buzzedTeam === team
    const isBonusMe  = bonusTeam  === team
    const isCountingDown = (bzPhase === 'buzzed' && isBuzzedMe) || (bzPhase === 'bonus' && isBonusMe)
    const isRed = bzCountdown <= 3

    if (bzPhase === 'done') {
      const won = bzMyScore > bzOppScore; const tied = bzMyScore === bzOppScore
      return (
        <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-6xl">{won ? '🏆' : tied ? '🤝' : '💪'}</div>
          <h2 className="text-3xl font-black text-white">Buzzer Round Complete!</h2>
          <div className={`w-full max-w-xs py-8 rounded-3xl border-2 ${accentBorder} ${accentBgLight} text-center`}>
            <p className="text-sm text-slate-400 mb-1">{bzMyName}</p>
            <p className={`text-7xl font-black ${accentText}`}>{bzMyScore}</p>
          </div>
          <div className="w-full max-w-xs py-5 rounded-2xl border border-white/10 bg-white/5 text-center">
            <p className="text-sm text-slate-400 mb-1">{bzOppName}</p>
            <p className="text-5xl font-black text-slate-300">{bzOppScore}</p>
          </div>
          <p className={`text-lg font-bold ${won ? 'text-yellow-400' : tied ? 'text-slate-300' : 'text-slate-400'}`}>
            {won ? 'Your team wins! 🎉' : tied ? "It's a tie!" : 'Better luck next time!'}
          </p>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
        {/* Top bar */}
        <div className={`border-b border-white/10 px-5 py-3 flex items-center justify-between ${accentBgLight}`}>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest">Your team</p>
            <p className={`text-lg font-black ${accentText}`}>{bzMyName}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className={`text-2xl font-black ${accentText}`}>{bzMyScore}</p>
              <p className="text-xs text-slate-500 truncate max-w-[80px]">{bzMyName}</p>
            </div>
            <span className="text-slate-600 text-lg">|</span>
            <div className="text-center">
              <p className="text-2xl font-black text-slate-300">{bzOppScore}</p>
              <p className="text-xs text-slate-500 truncate max-w-[80px]">{bzOppName}</p>
            </div>
          </div>
        </div>

        {totalQuestions > 0 && (
          <div className="px-5 py-1.5 bg-[#050d1a] border-b border-white/5 text-center">
            <p className="text-xs text-slate-500">Question {questionIndex + 1} of {totalQuestions}</p>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">
          {questionText && (
            <div className="w-full max-w-lg text-center">
              {questionSubject && (
                <p className={`text-xs uppercase tracking-widest mb-3 ${accentText} opacity-70`}>{questionSubject}</p>
              )}
              <p className="text-2xl font-semibold text-white leading-relaxed">{questionText}</p>
            </div>
          )}

          {(bzPhase === 'ready' || bzPhase === 'open') && (
            <div className="w-full max-w-sm">
              <button
                onClick={handleBuzz}
                disabled={buzzStatus === 'sent'}
                className={`w-full py-28 text-white font-black text-5xl rounded-3xl transition-all select-none
                  ${buzzStatus === 'sent'
                    ? `opacity-60 scale-95 cursor-not-allowed ${accentBg}`
                    : `${accentBg} hover:brightness-110 active:scale-95`}`}
                style={{ boxShadow: buzzStatus === 'sent' ? 'none' : accentGlow }}
              >
                ⚡<br />
                <span className="text-3xl mt-2 block">{buzzStatus === 'sent' ? 'Buzzing…' : 'BUZZ!'}</span>
              </button>
            </div>
          )}

          {bzPhase === 'buzzed' && (
            <div className="w-full max-w-sm">
              {isBuzzedMe ? (
                <div className={`py-10 rounded-3xl border-4 ${accentBorder} ${accentBgLight} text-center`}>
                  <p className="text-slate-300 text-lg mb-1">YOU BUZZED IN!</p>
                  <p className="text-slate-300 mb-4">Answer now —</p>
                  <p className={`text-8xl font-black ${isRed ? 'text-red-400' : accentText}`}>{bzCountdown}</p>
                  <p className="text-slate-400 text-sm mt-2">seconds remaining</p>
                </div>
              ) : (
                <div className="py-10 rounded-3xl border border-white/10 bg-white/5 text-center">
                  <div className="text-4xl mb-3">🔔</div>
                  <p className="text-xl font-bold text-slate-300">{bzOppName} buzzed first</p>
                  <p className="text-slate-500 mt-2">Wait for your bonus chance…</p>
                </div>
              )}
            </div>
          )}

          {bzPhase === 'bonus' && (
            <div className="w-full max-w-sm">
              {isBonusMe ? (
                <div className="py-10 rounded-3xl border-4 border-yellow-400/60 bg-yellow-500/10 text-center">
                  <div className="text-4xl mb-2">🎯</div>
                  <p className="text-2xl font-black text-yellow-300">BONUS CHANCE!</p>
                  <p className="text-yellow-400 text-sm mt-1 mb-4">+5 points if correct</p>
                  <p className={`text-8xl font-black ${isRed ? 'text-red-400' : 'text-yellow-300'}`}>{bzCountdown}</p>
                  <p className="text-slate-400 text-sm mt-2">seconds remaining</p>
                </div>
              ) : (
                <div className="py-10 rounded-3xl border border-white/10 bg-white/5 text-center">
                  <div className="text-3xl mb-3">⏳</div>
                  <p className="text-xl font-bold text-slate-300">{bzOppName} has the bonus</p>
                  <p className="text-slate-500 mt-2">Next question coming up…</p>
                </div>
              )}
            </div>
          )}

          {isCountingDown && (
            <CountdownRing value={bzCountdown} isRed={isRed} color={color} />
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SPRINT ROUND (activeRound === 'sprint')
  // ══════════════════════════════════════════════════════════════════════════════
  const {
    phase: spPhase,
    teamAName: spTeamA, teamBName: spTeamB,
    scoreA: spScoreA, scoreB: spScoreB,
    problemTitle, problemStatement, stepsCorrect,
    teamAAnswer, teamBAnswer,
    teamAStepScore, teamBStepScore,
    teamASpeedBonus, teamBSpeedBonus,
  } = spState

  const spMyName  = team === 'a' ? spTeamA  : spTeamB
  const spOppName = team === 'a' ? spTeamB  : spTeamA
  const spMyScore = team === 'a' ? spScoreA : spScoreB
  const spOppScore= team === 'a' ? spScoreB : spScoreA
  const myAnswer    = team === 'a' ? teamAAnswer    : teamBAnswer
  const myStepScore = team === 'a' ? teamAStepScore : teamBStepScore
  const mySpeedBonus= team === 'a' ? teamASpeedBonus: teamBSpeedBonus
  const spIsRed = spCountdown <= 5

  if (spPhase === 'done') {
    const won = spMyScore > spOppScore
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-6xl">{won ? '🏆' : spMyScore === spOppScore ? '🤝' : '💪'}</div>
        <h2 className="text-3xl font-black">Sprint Complete!</h2>
        <div className={`w-full max-w-xs py-8 rounded-3xl border-2 ${accentBorder} bg-white/5 text-center`}>
          <p className="text-sm text-slate-400 mb-1">{spMyName}</p>
          <p className={`text-7xl font-black ${accentText}`}>{spMyScore}</p>
        </div>
        <div className="w-full max-w-xs py-5 rounded-2xl border border-white/10 bg-white/5 text-center">
          <p className="text-sm text-slate-400 mb-1">{spOppName}</p>
          <p className="text-5xl font-black text-slate-300">{spOppScore}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
      {/* Header */}
      <div className={`border-b border-white/10 px-5 py-3 flex items-center justify-between ${accentBgLight}`}>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Your team</p>
          <p className={`text-lg font-black ${accentText}`}>{spMyName}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className={`text-2xl font-black ${accentText}`}>{spMyScore}</p>
            <p className="text-xs text-slate-500 truncate max-w-[80px]">{spMyName}</p>
          </div>
          <span className="text-slate-600">|</span>
          <div className="text-center">
            <p className="text-2xl font-black text-slate-300">{spOppScore}</p>
            <p className="text-xs text-slate-500 truncate max-w-[80px]">{spOppName}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 py-6 gap-5 overflow-y-auto">

        {/* PLAYING — before submit */}
        {spPhase === 'playing' && !submitted && (
          <>
            <div className="bg-[#0d1f3c] border border-purple-500/30 rounded-2xl p-5">
              <h2 className="font-bold text-white text-lg mb-2">{problemTitle}</h2>
              <p className="text-slate-300 text-sm leading-relaxed">{problemStatement}</p>
            </div>
            <div className="flex items-center justify-between bg-[#070f1c] border border-white/10 rounded-xl px-5 py-3">
              <span className="text-sm text-slate-400">Time remaining</span>
              <span className={`text-2xl font-black ${spIsRed ? 'text-red-400 animate-pulse' : accentText}`}>{spCountdown}s</span>
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
        {spPhase === 'playing' && submitted && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
            <div className="text-6xl">✓</div>
            <div className={`py-6 px-10 rounded-2xl border-2 ${accentBorder} bg-white/5`}>
              <p className="text-xl font-black text-white mb-2">Submitted!</p>
              <p className="text-slate-400">Waiting for {spOppName}…</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-black ${spIsRed ? 'text-red-400 animate-pulse' : accentText}`}>{spCountdown}s</span>
              <span className="text-slate-400 text-sm">remaining</span>
            </div>
          </div>
        )}

        {/* REVEAL */}
        {spPhase === 'reveal' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-black text-center">{problemTitle}</h2>
            <div className={`bg-[#0d1f3c] border-2 ${accentBorder} rounded-2xl p-5`}>
              <h3 className={`font-bold ${accentText} mb-3`}>Your Answer ({spMyName})</h3>
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
                <p className="text-sm text-slate-400">
                  Steps <span className={`${accentText} font-bold`}>+{myStepScore}</span>
                  {' · '}Speed <span className="text-yellow-400 font-bold">+{mySpeedBonus}</span>
                </p>
                <p className={`text-3xl font-black ${accentText} mt-1`}>
                  +{(myStepScore ?? 0) + (mySpeedBonus ?? 0)} pts
                </p>
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

function CountdownRing({ value, isRed, color }: { value: number; isRed: boolean; color: 'blue' | 'purple' }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 10) * circ
  const stroke = isRed ? '#ef4444' : color === 'blue' ? '#60a5fa' : '#a78bfa'
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle
          cx="56" cy="56" r={r} fill="none"
          stroke={stroke} strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <span className={`text-4xl font-black ${isRed ? 'text-red-400' : color === 'blue' ? 'text-blue-300' : 'text-purple-300'}`}>{value}</span>
    </div>
  )
}
