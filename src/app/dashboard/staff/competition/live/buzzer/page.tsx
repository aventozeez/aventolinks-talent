'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Radio, Trophy, ArrowLeft, Loader2, CheckCircle, XCircle, ChevronRight, Monitor, Zap } from 'lucide-react'

// ─── Shared types (re-exported from types.ts) ───────────────────────────────
export { BZ_CHANNEL, type BzPhase, type BzLiveState } from './types'
import type { BzPhase, BzLiveState } from './types'
import { BZ_CHANNEL } from './types'

// ─── Internal types ──────────────────────────────────────────────────────────
type Question = {
  id: string
  question_text: string
  answer_key: string
  subject: string
  round_type: string
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

const TOTAL_QUESTIONS = 10
const TIMER_MS = 10000

// ─── Component ───────────────────────────────────────────────────────────────
export default function BuzzerAdminPage() {
  const router = useRouter()

  // State
  const [phase, setPhase] = useState<BzPhase>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [matchMode, setMatchMode] = useState(false)
  const [matchData, setMatchData] = useState<MatchData | null>(null)
  const [teamAName, setTeamAName] = useState('Team A')
  const [teamBName, setTeamBName] = useState('Team B')
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [buzzedTeam, setBuzzedTeam] = useState<'a' | 'b' | null>(null)
  const [bonusTeam, setBonusTeam] = useState<'a' | 'b' | null>(null)
  const [buzzStartedAt, setBuzzStartedAt] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(10)
  const [showAnswer, setShowAnswer] = useState(false)

  // Stale-closure-safe refs
  const phaseRef = useRef<BzPhase>('setup')
  const scoreARef = useRef(0)
  const scoreBRef = useRef(0)
  const questionIndexRef = useRef(0)
  const buzzedTeamRef = useRef<'a' | 'b' | null>(null)
  const bonusTeamRef = useRef<'a' | 'b' | null>(null)
  const buzzStartedAtRef = useRef<number | null>(null)
  const questionsRef = useRef<Question[]>([])
  const teamANameRef = useRef('Team A')
  const teamBNameRef = useRef('Team B')
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endedRef = useRef(false)

  // Sync setters to refs
  const updatePhase = (p: BzPhase) => { phaseRef.current = p; setPhase(p) }
  const updateScoreA = (v: number) => { scoreARef.current = v; setScoreA(v) }
  const updateScoreB = (v: number) => { scoreBRef.current = v; setScoreB(v) }
  const updateBuzzedTeam = (t: 'a' | 'b' | null) => { buzzedTeamRef.current = t; setBuzzedTeam(t) }
  const updateBonusTeam = (t: 'a' | 'b' | null) => { bonusTeamRef.current = t; setBonusTeam(t) }
  const updateBuzzStartedAt = (v: number | null) => { buzzStartedAtRef.current = v; setBuzzStartedAt(v) }
  const updateQuestionIndex = (i: number) => { questionIndexRef.current = i; setQuestionIndex(i) }

  // ─── Broadcast ──────────────────────────────────────────────────────────────
  const broadcast = useCallback((overrides?: Partial<BzLiveState>) => {
    const q = questionsRef.current[questionIndexRef.current]
    const state: BzLiveState = {
      phase: phaseRef.current,
      teamAName: teamANameRef.current,
      teamBName: teamBNameRef.current,
      scoreA: scoreARef.current,
      scoreB: scoreBRef.current,
      questionText: q?.question_text ?? '',
      questionSubject: q?.subject ?? '',
      questionIndex: questionIndexRef.current,
      totalQuestions: questionsRef.current.length,
      buzzedTeam: buzzedTeamRef.current,
      bonusTeam: bonusTeamRef.current,
      buzzStartedAt: buzzStartedAtRef.current,
      timerDuration: TIMER_MS,
      ...overrides,
    }

    // Realtime broadcast
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'state', payload: state }).catch(() => {})
    }

    // localStorage fallback
    try { localStorage.setItem('sc_bz_state', JSON.stringify(state)) } catch { /* ignore */ }

    // Persist to DB
    ;(supabase as any)
      .from('sc_buzzer_session')
      .upsert({ id: 'main', ...state, updated_at: new Date().toISOString() })
      .then(() => {})
      .catch(() => {})
  }, [])

  // ─── Timer ──────────────────────────────────────────────────────────────────
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const startTimer = useCallback(() => {
    endedRef.current = false
    stopTimer()
    const startMs = Date.now()
    updateBuzzStartedAt(startMs)
    setCountdown(10)

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startMs
      const remaining = Math.max(0, Math.ceil((TIMER_MS - elapsed) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        stopTimer()
        handleTimerOut()
      }
    }, 200)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimerOut = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    stopTimer()

    const buzzer = buzzedTeamRef.current
    const bonus = bonusTeamRef.current

    if (bonus !== null) {
      // Bonus team timed out too — deduct from bonus team, end question
      const newA = bonus === 'a' ? scoreARef.current - 5 : scoreARef.current
      const newB = bonus === 'b' ? scoreBRef.current - 5 : scoreBRef.current
      updateScoreA(newA)
      updateScoreB(newB)
      scoreARef.current = newA
      scoreBRef.current = newB
      updateBuzzedTeam(null)
      updateBonusTeam(null)
      updateBuzzStartedAt(null)
      updatePhase('ready')
      broadcast({ phase: 'ready', scoreA: newA, scoreB: newB, buzzedTeam: null, bonusTeam: null, buzzStartedAt: null })
    } else if (buzzer !== null) {
      // Primary buzzer timed out — deduct, give bonus to other team
      const newA = buzzer === 'a' ? scoreARef.current - 5 : scoreARef.current
      const newB = buzzer === 'b' ? scoreBRef.current - 5 : scoreBRef.current
      updateScoreA(newA)
      updateScoreB(newB)
      scoreARef.current = newA
      scoreBRef.current = newB
      const opp: 'a' | 'b' = buzzer === 'a' ? 'b' : 'a'
      updateBonusTeam(opp)
      bonusTeamRef.current = opp
      updatePhase('bonus')
      // Start a new 10s timer for bonus team
      const bonusStart = Date.now()
      updateBuzzStartedAt(bonusStart)
      buzzStartedAtRef.current = bonusStart
      endedRef.current = false
      broadcast({ phase: 'bonus', scoreA: newA, scoreB: newB, bonusTeam: opp, buzzStartedAt: bonusStart })
      // Restart timer for bonus team
      const s = Date.now()
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - s
        const remaining = Math.max(0, Math.ceil((TIMER_MS - elapsed) / 1000))
        setCountdown(remaining)
        if (remaining <= 0) { stopTimer(); handleTimerOut() }
      }, 200)
    }
  }, [broadcast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load questions ──────────────────────────────────────────────────────────
  const loadQuestions = useCallback(async (bzSetId?: string) => {
    setLoading(true)
    let data: Question[] = []

    if (bzSetId) {
      const { data: pqData } = await (supabase as any)
        .from('sc_pool_questions')
        .select('question_id, order_index')
        .eq('pool_id', bzSetId)
        .order('order_index')

      if (pqData && pqData.length > 0) {
        const qids = pqData.map((r: { question_id: string }) => r.question_id)
        const { data: qData } = await (supabase as any)
          .from('sc_questions')
          .select('*')
          .in('id', qids)
        data = qData || []
      }
    }

    if (data.length === 0) {
      const { data: qData } = await (supabase as any)
        .from('sc_questions')
        .select('*')
        .eq('round_type', 'buzzer')
        .limit(TOTAL_QUESTIONS)
      data = qData || []
    }

    questionsRef.current = data.slice(0, TOTAL_QUESTIONS)
    setQuestions(questionsRef.current)
    setLoading(false)
  }, [])

  // ─── Mount: load match data & set up Realtime ────────────────────────────────
  useEffect(() => {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('sc_match') : null
    if (raw) {
      try {
        const md: MatchData = JSON.parse(raw)
        if (md.phase === 'bz') {
          setMatchData(md)
          setMatchMode(true)
          teamANameRef.current = md.teamA.team_name
          teamBNameRef.current = md.teamB.team_name
          setTeamAName(md.teamA.team_name)
          setTeamBName(md.teamB.team_name)
          loadQuestions(md.bzSetId)
          return
        }
      } catch { /* ignore */ }
    }
    loadQuestions()
  }, [loadQuestions])

  // ─── Realtime channel ────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel(BZ_CHANNEL)
    channelRef.current = ch

    ch.on('broadcast', { event: 'buzzed' }, ({ payload }) => {
      if (phaseRef.current !== 'open') return
      const t = payload?.team as 'a' | 'b'
      if (!t) return
      updateBuzzedTeam(t)
      buzzedTeamRef.current = t
      updatePhase('buzzed')
      startTimer()
      broadcast({ phase: 'buzzed', buzzedTeam: t })
    })

    ch.subscribe()

    return () => {
      stopTimer()
      supabase.removeChannel(ch)
    }
  }, [broadcast, startTimer])

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleOpenBuzzer = () => {
    updatePhase('open')
    setShowAnswer(false)
    broadcast({ phase: 'open' })
  }

  const handleCorrect = () => {
    if (endedRef.current && phaseRef.current !== 'buzzed' && phaseRef.current !== 'bonus') return
    endedRef.current = true
    stopTimer()

    const who = bonusTeamRef.current ?? buzzedTeamRef.current
    const pts = bonusTeamRef.current ? 5 : 10
    const newA = who === 'a' ? scoreARef.current + pts : scoreARef.current
    const newB = who === 'b' ? scoreBRef.current + pts : scoreBRef.current
    updateScoreA(newA)
    updateScoreB(newB)
    scoreARef.current = newA
    scoreBRef.current = newB
    setShowAnswer(true)
    updateBuzzedTeam(null)
    updateBonusTeam(null)
    updateBuzzStartedAt(null)

    // Determine if round done
    const nextIdx = questionIndexRef.current + 1
    const isDone = nextIdx >= questionsRef.current.length

    updatePhase(isDone ? 'done' : 'ready')
    broadcast({ phase: isDone ? 'done' : 'ready', scoreA: newA, scoreB: newB, buzzedTeam: null, bonusTeam: null, buzzStartedAt: null })
    if (!isDone) {
      updateQuestionIndex(nextIdx)
      questionIndexRef.current = nextIdx
    }
  }

  const handleWrong = () => {
    if (endedRef.current) return
    endedRef.current = true
    stopTimer()

    const isBonus = bonusTeamRef.current !== null
    const who = bonusTeamRef.current ?? buzzedTeamRef.current

    const newA = who === 'a' ? scoreARef.current - 5 : scoreARef.current
    const newB = who === 'b' ? scoreBRef.current - 5 : scoreBRef.current
    updateScoreA(newA)
    updateScoreB(newB)
    scoreARef.current = newA
    scoreBRef.current = newB

    if (isBonus) {
      // After bonus wrong — move to next question
      setShowAnswer(true)
      updateBuzzedTeam(null)
      updateBonusTeam(null)
      updateBuzzStartedAt(null)
      const nextIdx = questionIndexRef.current + 1
      const isDone = nextIdx >= questionsRef.current.length
      updatePhase(isDone ? 'done' : 'ready')
      broadcast({ phase: isDone ? 'done' : 'ready', scoreA: newA, scoreB: newB, buzzedTeam: null, bonusTeam: null, buzzStartedAt: null })
      if (!isDone) { updateQuestionIndex(nextIdx); questionIndexRef.current = nextIdx }
    } else {
      // Primary wrong — give bonus to opponent
      const opp: 'a' | 'b' = who === 'a' ? 'b' : 'a'
      updateBonusTeam(opp)
      bonusTeamRef.current = opp
      updatePhase('bonus')
      const bonusStart = Date.now()
      updateBuzzStartedAt(bonusStart)
      buzzStartedAtRef.current = bonusStart
      endedRef.current = false
      broadcast({ phase: 'bonus', scoreA: newA, scoreB: newB, bonusTeam: opp, buzzStartedAt: bonusStart })
      startTimer()
    }
  }

  const handleNext = () => {
    endedRef.current = true
    stopTimer()
    const nextIdx = questionIndexRef.current + 1
    const isDone = nextIdx >= questionsRef.current.length
    updateBuzzedTeam(null)
    updateBonusTeam(null)
    updateBuzzStartedAt(null)
    setShowAnswer(false)
    if (isDone) {
      updatePhase('done')
      broadcast({ phase: 'done', buzzedTeam: null, bonusTeam: null, buzzStartedAt: null })
    } else {
      updateQuestionIndex(nextIdx)
      questionIndexRef.current = nextIdx
      updatePhase('ready')
      broadcast({ phase: 'ready', questionIndex: nextIdx, buzzedTeam: null, bonusTeam: null, buzzStartedAt: null })
    }
  }

  const handleStartRound = () => {
    updatePhase('ready')
    updateQuestionIndex(0)
    questionIndexRef.current = 0
    updateScoreA(0)
    scoreARef.current = 0
    updateScoreB(0)
    scoreBRef.current = 0
    updateBuzzedTeam(null)
    updateBonusTeam(null)
    setShowAnswer(false)
    broadcast({ phase: 'ready', questionIndex: 0, scoreA: 0, scoreB: 0, buzzedTeam: null, bonusTeam: null, buzzStartedAt: null })
  }

  const handleDone = () => {
    if (matchMode && matchData) {
      const updated = { ...matchData, bzScores: [scoreARef.current, scoreBRef.current], phase: 'sp' }
      sessionStorage.setItem('sc_match', JSON.stringify(updated))
      router.push('/dashboard/staff/competition/live/sprint')
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const currentQ = questions[questionIndex]
  const rfA = matchData?.rfScores?.[0] ?? 0
  const rfB = matchData?.rfScores?.[1] ?? 0
  const totalA = rfA + scoreA
  const totalB = rfB + scoreB

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-400" size={40} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      {/* Header */}
      <div className="bg-[#060f1e] border-b border-blue-500/20 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/staff/competition')}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
        >
          <ArrowLeft size={18} />
        </button>
        <Radio className="text-blue-400" size={20} />
        <h1 className="text-base font-bold flex-1">Buzzer Round — Admin</h1>
        <button
          onClick={() => window.open('/dashboard/staff/competition/live/buzzer/display/', '_blank')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold rounded-lg hover:bg-blue-600/40 transition"
        >
          <Monitor size={13} /> Open Display
        </button>
        <button
          onClick={() => window.open('/dashboard/staff/competition/live/buzzer/buzz/', '_blank')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg hover:bg-purple-600/40 transition"
        >
          <Zap size={13} /> Buzz Page
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
          <span className="text-slate-400 text-xs">(RF {rfA}/{rfB} + BZ {scoreA}/{scoreB})</span>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-5">

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <div className="w-full max-w-lg bg-[#0d1f3c] border border-blue-500/20 rounded-2xl p-8">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Radio className="text-blue-400" size={24} />
              <h2 className="text-2xl font-black">Buzzer Round Setup</h2>
            </div>

            {matchMode && matchData && (
              <div className="mb-5 p-3 bg-[#f5a623]/10 border border-[#f5a623]/20 rounded-xl text-sm text-center">
                <span className="text-[#f5a623] font-semibold">RF Carry-Over:</span>
                <span className="ml-2 text-blue-300">{matchData.teamA.team_name}: {rfA}</span>
                <span className="mx-2 text-slate-500">|</span>
                <span className="text-purple-300">{matchData.teamB.team_name}: {rfB}</span>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Team A Name</label>
                <input
                  value={teamAName}
                  onChange={e => { setTeamAName(e.target.value); teamANameRef.current = e.target.value }}
                  disabled={matchMode}
                  className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-400 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Team B Name</label>
                <input
                  value={teamBName}
                  onChange={e => { setTeamBName(e.target.value); teamBNameRef.current = e.target.value }}
                  disabled={matchMode}
                  className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-400 disabled:opacity-60"
                />
              </div>
            </div>

            <p className="text-sm text-slate-400 text-center mb-5">{questions.length} question{questions.length !== 1 ? 's' : ''} loaded</p>

            {questions.length === 0 && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 text-center">
                No questions found. Add questions with round_type='buzzer'.
              </div>
            )}

            <button
              onClick={handleStartRound}
              disabled={questions.length === 0}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              <Radio size={18} /> Start Buzzer Round
            </button>
          </div>
        )}

        {/* ── READY / OPEN / BUZZED / BONUS ── */}
        {(phase === 'ready' || phase === 'open' || phase === 'buzzed' || phase === 'bonus') && currentQ && (
          <div className="w-full max-w-2xl flex flex-col gap-4">
            {/* Progress */}
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Question {questionIndex + 1} / {questions.length}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                phase === 'open' ? 'bg-green-500/20 text-green-400' :
                phase === 'buzzed' ? 'bg-yellow-500/20 text-yellow-400' :
                phase === 'bonus' ? 'bg-orange-500/20 text-orange-400' :
                'bg-white/10 text-slate-400'
              }`}>{phase}</span>
            </div>

            {/* Scoreboard */}
            <div className="grid grid-cols-3 items-center gap-3 bg-[#060f1e] border border-white/10 rounded-2xl p-4">
              <div className={`text-center p-2 rounded-xl ${buzzedTeam === 'a' || bonusTeam === 'a' ? 'bg-blue-500/20 border border-blue-500/40' : 'bg-transparent'}`}>
                <p className="text-xs text-slate-400 truncate">{teamAName}</p>
                <p className="text-3xl font-black text-blue-400">{scoreA}</p>
              </div>
              <div className="text-center text-slate-500 text-sm font-bold">VS</div>
              <div className={`text-center p-2 rounded-xl ${buzzedTeam === 'b' || bonusTeam === 'b' ? 'bg-purple-500/20 border border-purple-500/40' : 'bg-transparent'}`}>
                <p className="text-xs text-slate-400 truncate">{teamBName}</p>
                <p className="text-3xl font-black text-purple-400">{scoreB}</p>
              </div>
            </div>

            {/* Question card */}
            <div className={`bg-[#0d1f3c] border-2 rounded-2xl p-7 text-center transition-colors ${
              phase === 'buzzed' ? 'border-yellow-400/50' :
              phase === 'bonus' ? 'border-orange-400/50' :
              phase === 'open' ? 'border-green-500/40' :
              'border-white/10'
            }`}>
              {currentQ.subject && (
                <p className="text-xs text-blue-400/70 uppercase tracking-widest mb-3">{currentQ.subject}</p>
              )}
              <p className="text-xl font-semibold text-white leading-relaxed">{currentQ.question_text}</p>

              {phase === 'buzzed' && buzzedTeam && (
                <div className={`mt-4 px-4 py-2 rounded-xl text-sm font-bold inline-block ${buzzedTeam === 'a' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
                  ⚡ {buzzedTeam === 'a' ? teamAName : teamBName} buzzed in!
                </div>
              )}

              {phase === 'bonus' && bonusTeam && (
                <div className={`mt-4 px-4 py-2 rounded-xl text-sm font-bold inline-block ${bonusTeam === 'a' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}`}>
                  🎯 BONUS: {bonusTeam === 'a' ? teamAName : teamBName} — +5 if correct
                </div>
              )}

              {showAnswer && (
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-300">
                  Answer: {currentQ.answer_key}
                </div>
              )}
            </div>

            {/* Timer */}
            {(phase === 'buzzed' || phase === 'bonus') && (
              <div className="flex justify-center">
                <TimerCircle value={countdown} max={10} />
              </div>
            )}

            {/* Control buttons */}
            <div className="grid grid-cols-3 gap-3">
              {phase === 'ready' && (
                <>
                  <button
                    onClick={handleOpenBuzzer}
                    className="col-span-2 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <Zap size={18} /> Open Buzzer
                  </button>
                  <button
                    onClick={handleNext}
                    className="py-3 bg-white/10 hover:bg-white/20 text-slate-300 font-semibold rounded-xl transition text-sm"
                  >
                    Skip →
                  </button>
                </>
              )}

              {phase === 'open' && (
                <button
                  onClick={handleNext}
                  className="col-span-3 py-3 bg-white/10 hover:bg-white/20 text-slate-300 font-semibold rounded-xl transition"
                >
                  Nobody buzzed — Skip →
                </button>
              )}

              {(phase === 'buzzed' || phase === 'bonus') && (
                <>
                  <button
                    onClick={handleCorrect}
                    className="py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <CheckCircle size={16} /> Correct
                  </button>
                  <button
                    onClick={handleWrong}
                    className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <XCircle size={16} /> Wrong
                  </button>
                  <button
                    onClick={handleNext}
                    className="py-3 bg-white/10 hover:bg-white/20 text-slate-300 font-semibold rounded-xl transition text-sm"
                  >
                    Next →
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <div className="w-full max-w-lg text-center">
            <div className="bg-[#0d1f3c] border border-blue-500/20 rounded-2xl p-8">
              <Trophy className="text-blue-400 mx-auto mb-4" size={56} />
              <h2 className="text-2xl font-black mb-6">Buzzer Round Complete!</h2>

              <div className="grid grid-cols-3 gap-4 items-center mb-6">
                <div className={`p-4 rounded-xl ${scoreA > scoreB ? 'bg-blue-500/20 border-2 border-blue-400' : 'bg-white/5'}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamAName}</p>
                  <p className="text-4xl font-black text-blue-400">{scoreA}</p>
                  {matchMode && <p className="text-xs text-slate-500 mt-1">Total: {totalA}</p>}
                </div>
                <div className="text-slate-500 font-bold">FINAL</div>
                <div className={`p-4 rounded-xl ${scoreB > scoreA ? 'bg-purple-500/20 border-2 border-purple-400' : 'bg-white/5'}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamBName}</p>
                  <p className="text-4xl font-black text-purple-400">{scoreB}</p>
                  {matchMode && <p className="text-xs text-slate-500 mt-1">Total: {totalB}</p>}
                </div>
              </div>

              <div className={`py-2 px-4 rounded-xl text-sm font-semibold mb-6 ${
                scoreA > scoreB ? 'bg-blue-500/20 text-blue-300' :
                scoreB > scoreA ? 'bg-purple-500/20 text-purple-300' :
                'bg-white/10 text-slate-300'
              }`}>
                {scoreA === scoreB ? "It's a Tie!" : `${scoreA > scoreB ? teamAName : teamBName} Wins Buzzer Round!`}
              </div>

              {matchMode ? (
                <button
                  onClick={handleDone}
                  className="w-full py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2 transition"
                >
                  Continue → Innovation Sprint <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  onClick={() => updatePhase('setup')}
                  className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition"
                >
                  Play Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timer circle ────────────────────────────────────────────────────────────
function TimerCircle({ value, max }: { value: number; max: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (value / max) * circ
  const isRed = value <= 3

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={isRed ? '#ef4444' : '#60a5fa'}
          strokeWidth="6"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <span className={`text-3xl font-black ${isRed ? 'text-red-400' : 'text-blue-300'}`}>{value}</span>
    </div>
  )
}
