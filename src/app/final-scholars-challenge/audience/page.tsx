'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getLiveState, subscribeToLive, QuizLiveState, POINTS } from '@/lib/quiz-live'

const OPTION_LABELS = ['A', 'B', 'C', 'D']

const MODE_LABELS: Record<string, string> = {
  rapid_fire:        '⚡ Rapid Fire',
  buzzer:            '🔔 Buzzer Round',
  innovation_sprint: '💡 Innovation Sprint',
}

export default function AudiencePage() {
  const [state,   setState]   = useState<QuizLiveState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLiveState().then(({ data }) => {
      if (data) setState(data)
      setLoading(false)
    })
    const sub = subscribeToLive(setState)
    return sub.unsubscribe
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#f5a623]" size={40} />
      </div>
    )
  }

  const mode     = state?.mode ?? 'rapid_fire'
  const phase    = state?.phase ?? 'idle'
  const currentQ = state?.questions?.[state?.current_index ?? 0] ?? null
  const totalQ   = state?.questions?.length ?? 0

  const buzzedTeam =
    phase === 'buzzed_a' ? state?.team_a_name :
    phase === 'buzzed_b' ? state?.team_b_name : null
  const buzzColor =
    phase === 'buzzed_a' ? { ring: 'border-green-400', bg: 'bg-green-500/20', text: 'text-green-300' } :
    phase === 'buzzed_b' ? { ring: 'border-purple-400', bg: 'bg-purple-500/20', text: 'text-purple-300' } :
    null

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      {/* Top bar */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/30 px-6 py-2 flex items-center justify-between shrink-0">
        <span className="text-xs font-black text-[#f5a623] uppercase tracking-[0.3em]">
          Final Scholars Challenge — Live
        </span>
        {phase !== 'idle' && (
          <span className="text-xs font-bold text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
            {MODE_LABELS[mode] ?? mode}
          </span>
        )}
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 border-b border-white/10 shrink-0">
        <div className="bg-green-950/40 border-r border-white/10 px-8 py-5 text-center">
          <p className="text-sm font-black text-green-400 uppercase tracking-widest truncate">
            {state?.team_a_name ?? 'Team A'}
          </p>
          <p className="text-7xl font-black text-green-400 mt-1 leading-none">
            {state?.score_a ?? 0}
          </p>
          <p className="text-xs text-green-700 mt-1 font-semibold">pts</p>
        </div>
        <div className="bg-purple-950/40 px-8 py-5 text-center">
          <p className="text-sm font-black text-purple-400 uppercase tracking-widest truncate">
            {state?.team_b_name ?? 'Team B'}
          </p>
          <p className="text-7xl font-black text-purple-400 mt-1 leading-none">
            {state?.score_b ?? 0}
          </p>
          <p className="text-xs text-purple-700 mt-1 font-semibold">pts</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-5xl mx-auto w-full">

        {/* ── Idle ── */}
        {phase === 'idle' && (
          <div className="text-center space-y-5">
            <div className="text-9xl">🎓</div>
            <h1 className="text-5xl font-black text-white tracking-tight">Final Scholars Challenge</h1>
            <p className="text-slate-400 text-xl">Get ready — the quiz is about to begin</p>
          </div>
        )}

        {/* ── Active ── */}
        {phase !== 'idle' && currentQ && (
          <div className="w-full space-y-6">

            {/* Q counter + category */}
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Question <strong className="text-white">{(state?.current_index ?? 0) + 1}</strong> of{' '}
                <strong className="text-white">{totalQ}</strong>
              </span>
              <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs">
                {currentQ.category}
              </span>
            </div>

            {/* Question card */}
            <div className="bg-[#0a1628] border border-white/10 rounded-3xl p-8 shadow-2xl">
              <p className="text-3xl md:text-4xl font-bold text-white text-center leading-snug">
                {currentQ.question}
              </p>
            </div>

            {/* ── BUZZER — who buzzed ── */}
            {buzzedTeam && buzzColor && (
              <div className={`rounded-2xl px-6 py-5 text-center font-black text-3xl border-2 animate-pulse ${buzzColor.ring} ${buzzColor.bg} ${buzzColor.text}`}>
                🔔 {buzzedTeam} BUZZED IN!
              </div>
            )}

            {/* Options (hidden in innovation sprint or while buzzer waiting) */}
            {mode !== 'innovation_sprint' && currentQ.options?.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {currentQ.options.map((opt, idx) => {
                  const isCorrect = idx === currentQ.correct_answer
                  const revealed  = phase === 'revealed'
                  return (
                    <div key={idx} className={`flex items-center gap-4 px-6 py-5 rounded-2xl border text-base font-semibold transition-all duration-500 ${
                      revealed && isCorrect
                        ? 'border-green-400 bg-green-500/25 text-green-200 scale-[1.02] shadow-lg shadow-green-500/20'
                        : revealed
                        ? 'border-white/5 bg-white/[0.02] text-slate-600'
                        : 'border-white/15 bg-white/5 text-white'
                    }`}>
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                        revealed && isCorrect ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-400'
                      }`}>{OPTION_LABELS[idx]}</span>
                      <span className="flex-1">{opt}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Innovation Sprint waiting */}
            {mode === 'innovation_sprint' && phase === 'showing' && (
              <div className="rounded-2xl border border-[#f5a623]/30 bg-[#f5a623]/8 px-8 py-6 text-center">
                <p className="text-[#f5a623] font-black text-xl mb-1">💡 Innovation Sprint</p>
                <p className="text-slate-400 text-base">Teams are preparing their response…</p>
              </div>
            )}

            {/* Buzzer waiting */}
            {mode === 'buzzer' && phase === 'showing' && (
              <div className="rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/5 px-8 py-5 text-center">
                <p className="text-[#f5a623]/70 font-semibold text-lg">🔔 Waiting for a buzz…</p>
              </div>
            )}

            {/* Result banner */}
            {phase === 'revealed' && state?.last_result && state.last_result !== 'pass' && (
              <div className={`rounded-2xl px-6 py-4 text-center text-xl font-black border transition-all duration-300 ${
                state.last_result === 'correct_a'
                  ? 'bg-green-500/20 border-green-400/40 text-green-300'
                  : state.last_result === 'correct_b'
                  ? 'bg-purple-500/20 border-purple-400/40 text-purple-300'
                  : 'bg-red-500/20 border-red-400/40 text-red-300'
              }`}>
                {state.last_result === 'correct_a' &&
                  `✅ ${state.team_a_name} answered correctly! +${POINTS} points`}
                {state.last_result === 'correct_b' &&
                  `✅ ${state.team_b_name} answered correctly! +${POINTS} points`}
                {state.last_result === 'wrong' && '❌ No one answered correctly this round'}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
