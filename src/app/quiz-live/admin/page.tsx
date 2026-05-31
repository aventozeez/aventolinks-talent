'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Copy, Loader2, RotateCcw, Play, SkipForward,
  X, Trophy, ChevronDown, ChevronUp, Settings,
  Bell, Zap, Lightbulb, Plus, Minus,
} from 'lucide-react'
import {
  getLiveState, saveLiveState,
  QuizLiveState, LiveQuestion, LivePhase, GameMode,
  POINTS, BROADCAST_ROOM,
} from '@/lib/quiz-live'
import { supabase } from '@/lib/supabase'

const OPTION_LABELS = ['A', 'B', 'C', 'D']

const MODES: { key: GameMode; label: string; desc: string; Icon: typeof Zap }[] = [
  { key: 'rapid_fire',        label: 'Rapid Fire',        Icon: Zap,       desc: 'Fast Q&A — admin marks Correct / Wrong / Pass' },
  { key: 'buzzer',            label: 'Buzzer',            Icon: Bell,      desc: 'Teams buzz in — first to buzz gets to answer'   },
  { key: 'innovation_sprint', label: 'Innovation Sprint', Icon: Lightbulb, desc: 'Challenge round — admin awards custom points'    },
]

const LINKS = [
  { key: 'admin',    label: 'Admin',    path: '/quiz-live/admin',    emoji: '🎛️', border: 'border-[#f5a623]/40',   bg: 'bg-[#f5a623]/10',  text: 'text-[#f5a623]'  },
  { key: 'audience', label: 'Audience', path: '/quiz-live/audience', emoji: '📺', border: 'border-blue-500/40',   bg: 'bg-blue-500/10',   text: 'text-blue-300'   },
  { key: 'team-a',   label: 'Team A',   path: '/quiz-live/team-a',   emoji: '🔵', border: 'border-green-500/40',  bg: 'bg-green-500/10',  text: 'text-green-300'  },
  { key: 'team-b',   label: 'Team B',   path: '/quiz-live/team-b',   emoji: '🟣', border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-300' },
]

export default function AdminQuizLivePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

  // Broadcast channel ref — armed after SUBSCRIBED
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef   = useRef<any>(null)
  const stateRef     = useRef<QuizLiveState | null>(null)
  const buzzLockRef  = useRef(false)   // first-buzz-wins guard

  // Core state
  const [state,   setState]   = useState<QuizLiveState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  // Mode — persisted locally so admin survives refresh
  const [mode, setMode] = useState<GameMode>(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('ql_mode') as GameMode) || 'rapid_fire'
      : 'rapid_fire'
  )

  // UI
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(true)

  // Setup form
  const [teamA,       setTeamA]       = useState('Team A')
  const [teamB,       setTeamB]       = useState('Team B')
  const [availableQs, setAvailableQs] = useState<LiveQuestion[]>([])
  const [qLoading,    setQLoading]    = useState(false)

  // Innovation Sprint custom points
  const [innovA, setInnovA] = useState(0)
  const [innovB, setInnovB] = useState(0)

  // Keep stateRef fresh for callbacks that can't re-close over state
  useEffect(() => { stateRef.current = state }, [state])

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/login'); return }
      const { data } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      const role = data?.role ?? session.user.user_metadata?.role
      if (role === 'admin' || role === 'moderator') setAuthChecked(true)
      else router.push('/dashboard')
    })
  }, [router])

  // ── Load initial state ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data } = await getLiveState()
    if (data) {
      setState(data)
      setTeamA(data.team_a_name || 'Team A')
      setTeamB(data.team_b_name || 'Team B')
      if (data.phase !== 'idle') setShowSetup(false)
    } else {
      const { data: created } = await saveLiveState({
        team_a_name: 'Team A', team_b_name: 'Team B',
        score_a: 0, score_b: 0, questions: [],
        current_index: 0, phase: 'idle', last_result: null,
      })
      if (created) setState(created)
    }
    setLoading(false)
  }, [])

  // ── Patch helper — saves to DB, broadcasts full state with mode ────────────
  const patch = useCallback(async (updates: Partial<QuizLiveState>) => {
    setSaving(true)
    const { data } = await saveLiveState(updates)
    if (data) {
      const currentMode: GameMode =
        (localStorage.getItem('ql_mode') as GameMode) || 'rapid_fire'
      const full = { ...data, mode: currentMode }
      setState(data)
      channelRef.current?.send({
        type: 'broadcast', event: 'quiz_state', payload: full,
      })
    }
    setSaving(false)
  }, [])

  // ── Channel setup — admin listens for buzz events ──────────────────────────
  useEffect(() => {
    if (!authChecked) return

    const bc = (supabase.channel(BROADCAST_ROOM) as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .on('broadcast', { event: 'buzz' }, (msg: { payload: { team: 'a' | 'b' } }) => {
        // First-buzz-wins: only handle if question is still "showing"
        if (buzzLockRef.current) return
        const s = stateRef.current
        if (!s || s.phase !== 'showing') return
        buzzLockRef.current = true
        const newPhase: LivePhase = msg.payload.team === 'a' ? 'buzzed_a' : 'buzzed_b'
        patch({ phase: newPhase })
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') channelRef.current = bc
      })

    load()

    return () => {
      supabase.removeChannel(bc)
      channelRef.current = null
    }
  }, [authChecked, load, patch])

  // ── Mode change — persists locally + broadcasts so all screens update ──────
  const changeMode = (m: GameMode) => {
    setMode(m)
    localStorage.setItem('ql_mode', m)
    const s = stateRef.current
    if (s) {
      channelRef.current?.send({
        type: 'broadcast', event: 'quiz_state', payload: { ...s, mode: m },
      })
    }
  }

  // ── Copy link ──────────────────────────────────────────────────────────────
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const loadQuestions = async () => {
    setQLoading(true)
    const { data } = await supabase
      .from('quiz_questions')
      .select('id, question, options, correct_answer, category')
      .eq('is_active', true)
      .order('category')
    setAvailableQs((data as LiveQuestion[]) || [])
    setQLoading(false)
  }

  // ── Quiz actions ─────────────────────────────────────────────────────────────
  const startQuiz = async () => {
    if (!availableQs.length) return
    buzzLockRef.current = false
    await patch({
      team_a_name: teamA.trim() || 'Team A',
      team_b_name: teamB.trim() || 'Team B',
      score_a: 0, score_b: 0,
      questions: availableQs,
      current_index: 0,
      phase: 'showing',
      last_result: null,
    })
    setShowSetup(false)
    setInnovA(0); setInnovB(0)
  }

  const markCorrect = (team: 'a' | 'b') => {
    if (!state) return
    patch({
      score_a: team === 'a' ? state.score_a + POINTS : state.score_a,
      score_b: team === 'b' ? state.score_b + POINTS : state.score_b,
      phase: 'revealed',
      last_result: team === 'a' ? 'correct_a' : 'correct_b',
    })
  }

  const markWrong = () => patch({ phase: 'revealed', last_result: 'wrong' })

  const markPass = () => {
    if (!state) return
    buzzLockRef.current = false
    const next = state.current_index + 1
    if (next >= state.questions.length) {
      patch({ phase: 'idle', last_result: 'pass' })
    } else {
      patch({ current_index: next, phase: 'showing', last_result: 'pass' })
    }
    setInnovA(0); setInnovB(0)
  }

  const awardInnovPoints = () => {
    if (!state || (innovA === 0 && innovB === 0)) return
    patch({
      score_a: state.score_a + innovA,
      score_b: state.score_b + innovB,
      phase: 'revealed',
      last_result: innovA > innovB ? 'correct_a' : innovB > innovA ? 'correct_b' : 'wrong',
    })
    setInnovA(0); setInnovB(0)
  }

  const nextQuestion = () => {
    if (!state) return
    buzzLockRef.current = false
    setInnovA(0); setInnovB(0)
    const next = state.current_index + 1
    if (next >= state.questions.length) {
      patch({ phase: 'idle', last_result: null })
    } else {
      patch({ current_index: next, phase: 'showing', last_result: null })
    }
  }

  const resetAll = async () => {
    if (!confirm('Reset all scores and return to idle?')) return
    buzzLockRef.current = false
    setInnovA(0); setInnovB(0)
    await patch({ score_a: 0, score_b: 0, current_index: 0, phase: 'idle', last_result: null })
    setShowSetup(true)
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#f5a623]" size={40} />
      </div>
    )
  }

  const origin   = typeof window !== 'undefined' ? window.location.origin : ''
  const phase    = state?.phase ?? 'idle'
  const currentQ = state?.questions?.[state?.current_index ?? 0] ?? null
  const totalQ   = state?.questions?.length ?? 0
  const buzzedTeamName =
    phase === 'buzzed_a' ? state?.team_a_name :
    phase === 'buzzed_b' ? state?.team_b_name : null

  return (
    <div className="min-h-screen bg-[#060f1f] text-white pb-12">

      {/* ── Header ── */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/20 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Trophy className="text-[#f5a623]" size={22} />
          <h1 className="font-bold text-lg">Quiz Live — Admin</h1>
          {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-slate-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset All
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Mode selector ── */}
        <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Game Mode</p>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => changeMode(key)}
                className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border text-xs font-bold transition-all ${
                  mode === key
                    ? 'border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623]'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/25 hover:text-white'
                }`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2.5 text-center">
            {MODES.find(m => m.key === mode)?.desc}
          </p>
        </div>

        {/* ── Scores ── */}
        {state && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0a1628] border border-green-500/30 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1 truncate">{state.team_a_name}</p>
              <p className="text-5xl font-black text-green-400">{state.score_a}</p>
              <p className="text-xs text-slate-600 mt-0.5">points</p>
            </div>
            <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 truncate">{state.team_b_name}</p>
              <p className="text-5xl font-black text-purple-400">{state.score_b}</p>
              <p className="text-xs text-slate-600 mt-0.5">points</p>
            </div>
          </div>
        )}

        {/* ── Buzz alert ── */}
        {(phase === 'buzzed_a' || phase === 'buzzed_b') && (
          <div className={`rounded-2xl px-5 py-4 text-center font-black text-xl border animate-pulse ${
            phase === 'buzzed_a'
              ? 'bg-green-500/20 border-green-400/60 text-green-300'
              : 'bg-purple-500/20 border-purple-400/60 text-purple-300'
          }`}>
            🔔 {buzzedTeamName} BUZZED IN!
          </div>
        )}

        {/* ── Setup panel ── */}
        <div className="bg-[#0a1628] border border-[#f5a623]/20 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowSetup(p => !p)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings size={15} className="text-[#f5a623]" />
              <span className="text-sm font-semibold text-[#f5a623]">
                {phase === 'idle' ? 'Setup Quiz' : 'Setup (Reconfigure)'}
              </span>
            </div>
            {showSetup
              ? <ChevronUp size={16} className="text-slate-400" />
              : <ChevronDown size={16} className="text-slate-400" />}
          </button>

          {showSetup && (
            <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Team A Name</label>
                  <input value={teamA} onChange={e => setTeamA(e.target.value)}
                    className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Team B Name</label>
                  <input value={teamB} onChange={e => setTeamB(e.target.value)}
                    className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  {availableQs.length > 0
                    ? <span className="text-green-400">✓ {availableQs.length} questions loaded</span>
                    : 'No questions loaded yet'}
                </p>
                <button onClick={loadQuestions} disabled={qLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50">
                  {qLoading
                    ? <><Loader2 size={12} className="animate-spin" /> Loading…</>
                    : <><RotateCcw size={12} /> Load Questions</>}
                </button>
              </div>

              <button onClick={startQuiz} disabled={saving || availableQs.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-40 text-sm transition-colors">
                {saving
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Play size={16} fill="currentColor" />}
                {phase !== 'idle' ? 'Restart Quiz' : `Begin — ${MODES.find(m => m.key === mode)?.label}`}
              </button>
            </div>
          )}
        </div>

        {/* ── Question + controls ── */}
        {phase !== 'idle' && currentQ && (
          <div className="space-y-4">

            {/* Counter + category */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">
                Question{' '}
                <span className="text-white font-bold">{(state?.current_index ?? 0) + 1}</span>
                {' '}of{' '}
                <span className="text-white font-bold">{totalQ}</span>
              </p>
              <span className="text-xs bg-white/5 text-slate-400 px-2.5 py-1 rounded-full border border-white/10">
                {currentQ.category}
              </span>
            </div>

            {/* Question card — answer always visible to admin */}
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
              <p className="text-white font-semibold text-base leading-relaxed mb-4">{currentQ.question}</p>
              {mode !== 'innovation_sprint' && currentQ.options?.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {currentQ.options.map((opt, idx) => {
                    const isCorrect = idx === currentQ.correct_answer
                    return (
                      <div key={idx} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                        isCorrect
                          ? 'border-green-500/50 bg-green-500/15 text-green-300 font-medium'
                          : 'border-white/10 bg-white/5 text-slate-400'
                      }`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isCorrect ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-500'
                        }`}>{OPTION_LABELS[idx]}</span>
                        <span className="flex-1 min-w-0">{opt}</span>
                        {isCorrect && <Check size={13} className="text-green-400 shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Result banner */}
            {phase === 'revealed' && state?.last_result && state.last_result !== 'pass' && (
              <div className={`rounded-xl px-5 py-3 text-center font-bold text-sm border ${
                state.last_result === 'correct_a'
                  ? 'bg-green-500/20 border-green-500/40 text-green-300'
                  : state.last_result === 'correct_b'
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                  : 'bg-red-500/20 border-red-500/40 text-red-300'
              }`}>
                {state.last_result === 'correct_a' && `✅ +${POINTS} pts — ${state.team_a_name}`}
                {state.last_result === 'correct_b' && `✅ +${POINTS} pts — ${state.team_b_name}`}
                {state.last_result === 'wrong'     && '❌ No points awarded'}
              </div>
            )}

            {/* ════ RAPID FIRE ════ */}
            {mode === 'rapid_fire' && phase === 'showing' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => markCorrect('a')} disabled={saving}
                    className="flex items-center justify-center gap-2 py-4 bg-green-600/80 hover:bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 text-sm transition-colors">
                    <Check size={16} /> Correct — {state?.team_a_name}
                  </button>
                  <button onClick={() => markCorrect('b')} disabled={saving}
                    className="flex items-center justify-center gap-2 py-4 bg-purple-600/80 hover:bg-purple-600 text-white font-bold rounded-xl disabled:opacity-50 text-sm transition-colors">
                    <Check size={16} /> Correct — {state?.team_b_name}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={markWrong} disabled={saving}
                    className="flex items-center justify-center gap-2 py-3 bg-red-600/30 hover:bg-red-600/50 text-red-300 font-bold rounded-xl disabled:opacity-50 text-sm border border-red-500/30 transition-colors">
                    <X size={16} /> Wrong / Reveal
                  </button>
                  <button onClick={markPass} disabled={saving}
                    className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl disabled:opacity-50 text-sm border border-white/10 transition-colors">
                    <SkipForward size={16} /> Pass
                  </button>
                </div>
              </div>
            )}

            {/* ════ BUZZER — waiting ════ */}
            {mode === 'buzzer' && phase === 'showing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3 rounded-xl border border-[#f5a623]/20 bg-[#f5a623]/5 px-5 py-5">
                  <Bell size={20} className="text-[#f5a623] animate-pulse" />
                  <span className="text-[#f5a623]/70 font-semibold text-sm">Waiting for a buzz…</span>
                </div>
                <button onClick={markPass} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl disabled:opacity-50 text-sm border border-white/10 transition-colors">
                  <SkipForward size={16} /> Pass (skip question)
                </button>
              </div>
            )}

            {/* ════ BUZZER — buzzed ════ */}
            {mode === 'buzzer' && (phase === 'buzzed_a' || phase === 'buzzed_b') && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => markCorrect(phase === 'buzzed_a' ? 'a' : 'b')}
                    disabled={saving}
                    className={`flex items-center justify-center gap-2 py-4 text-white font-bold rounded-xl disabled:opacity-50 text-sm transition-colors ${
                      phase === 'buzzed_a'
                        ? 'bg-green-600/80 hover:bg-green-600'
                        : 'bg-purple-600/80 hover:bg-purple-600'
                    }`}
                  >
                    <Check size={16} /> Correct ✅
                  </button>
                  <button onClick={markWrong} disabled={saving}
                    className="flex items-center justify-center gap-2 py-4 bg-red-600/30 hover:bg-red-600/50 text-red-300 font-bold rounded-xl disabled:opacity-50 text-sm border border-red-500/30 transition-colors">
                    <X size={16} /> Wrong ❌
                  </button>
                </div>
                <button onClick={markPass} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl disabled:opacity-50 text-sm border border-white/10 transition-colors">
                  <SkipForward size={16} /> Pass
                </button>
              </div>
            )}

            {/* ════ INNOVATION SPRINT ════ */}
            {mode === 'innovation_sprint' && phase === 'showing' && (
              <div className="space-y-4">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest text-center">Award Points</p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Team A award */}
                  <div className="bg-[#0a1628] border border-green-500/30 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-green-400 uppercase tracking-wider text-center truncate">
                      {state?.team_a_name}
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => setInnovA(v => Math.max(0, v - 5))}
                        className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                        <Minus size={14} />
                      </button>
                      <span className="text-3xl font-black text-green-400 w-14 text-center">{innovA}</span>
                      <button onClick={() => setInnovA(v => v + 5)}
                        className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[5, 10, 15, 20].map(v => (
                        <button key={v} onClick={() => setInnovA(v)}
                          className={`py-1.5 rounded text-xs font-bold transition-colors ${
                            innovA === v
                              ? 'bg-green-500 text-white'
                              : 'bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                  {/* Team B award */}
                  <div className="bg-[#0a1628] border border-purple-500/30 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-purple-400 uppercase tracking-wider text-center truncate">
                      {state?.team_b_name}
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button onClick={() => setInnovB(v => Math.max(0, v - 5))}
                        className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                        <Minus size={14} />
                      </button>
                      <span className="text-3xl font-black text-purple-400 w-14 text-center">{innovB}</span>
                      <button onClick={() => setInnovB(v => v + 5)}
                        className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[5, 10, 15, 20].map(v => (
                        <button key={v} onClick={() => setInnovB(v)}
                          className={`py-1.5 rounded text-xs font-bold transition-colors ${
                            innovB === v
                              ? 'bg-purple-500 text-white'
                              : 'bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}>{v}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={awardInnovPoints}
                  disabled={saving || (innovA === 0 && innovB === 0)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-40 text-sm transition-colors"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
                  Apply Points
                  {(innovA > 0 || innovB > 0) && (
                    <span className="opacity-70 font-normal text-xs">
                      {innovA > 0 ? `+${innovA} ${state?.team_a_name}` : ''}
                      {innovA > 0 && innovB > 0 ? '  ·  ' : ''}
                      {innovB > 0 ? `+${innovB} ${state?.team_b_name}` : ''}
                    </span>
                  )}
                </button>
                <button onClick={markPass} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl disabled:opacity-50 text-sm border border-white/10 transition-colors">
                  <SkipForward size={16} /> Pass / Skip
                </button>
              </div>
            )}

            {/* Next Question — shown after reveal */}
            {phase === 'revealed' && (
              <button onClick={nextQuestion} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-50 text-sm transition-colors">
                {saving
                  ? <Loader2 size={16} className="animate-spin" />
                  : <SkipForward size={16} />}
                {(state?.current_index ?? 0) + 1 >= totalQ ? '🏁 End Quiz' : '⏭ Next Question'}
              </button>
            )}

          </div>
        )}

        {/* ── Links — always visible ── */}
        <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">
            Share Links — All 4 Screens Are Always Live
          </p>
          <div className="grid grid-cols-2 gap-3">
            {LINKS.map(l => {
              const isCopied = copiedKey === l.key
              return (
                <div key={l.key}
                  className={`flex items-center justify-between border rounded-xl px-3 py-3 ${l.border} ${l.bg}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{l.emoji}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold ${l.text}`}>{l.label}</p>
                      <p className="text-[10px] text-slate-500 truncate">/quiz-live/{l.key}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-2 shrink-0">
                    <a href={l.path} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold text-white transition-colors">
                      Open
                    </a>
                    <button onClick={() => copy(origin + l.path, l.key)}
                      className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold transition-colors text-white">
                      {isCopied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
