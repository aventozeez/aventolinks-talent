'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getLiveState, subscribeToLive, QuizLiveState, POINTS } from '@/lib/quiz-live'

const OPTION_LABELS = ['A', 'B', 'C', 'D']

export default function TeamBPage() {
  const [state, setState]     = useState<QuizLiveState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLiveState().then(({ data }) => { setState(data); setLoading(false) })
    return subscribeToLive(setState)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#f5a623]" size={40} />
      </div>
    )
  }

  const phase        = state?.phase ?? 'idle'
  const currentQ     = state?.questions?.[state?.current_index ?? 0] ?? null
  const totalQ       = state?.questions?.length ?? 0
  const myName       = state?.team_b_name ?? 'Team B'
  const theirName    = state?.team_a_name ?? 'Team A'
  const myScore      = state?.score_b ?? 0
  const theirScore   = state?.score_a ?? 0
  const weGotIt      = state?.last_result === 'correct_b'
  const theyGotIt    = state?.last_result === 'correct_a'
  const noOneGotIt   = state?.last_result === 'wrong'

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      {/* Team header */}
      <div className="bg-purple-950/60 border-b border-purple-500/30 px-6 py-5 text-center shrink-0">
        <p className="text-[11px] font-black text-purple-400 uppercase tracking-[0.3em] mb-1">Your Team</p>
        <h1 className="text-3xl md:text-4xl font-black text-white">{myName}</h1>

        {/* Scores row */}
        <div className="flex items-center justify-center gap-8 mt-4">
          <div className="text-center">
            <p className="text-6xl font-black text-purple-400 leading-none">{myScore}</p>
            <p className="text-xs text-purple-600 font-semibold mt-1">Your Points</p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div className="text-center">
            <p className="text-3xl font-bold text-slate-500 leading-none">{theirScore}</p>
            <p className="text-xs text-slate-600 font-semibold mt-1">{theirName}</p>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 max-w-2xl mx-auto w-full">

        {phase === 'idle' ? (
          <div className="text-center space-y-4">
            <div className="text-7xl">🏆</div>
            <h2 className="text-2xl font-black text-white">Good luck, {myName}!</h2>
            <p className="text-slate-400 text-lg">Waiting for the quiz to begin…</p>
          </div>

        ) : currentQ ? (
          <div className="w-full space-y-5">

            {/* Counter */}
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Q <strong className="text-white">{(state?.current_index ?? 0) + 1}</strong>{' '}
                / <strong className="text-white">{totalQ}</strong>
              </span>
              <span className="text-xs bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                {currentQ.category}
              </span>
            </div>

            {/* Question */}
            <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-6 shadow-xl">
              <p className="text-xl md:text-2xl font-bold text-white leading-snug">
                {currentQ.question}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              {currentQ.options.map((opt, idx) => {
                const isCorrect = idx === currentQ.correct_answer
                const revealed  = phase === 'revealed'
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border text-sm font-medium
                      transition-all duration-500 ${
                      revealed && isCorrect
                        ? 'border-green-400 bg-green-500/20 text-green-200'
                        : revealed
                        ? 'border-white/5 bg-white/[0.02] text-slate-600'
                        : 'border-white/15 bg-white/5 text-white'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      revealed && isCorrect ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-500'
                    }`}>
                      {OPTION_LABELS[idx]}
                    </span>
                    {opt}
                  </div>
                )
              })}
            </div>

            {/* Result */}
            {phase === 'revealed' && state?.last_result && (
              <div className={`rounded-xl px-5 py-3.5 text-center font-bold text-base border ${
                weGotIt
                  ? 'bg-purple-500/20 border-purple-400/40 text-purple-300'
                  : theyGotIt
                  ? 'bg-slate-700/40 border-slate-600/40 text-slate-400'
                  : 'bg-red-500/15 border-red-400/30 text-red-400'
              }`}>
                {weGotIt    && `🎉 You got it right! +${POINTS} points`}
                {theyGotIt  && `${theirName} answered correctly`}
                {noOneGotIt && '❌ No one answered correctly'}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
