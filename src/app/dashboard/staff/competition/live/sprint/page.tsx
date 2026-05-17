'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Lightbulb, Trophy, ArrowLeft, Loader2, ChevronRight, Monitor, Play } from 'lucide-react'

// ─── Shared types (re-exported from types.ts) ───────────────────────────────
export { SP_CHANNEL, type SpPhase, type SpLiveState } from './types'
import type { SpPhase, SpLiveState } from './types'
import { SP_CHANNEL } from './types'

// ─── Internal types ──────────────────────────────────────────────────────────
type SprintProblem = {
  id: string
  title: string
  statement: string
  step1: string
  step2: string
  step3: string
  step4: string
  step5: string
}

type MatchData = {
  teamA: { id: string; team_name: string }
  teamB: { id: string; team_name: string }
  phase: string
  rfScores: number[]
  bzScores: number[]
  spScores: number[]
  rfPoolIds: string[]
  bzSetId: string
  spSetId: string
}

type Submission = {
  team: 'a' | 'b'
  answer: string[]
  submittedAt: number
}

const TIMER_MS = 30000

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function calcSpeedBonus(submittedAt: number | null, startedAt: number): number {
  if (!submittedAt) return 0
  const elapsed = submittedAt - startedAt
  if (elapsed < 10000) return 20
  if (elapsed < 20000) return 10
  return 0
}

function calcStepScore(answer: string[], correct: string[]): number {
  return answer.reduce((sum, step, i) => sum + (step === correct[i] ? 10 : 0), 0)
}

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

// ─── Component ────────────────────────────────────────────────────────────────
export default function SprintAdminPage() {
  const router = useRouter()

  // State
  const [phase, setPhase] = useState<SpPhase>('setup')
  const [problems, setProblems] = useState<SprintProblem[]>([])
  const [loading, setLoading] = useState(true)
  const [matchMode, setMatchMode] = useState(false)
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [teamAName, setTeamAName] = useState('Team A')
  const [teamBName, setTeamBName] = useState('Team B')
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [currentProblem, setCurrentProblem] = useState<SprintProblem | null>(null)
  const [usedProblemIds, setUsedProblemIds] = useState<Set<string>>(new Set())
  const [stepsDisplay, setStepsDisplay] = useState<string[]>([])
  const [countdown, setCountdown] = useState(30)

  // Submission tracking
  const [teamASubmitted, setTeamASubmitted] = useState(false)
  const [teamBSubmitted, setTeamBSubmitted] = useState(false)
  const subARef = useRef<Submission | null>(null)
  const subBRef = useRef<Submission | null>(null)

  // Reveal state
  const [revealState, setRevealState] = useState<Partial<SpLiveState> | null>(null)

  // Refs for stale-closure safety
  const phaseRef = useRef<SpPhase>('setup')
  const scoreARef = useRef(0)
  const scoreBRef = useRef(0)
  const teamANameRef = useRef('Team A')
  const teamBNameRef = useRef('Team B')
  const currentProblemRef = useRef<SprintProblem | null>(null)
  const stepsDisplayRef = useRef<string[]>([])
  const stepsCorrectRef = useRef<string[]>([])
  const timerStartedAtRef = useRef<number | null>(null)
  const teamASubmittedRef = useRef(false)
  const teamBSubmittedRef = useRef(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revealCalledRef = useRef(false)

  const updatePhase = (p: SpPhase) => { phaseRef.current = p; setPhase(p) }
  const updateScoreA = (v: number) => { scoreARef.current = v; setScoreA(v) }
  const updateScoreB = (v: number) => { scoreBRef.current = v; setScoreB(v) }

  // ─── Broadcast ──────────────────────────────────────────────────────────────
  const broadcast = useCallback((overrides: Partial<SpLiveState> = {}) => {
    const prob = currentProblemRef.current
    const state: SpLiveState = {
      phase: phaseRef.current,
      teamAName: teamANameRef.current,
      teamBName: teamBNameRef.current,
      scoreA: scoreARef.current,
      scoreB: scoreBRef.current,
      problemTitle: prob?.title ?? '',
      problemStatement: prob?.statement ?? '',
      stepsDisplay: stepsDisplayRef.current,
      stepsCorrect: [],  // hidden during playing
      timerStartedAt: timerStartedAtRef.current,
      timerDuration: TIMER_MS,
      teamASubmitted: teamASubmittedRef.current,
      teamBSubmitted: teamBSubmittedRef.current,
      teamAAnswer: null,
      teamBAnswer: null,
      teamAStepScore: null,
      teamBStepScore: null,
      teamASpeedBonus: null,
      teamBSpeedBonus: null,
      teamASubmittedAt: null,
      teamBSubmittedAt: null,
      ...overrides,
    }

    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'state', payload: state }).catch(() => {})
    }

    try { localStorage.setItem('sc_sp_state', JSON.stringify(state)) } catch { /* ignore */ }

    ;(supabase as any)
      .from('sc_sprint_session')
      .upsert({ id: 'main', ...state, updated_at: new Date().toISOString() })
      .then(() => {})
      .catch(() => {})
  }, [])

  // ─── Timer ──────────────────────────────────────────────────────────────────
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const doReveal = useCallback(() => {
    if (revealCalledRef.current) return
    revealCalledRef.current = true
    stopTimer()

    const correct = stepsCorrectRef.current
    const startedAt = timerStartedAtRef.current ?? Date.now()

    const aAns = subARef.current?.answer ?? stepsDisplayRef.current
    const bAns = subBRef.current?.answer ?? stepsDisplayRef.current
    const aAt = subARef.current?.submittedAt ?? null
    const bAt = subBRef.current?.submittedAt ?? null

    const aStep = calcStepScore(aAns, correct)
    const bStep = calcStepScore(bAns, correct)
    const aSpeed = calcSpeedBonus(aAt, startedAt)
    const bSpeed = calcSpeedBonus(bAt, startedAt)

    const newA = scoreARef.current + aStep + aSpeed
    const newB = scoreBRef.current + bStep + bSpeed
    updateScoreA(newA)
    updateScoreB(newB)
    scoreARef.current = newA
    scoreBRef.current = newB

    updatePhase('reveal')

    const rev: Partial<SpLiveState> = {
      phase: 'reveal',
      scoreA: newA,
      scoreB: newB,
      stepsCorrect: correct,
      teamAAnswer: aAns,
      teamBAnswer: bAns,
      teamAStepScore: aStep,
      teamBStepScore: bStep,
      teamASpeedBonus: aSpeed,
      teamBSpeedBonus: bSpeed,
      teamASubmittedAt: aAt,
      teamBSubmittedAt: bAt,
    }
    setRevealState(rev)
    broadcast(rev)
  }, [broadcast])

  const startTimer = useCallback(() => {
    revealCalledRef.current = false
    stopTimer()
    const startMs = Date.now()
    timerStartedAtRef.current = startMs
    setCountdown(30)

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startMs
      const rem = Math.max(0, Math.ceil((TIMER_MS - elapsed) / 1000))
      setCountdown(rem)
      if (rem <= 0) { stopTimer(); doReveal() }
    }, 200)
  }, [doReveal])

  // ─── Load problems ───────────────────────────────────────────────────────────
  const loadProblems = useCallback(async (spSetId?: string) => {
    setLoading(true)
    let data: SprintProblem[] = []

    if (spSetId) {
      const { data: pData } = await (supabase as any)
        .from('sc_sprint_problems')
        .select('*')
        .eq('set_id', spSetId)
      data = pData || []
    }

    if (data.length === 0) {
      const { data: pData } = await (supabase as any)
        .from('sc_sprint_problems')
        .select('*')
        .limit(20)
      data = pData || []
    }

    setProblems(data)
    setLoading(false)
  }, [])

  // ─── Mount ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('sc_match') : null
    if (raw) {
      try {
        const md: MatchData = JSON.parse(raw)
        if (md.phase === 'sp') {
          setMatchData(md)
          setMatchMode(true)
          teamANameRef.current = md.teamA.team_name
          teamBNameRef.current = md.teamB.team_name
          setTeamAName(md.teamA.team_name)
          setTeamBName(md.teamB.team_name)
          loadProblems(md.spSetId)
          return
        }
      } catch { /* ignore */ }
    }
    loadProblems()
  }, [loadProblems])

  // ─── Realtime channel ────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(SP_CHANNEL)
    channelRef.current = ch

    ch.on('broadcast', { event: 'submit' }, ({ payload }) => {
      const sub = payload as { team: 'a' | 'b'; answer: string[]; submittedAt: number }
      if (!sub?.team) return

      if (sub.team === 'a') {
        subARef.current = sub
        teamASubmittedRef.current = true
        setTeamASubmitted(true)
        broadcast({ teamASubmitted: true })
      } else {
        subBRef.current = sub
        teamBSubmittedRef.current = true
        setTeamBSubmitted(true)
        broadcast({ teamBSubmitted: true })
      }

      // Both submitted → reveal
      if (teamASubmittedRef.current && teamBSubmittedRef.current) {
        doReveal()
      }
    })

    // Any screen joining mid-round pings admin for current state
    ch.on('broadcast', { event: 'ping' }, () => {
      broadcast()
    })

    // On connect: push current state to all screens
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setTimeout(() => broadcast(), 400)
      }
    })

    return () => {
      stopTimer()
      supabase.removeChannel(ch)
    }
  }, [broadcast, doReveal])

  // ─── Heartbeat: re-broadcast every 4 s so late-joiners stay in sync ─────────
  useEffect(() => {
    const hb = setInterval(() => {
      if (phaseRef.current !== 'setup') broadcast()
    }, 4000)
    return () => clearInterval(hb)
  }, [broadcast])

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleStartProblem = (problem: SprintProblem) => {
    const steps = [problem.step1, problem.step2, problem.step3, problem.step4, problem.step5].filter(Boolean)
    const shuffled = shuffle(steps)

    currentProblemRef.current = problem
    setCurrentProblem(problem)
    stepsDisplayRef.current = shuffled
    stepsCorrectRef.current = steps
    setStepsDisplay(shuffled)

    subARef.current = null
    subBRef.current = null
    teamASubmittedRef.current = false
    teamBSubmittedRef.current = false
    setTeamASubmitted(false)
    setTeamBSubmitted(false)
    setRevealState(null)
    setUsedProblemIds(prev => new Set([...prev, problem.id]))

    updatePhase('playing')

    broadcast({ phase: 'playing', stepsDisplay: shuffled, stepsCorrect: [], teamASubmitted: false, teamBSubmitted: false, teamAAnswer: null, teamBAnswer: null, teamAStepScore: null, teamBStepScore: null, teamASpeedBonus: null, teamBSpeedBonus: null })

    startTimer()
  }

  const handleNextProblem = () => {
    updatePhase('setup')
    setCurrentProblem(null)
    currentProblemRef.current = null
    setRevealState(null)
    broadcast({ phase: 'setup' })
  }

  const handleEndSprint = () => {
    stopTimer()
    updatePhase('done')
    broadcast({ phase: 'done', stepsCorrect: [] })

    if (matchMode && matchData) {
      const updated = { ...matchData, spScores: [scoreARef.current, scoreBRef.current], phase: 'done' }
      sessionStorage.setItem('sc_match', JSON.stringify(updated))
      router.push('/dashboard/staff/competition/live/match')
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const rfA = matchData?.rfScores?.[0] ?? 0
  const rfB = matchData?.rfScores?.[1] ?? 0
  const bzA = matchData?.bzScores?.[0] ?? 0
  const bzB = matchData?.bzScores?.[1] ?? 0
  const totalA = rfA + bzA + scoreA
  const totalB = rfB + bzB + scoreB
  const availableProblems = problems.filter(p => !usedProblemIds.has(p.id))

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="animate-spin text-purple-400" size={40} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      {/* Header */}
      <div className="bg-[#060f1e] border-b border-purple-500/20 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/staff/competition')}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
        >
          <ArrowLeft size={18} />
        </button>
        <Lightbulb className="text-purple-400" size={20} />
        <h1 className="text-base font-bold flex-1">Innovation Sprint — Admin</h1>
        <button
          onClick={() => window.open('/dashboard/staff/competition/live/sprint/display/', '_blank')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg hover:bg-purple-600/40 transition"
        >
          <Monitor size={13} /> Open Display
        </button>
        <button
          onClick={() => window.open('/dashboard/staff/competition/live/sprint/play/', '_blank')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold rounded-lg hover:bg-blue-600/40 transition"
        >
          <Play size={13} /> Open Play Page
        </button>
      </div>

      {/* Running total banner */}
      {matchMode && phase !== 'setup' && (
        <div className="bg-[#f5a623]/10 border-b border-[#f5a623]/20 px-6 py-2 flex items-center justify-center gap-6 text-sm">
          <Trophy size={14} className="text-[#f5a623]" />
          <span className="text-[#f5a623] font-semibold">Running Total:</span>
          <span className="text-blue-300 font-bold">{teamAName}: {totalA}</span>
          <span className="text-slate-500">|</span>
          <span className="text-purple-300 font-bold">{teamBName}: {totalB}</span>
          <span className="text-slate-400 text-xs">(RF {rfA}/{rfB} + BZ {bzA}/{bzB} + SP {scoreA}/{scoreB})</span>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-4 py-8">

        {/* ── SETUP / PROBLEM SELECTION ── */}
        {(phase === 'setup' || phase === 'done') && (
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">
                  {usedProblemIds.size > 0 ? 'Select Next Problem' : 'Select Starting Problem'}
                </h2>
                <p className="text-sm text-slate-400 mt-1">{availableProblems.length} problem{availableProblems.length !== 1 ? 's' : ''} available</p>
              </div>
              {matchMode && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f5a623]/10 rounded-full text-[#f5a623] text-xs font-semibold">
                  <Trophy size={12} /> Match Mode
                </div>
              )}
            </div>

            {/* Carry-over scores */}
            {matchMode && matchData && (
              <div className="mb-5 p-3 bg-[#f5a623]/10 border border-[#f5a623]/20 rounded-xl text-sm text-center">
                <span className="text-[#f5a623] font-semibold">Carry-Over:</span>
                <span className="ml-2 text-blue-300">{teamAName}: RF {rfA} + BZ {bzA} = {rfA + bzA}</span>
                <span className="mx-2 text-slate-500">|</span>
                <span className="text-purple-300">{teamBName}: RF {rfB} + BZ {bzB} = {rfB + bzB}</span>
              </div>
            )}

            {/* Sprint scores so far */}
            {usedProblemIds.size > 0 && (
              <div className="bg-[#060f1e] border border-white/10 rounded-2xl p-4 mb-5">
                <div className="grid grid-cols-3 gap-4 items-center text-center">
                  <div>
                    <p className="text-xs text-slate-400">{teamAName}</p>
                    <p className="text-2xl font-black text-blue-400">{scoreA}</p>
                  </div>
                  <div className="text-slate-500 text-sm">Sprint Score</div>
                  <div>
                    <p className="text-xs text-slate-400">{teamBName}</p>
                    <p className="text-2xl font-black text-purple-400">{scoreB}</p>
                  </div>
                </div>
              </div>
            )}

            {availableProblems.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 mb-4">{problems.length === 0 ? 'No problems found.' : 'All problems completed!'}</p>
                {usedProblemIds.size > 0 && (
                  <button onClick={handleEndSprint} className="px-6 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] transition">
                    {matchMode ? 'End Sprint & Save Results' : 'View Final Results'}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {availableProblems.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleStartProblem(p)}
                    className="w-full bg-[#0d1f3c] border border-white/10 rounded-2xl p-5 text-left hover:border-purple-500/40 transition group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-white group-hover:text-purple-300 transition">{p.title}</h3>
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{p.statement}</p>
                        <p className="text-xs text-purple-400/70 mt-2">5 steps · 30 second timer</p>
                      </div>
                      <ChevronRight className="text-purple-400 shrink-0 mt-1 group-hover:translate-x-1 transition-transform" size={20} />
                    </div>
                  </button>
                ))}

                {usedProblemIds.size > 0 && (
                  <button
                    onClick={handleEndSprint}
                    className="w-full mt-2 py-3 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl font-semibold hover:bg-purple-500/30 transition"
                  >
                    End Sprint &amp; Save Results
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PLAYING ── */}
        {phase === 'playing' && currentProblem && (
          <div className="w-full max-w-2xl flex flex-col gap-5">
            {/* Problem header */}
            <div className="bg-[#0d1f3c] border border-purple-500/30 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-2">{currentProblem.title}</h2>
              <p className="text-slate-300 text-sm leading-relaxed">{currentProblem.statement}</p>
            </div>

            {/* Timer + submission status */}
            <div className="bg-[#060f1e] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Submissions</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${countdown <= 5 ? 'bg-red-400 animate-pulse' : 'bg-purple-400'}`} />
                  <span className={`text-2xl font-black ${countdown <= 5 ? 'text-red-400' : 'text-purple-300'}`}>{countdown}s</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border text-center ${teamASubmitted ? 'border-green-500/40 bg-green-500/10' : 'border-white/10 bg-white/5'}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamAName}</p>
                  <p className={`text-sm font-bold ${teamASubmitted ? 'text-green-400' : 'text-slate-400'}`}>
                    {teamASubmitted ? '✓ Submitted' : 'Working…'}
                  </p>
                </div>
                <div className={`p-3 rounded-xl border text-center ${teamBSubmitted ? 'border-green-500/40 bg-green-500/10' : 'border-white/10 bg-white/5'}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamBName}</p>
                  <p className={`text-sm font-bold ${teamBSubmitted ? 'text-green-400' : 'text-slate-400'}`}>
                    {teamBSubmitted ? '✓ Submitted' : 'Working…'}
                  </p>
                </div>
              </div>

              <button
                onClick={doReveal}
                className="w-full mt-4 py-2 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-xl text-sm font-semibold hover:bg-orange-500/30 transition"
              >
                Force Reveal Now
              </button>
            </div>

            {/* Step order preview (admin only) */}
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-5">
              <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-3">Correct Order (admin only)</h3>
              <div className="space-y-2">
                {stepsCorrectRef.current.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-5 h-5 rounded-full bg-purple-500/30 text-purple-300 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                    <span className="text-slate-300">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REVEAL ── */}
        {phase === 'reveal' && revealState && currentProblem && (
          <div className="w-full max-w-3xl flex flex-col gap-5">
            <h2 className="text-2xl font-black text-center">Reveal: {currentProblem.title}</h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Team A */}
              <div className="bg-[#0d1f3c] border border-blue-500/30 rounded-2xl p-5">
                <h3 className="font-bold text-blue-300 mb-3 truncate">{teamAName}</h3>
                <div className="space-y-2 mb-4">
                  {(revealState.teamAAnswer ?? []).map((step, i) => {
                    const correct = step === stepsCorrectRef.current[i]
                    return (
                      <div key={i} className={`flex items-center gap-2 text-sm p-2 rounded-xl ${correct ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        <span className={`text-base ${correct ? 'text-green-400' : 'text-red-400'}`}>{correct ? '✓' : '✗'}</span>
                        <span className={correct ? 'text-green-300' : 'text-red-300'}>{step}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="text-center pt-3 border-t border-white/10">
                  <p className="text-xs text-slate-400 mb-1">Steps: <span className="text-blue-300 font-bold">+{revealState.teamAStepScore}</span></p>
                  <p className="text-xs text-slate-400 mb-1">Speed: <span className="text-yellow-400 font-bold">+{revealState.teamASpeedBonus}</span></p>
                  <p className="text-lg font-black text-blue-300">+{(revealState.teamAStepScore ?? 0) + (revealState.teamASpeedBonus ?? 0)} pts</p>
                </div>
              </div>

              {/* Team B */}
              <div className="bg-[#0d1f3c] border border-purple-500/30 rounded-2xl p-5">
                <h3 className="font-bold text-purple-300 mb-3 truncate">{teamBName}</h3>
                <div className="space-y-2 mb-4">
                  {(revealState.teamBAnswer ?? []).map((step, i) => {
                    const correct = step === stepsCorrectRef.current[i]
                    return (
                      <div key={i} className={`flex items-center gap-2 text-sm p-2 rounded-xl ${correct ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        <span className={`text-base ${correct ? 'text-green-400' : 'text-red-400'}`}>{correct ? '✓' : '✗'}</span>
                        <span className={correct ? 'text-green-300' : 'text-red-300'}>{step}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="text-center pt-3 border-t border-white/10">
                  <p className="text-xs text-slate-400 mb-1">Steps: <span className="text-purple-300 font-bold">+{revealState.teamBStepScore}</span></p>
                  <p className="text-xs text-slate-400 mb-1">Speed: <span className="text-yellow-400 font-bold">+{revealState.teamBSpeedBonus}</span></p>
                  <p className="text-lg font-black text-purple-300">+{(revealState.teamBStepScore ?? 0) + (revealState.teamBSpeedBonus ?? 0)} pts</p>
                </div>
              </div>
            </div>

            {/* Running sprint scores */}
            <div className="bg-[#060f1e] border border-white/10 rounded-2xl p-4">
              <div className="grid grid-cols-3 items-center gap-4 text-center">
                <div>
                  <p className="text-xs text-slate-400">{teamAName} Sprint Total</p>
                  <p className="text-3xl font-black text-blue-400">{scoreA}</p>
                </div>
                <div className="text-slate-500 text-sm">Sprint Score</div>
                <div>
                  <p className="text-xs text-slate-400">{teamBName} Sprint Total</p>
                  <p className="text-3xl font-black text-purple-400">{scoreB}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {availableProblems.length > 0 && (
                <button
                  onClick={handleNextProblem}
                  className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 flex items-center justify-center gap-2 transition"
                >
                  Next Problem <ChevronRight size={18} />
                </button>
              )}
              <button
                onClick={handleEndSprint}
                className={`${availableProblems.length > 0 ? 'px-5' : 'flex-1'} py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] transition`}
              >
                {matchMode ? 'End Sprint & Save' : 'End Sprint'}
              </button>
            </div>
          </div>
        )}

        {/* ── DONE (no-match-mode final screen) ── */}
        {phase === 'done' && !matchMode && (
          <div className="w-full max-w-lg text-center">
            <div className="bg-[#0d1f3c] border border-purple-500/20 rounded-2xl p-8">
              <Trophy className="text-purple-400 mx-auto mb-4" size={56} />
              <h2 className="text-2xl font-black mb-6">Innovation Sprint Complete!</h2>
              <div className="grid grid-cols-3 gap-4 items-center mb-6">
                <div className={`p-4 rounded-xl ${scoreA > scoreB ? 'bg-blue-500/20 border-2 border-blue-400' : 'bg-white/5'}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamAName}</p>
                  <p className="text-4xl font-black text-blue-400">{scoreA}</p>
                </div>
                <div className="text-slate-500 font-bold">TOTAL</div>
                <div className={`p-4 rounded-xl ${scoreB > scoreA ? 'bg-purple-500/20 border-2 border-purple-400' : 'bg-white/5'}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamBName}</p>
                  <p className="text-4xl font-black text-purple-400">{scoreB}</p>
                </div>
              </div>
              <button
                onClick={() => { updatePhase('setup'); setUsedProblemIds(new Set()); updateScoreA(0); updateScoreB(0) }}
                className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition"
              >
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
