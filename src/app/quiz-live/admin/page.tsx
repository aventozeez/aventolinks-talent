'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Copy, Loader2, RotateCcw, Play, SkipForward,
  X, Trophy, ChevronDown, ChevronUp, Settings,
} from 'lucide-react'
import {
  getLiveState, saveLiveState,
  QuizLiveState, LiveQuestion, POINTS, BROADCAST_ROOM,
} from '@/lib/quiz-live'
import { supabase } from '@/lib/supabase'

const OPTION_LABELS = ['A', 'B', 'C', 'D']

export default function AdminQuizLivePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

  // Broadcast channel — only set in ref AFTER WebSocket reaches SUBSCRIBED state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)

  // Live state
  const [state, setState]     = useState<QuizLiveState | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  // UI
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(true)

  // Setup form
  const [teamA, setTeamA]           = useState('Team A')
  const [teamB, setTeamB]           = useState('Team B')
  const [availableQs, setAvailableQs] = useState<LiveQuestion[]>([])
  const [qLoading, setQLoading]       = useState(false)

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/login'); return }
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      const role = data?.role ?? session.user.user_metadata?.role
      if (role === 'admin' || role === 'moderator') {
        setAuthChecked(true)
      } else {
        router.push('/dashboard')
      }
    })
  }, [router])

  // ── Load initial state ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data } = await getLiveState()
    if (data) {
      setState(data)
      setTeamA(data.team_a_name || 'Team A')
      setTeamB(data.team_b_name || 'Team B')
      if (data.phase !== 'idle') setShowSetup(false)
    } else {
      // Bootstrap default row if it doesn't exist yet
      const { data: created } = await saveLiveState({
        team_a_name: 'Team A',
        team_b_name: 'Team B',
        score_a: 0,
        score_b: 0,
        questions: [],
        current_index: 0,
        phase: 'idle',
        last_result: null,
      })
      if (created) setState(created)
    }
    setLoading(false)
  }, [])

  // ── Set up broadcast channel once auth clears ───────────────────────────────
  useEffect(() => {
    if (!authChecked) return

    // Admin is the broadcaster — create a dedicated send channel.
    // We only arm channelRef AFTER the WS handshake reaches SUBSCRIBED
    // so that send() calls never hit an un-ready socket.
    const bc = supabase.channel(BROADCAST_ROOM)
    bc.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        channelRef.current = bc
      }
    })

    load()

    return () => {
      supabase.removeChannel(bc)
      channelRef.current = null
    }
  }, [authChecked, load])

  // ── Core patch helper ────────────────────────────────────────────────────────
  // 1. Persists state to DB (source of truth for initial load on refresh)
  // 2. Broadcasts to all viewer screens via Supabase Broadcast
  const patch = useCallback(async (updates: Partial<QuizLiveState>) => {
    setSaving(true)
    const { data } = await saveLiveState(updates)
    if (data) {
      setState(data)
      // Fire-and-forget broadcast — viewers receive full state instantly
      channelRef.current?.send({
        type: 'broadcast',
        event: 'quiz_state',
        payload: data,
      })
    }
    setSaving(false)
  }, [])

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

  // ── Actions ─────────────────────────────────────────────────────────────────
  const startQuiz = async () => {
    if (!availableQs.length) return
    await patch({
      team_a_name: teamA.trim() || 'Team A',
      team_b_name: teamB.trim() || 'Team B',
      score_a: 0,
      score_b: 0,
      questions: availableQs,
      current_index: 0,
      phase: 'showing',
      last_result: null,
    })
    setShowSetup(false)
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

  const nextQuestion = () => {
    if (!state) return
    const next = state.current_index + 1
    if (next >= state.questions.length) {
      patch({ phase: 'idle', last_result: null })
    } else {
      patch({ current_index: next, phase: 'showing', last_result: null })
    }
  }

  const resetAll = async () => {
    if (!confirm('Reset all scores and return to idle?')) return
    await patch({ score_a: 0, score_b: 0, current_index: 0, phase: 'idle', last_result: null })
    setShowSetup(true)
  }

  // ── Guards ───────────────────────────────────────────────────────────────────
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

  const LINKS = [
    { key: 'admin',    label: 'Admin',    path: '/quiz-live/admin',    emoji: '🎛️', border: 'border-[#f5a623]/40',   bg: 'bg-[#f5a623]/10',  text: 'text-[#f5a623]'  },
    { key: 'audience', label: 'Audience', path: '/quiz-live/audience', emoji: '📺', border: 'border-blue-500/40',   bg: 'bg-blue-500/10',   text: 'text-blue-300'   },
    { key: 'team-a',   label: 'Team A',   path: '/quiz-live/team-a',   emoji: '🔵', border: 'border-green-500/40',  bg: 'bg-green-500/10',  text: 'text-green-300'  },
    { key: 'team-b',   label: 'Team B',   path: '/quiz-live/team-b',   emoji: '🟣', border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-300' },
  ]

  return (
    <div className="min-h-screen bg-[#060f1f] text-white pb-12">

      {/* Header */}
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
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Links panel (always visible) ── */}
        <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">
            Share These Links — All Are Live At All Times
          </p>
          <div className="grid grid-cols-2 gap-3">
            {LINKS.map(l => {
              const isCopied = copiedKey === l.key
              const url = origin + l.path
              return (
                <div
                  key={l.key}
                  className={`flex items-center justify-between border rounded-xl px-3 py-3 ${l.border} ${l.bg}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">{l.emoji}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold ${l.text}`}>{l.label}</p>
                      <p className="text-[10px] text-slate-500 truncate">/quiz-live/{l.key}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => copy(url, l.key)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-colors shrink-0 ml-2"
                  >
                    {isCopied
                      ? <><Check size={10} /> Copied</>
                      : <><Copy size={10} /> Copy</>}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Scores ── */}
        {state && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#0a1628] border border-green-500/30 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1 truncate">
                {state.team_a_name}
              </p>
              <p className="text-5xl font-black text-green-400">{state.score_a}</p>
              <p className="text-xs text-slate-600 mt-0.5">points</p>
            </div>
            <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 truncate">
                {state.team_b_name}
              </p>
              <p className="text-5xl font-black text-purple-400">{state.score_b}</p>
              <p className="text-xs text-slate-600 mt-0.5">points</p>
            </div>
          </div>
        )}

        {/* ── Setup panel (shown when idle) ── */}
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
            {showSetup ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>

          {showSetup && (
            <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
              {/* Team names */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Team A Name</label>
                  <input
                    value={teamA}
                    onChange={e => setTeamA(e.target.value)}
                    className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Team B Name</label>
                  <input
                    value={teamB}
                    onChange={e => setTeamB(e.target.value)}
                    className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                  />
                </div>
              </div>

              {/* Load questions */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  {availableQs.length > 0
                    ? <span className="text-green-400">✓ {availableQs.length} questions loaded</span>
                    : 'No questions loaded yet'}
                </p>
                <button
                  onClick={loadQuestions}
                  disabled={qLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {qLoading
                    ? <><Loader2 size={12} className="animate-spin" /> Loading…</>
                    : <><RotateCcw size={12} /> Load from Question Bank</>}
                </button>
              </div>

              {/* Begin */}
              <button
                onClick={startQuiz}
                disabled={saving || availableQs.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-40 text-sm transition-colors"
              >
                {saving
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Play size={16} fill="currentColor" />}
                {phase !== 'idle' ? 'Restart Quiz from Q1' : 'Begin Quiz'}
              </button>
            </div>
          )}
        </div>

        {/* ── Question + controls (showing / revealed) ── */}
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
              <p className="text-white font-semibold text-base leading-relaxed mb-4">
                {currentQ.question}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {currentQ.options.map((opt, idx) => {
                  const isCorrect = idx === currentQ.correct_answer
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                        isCorrect
                          ? 'border-green-500/50 bg-green-500/15 text-green-300 font-medium'
                          : 'border-white/10 bg-white/5 text-slate-400'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCorrect ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-500'
                      }`}>
                        {OPTION_LABELS[idx]}
                      </span>
                      <span className="flex-1 min-w-0">{opt}</span>
                      {isCorrect && <Check size={13} className="text-green-400 shrink-0" />}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Result banner */}
            {phase === 'revealed' && state?.last_result && (
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

            {/* Action buttons */}
            {phase === 'showing' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => markCorrect('a')}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 py-3.5 bg-green-600/80 hover:bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 text-sm transition-colors"
                  >
                    <Check size={16} />
                    Correct — {state?.team_a_name}
                  </button>
                  <button
                    onClick={() => markCorrect('b')}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 py-3.5 bg-purple-600/80 hover:bg-purple-600 text-white font-bold rounded-xl disabled:opacity-50 text-sm transition-colors"
                  >
                    <Check size={16} />
                    Correct — {state?.team_b_name}
                  </button>
                </div>
                <button
                  onClick={markWrong}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-600/30 hover:bg-red-600/50 text-red-300 font-bold rounded-xl disabled:opacity-50 text-sm transition-colors border border-red-500/30"
                >
                  <X size={16} /> Wrong / No Answer — Reveal
                </button>
              </div>
            )}

            {phase === 'revealed' && (
              <button
                onClick={nextQuestion}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-50 text-sm transition-colors"
              >
                {saving
                  ? <Loader2 size={16} className="animate-spin" />
                  : <SkipForward size={16} />}
                {(state?.current_index ?? 0) + 1 >= totalQ
                  ? '🏁 End Quiz'
                  : '⏭ Next Question'}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
