'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import {
  FSCState,
  getMatchState, subscribeToMatch,
  RF_Q_COUNT, RF_TIME_MS, BZ_TIME_MS, IS_TIME_MS, MC_TIME_MS, MC_PUZZLE_COUNT,
} from '@/lib/fsc-live'
import RoundInstructionsInline from '@/components/round-instructions-inline'
import { ROUND_INFO } from '@/lib/round-info'

export default function AudiencePage() {
  const [state, setState] = useState<FSCState | null>(null)
  const [loading, setLoading] = useState(true)
  const [timerMs, setTimerMs] = useState(0)
  const stateRef = useRef<FSCState | null>(null)

  const handleStateUpdate = useCallback((s: FSCState) => {
    setState(s)
    stateRef.current = s
  }, [])

  useEffect(() => {
    getMatchState().then(s => {
      if (s) handleStateUpdate(s)
      setLoading(false)
    })
    const sub = subscribeToMatch(handleStateUpdate)
    return sub.unsubscribe
  }, [handleStateUpdate])

  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      if (!s) return
      if ((s.rf_phase === 'a_playing' || s.rf_phase === 'b_playing') && s.rf_timer_start) {
        setTimerMs(Math.max(0, RF_TIME_MS - (Date.now() - s.rf_timer_start)))
      } else if ((s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b' || s.bz_phase === 'second_chance') && s.bz_buzz_start) {
        setTimerMs(Math.max(0, BZ_TIME_MS - (Date.now() - s.bz_buzz_start)))
      } else if (s.is_phase === 'working' && s.is_timer_start) {
        setTimerMs(Math.max(0, IS_TIME_MS - (Date.now() - s.is_timer_start)))
      } else if ((s.mc_phase === 'a_playing' || s.mc_phase === 'b_playing' || s.mc_phase === 'c_playing') && s.mc_timer_start) {
        setTimerMs(Math.max(0, MC_TIME_MS - (Date.now() - s.mc_timer_start)))
      } else if ((s.av_phase === 'a_playing' || s.av_phase === 'b_playing') && s.av_timer_start) {
        setTimerMs(Math.max(0, MC_TIME_MS - (Date.now() - s.av_timer_start)))
      } else {
        setTimerMs(0)
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={40} />
    </div>
  )

  const s = state
  const round = s?.round ?? 'idle'
  const nameA = s?.team_a_name ?? 'Team A'
  const nameB = s?.team_b_name ?? 'Team B'
  const totalA = (s?.carried_score_a ?? 0) + (s?.rf_score_a ?? 0) + (s?.bz_score_a ?? 0) + (s?.is_score_a ?? 0) + (s?.mc_score_a ?? 0) + (s?.av_score_a ?? 0)
  const totalB = (s?.carried_score_b ?? 0) + (s?.rf_score_b ?? 0) + (s?.bz_score_b ?? 0) + (s?.is_score_b ?? 0) + (s?.mc_score_b ?? 0) + (s?.av_score_b ?? 0)
  const totalC = (s?.carried_score_c ?? 0) + (s?.mc_score_c ?? 0)
  const timerSecs = Math.ceil(timerMs / 1000)
  const timerWarn = timerSecs <= 10 && timerSecs > 0
  const fmtTime = (ms: number) => { const sc = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(sc / 60)}:${String(sc % 60).padStart(2, '0')}` }

  const nameC = s?.team_c_name ?? 'Team C'

  const ROUND_LABELS: Record<string, string> = {
    idle: '',
    rapid_fire: '⚡ Rapid Fire',
    buzzer: '🔔 Buzzer Round',
    innovation_sprint: '💡 Innovation Sprint',
    mystery_chain: '🔮 Mystery Chain',
    audio_visual: '🎬 Audio Visual — Grand Final',
    finished: '🏆 Final Scores',
  }

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      {/* Top bar */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/30 px-6 py-2 flex items-center justify-between shrink-0">
        <span className="text-xs font-black text-[#f5a623] uppercase tracking-[0.3em]">
          Final Scholars Challenge — Live
        </span>
        {round !== 'idle' && (
          <span className="text-xs font-bold text-slate-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
            {ROUND_LABELS[round]}
          </span>
        )}
      </div>

      {/* Score board */}
      {round === 'mystery_chain' && s?.team_c_name ? (
        <div className="grid grid-cols-3 border-b border-white/10 shrink-0">
          <div className="bg-green-950/40 border-r border-white/10 px-4 py-4 text-center">
            <p className="text-xs font-black text-green-400 uppercase tracking-widest truncate">{nameA}</p>
            <p className="text-5xl font-black text-green-400 mt-1 leading-none">{totalA}</p>
            <p className="text-[10px] text-green-700 mt-1 font-semibold">pts</p>
          </div>
          <div className="bg-purple-950/40 border-r border-white/10 px-4 py-4 text-center">
            <p className="text-xs font-black text-purple-400 uppercase tracking-widest truncate">{nameB}</p>
            <p className="text-5xl font-black text-purple-400 mt-1 leading-none">{totalB}</p>
            <p className="text-[10px] text-purple-700 mt-1 font-semibold">pts</p>
          </div>
          <div className="bg-blue-950/40 px-4 py-4 text-center">
            <p className="text-xs font-black text-blue-400 uppercase tracking-widest truncate">{nameC}</p>
            <p className="text-5xl font-black text-blue-400 mt-1 leading-none">{totalC}</p>
            <p className="text-[10px] text-blue-700 mt-1 font-semibold">pts</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 border-b border-white/10 shrink-0">
          <div className="bg-green-950/40 border-r border-white/10 px-8 py-5 text-center">
            <p className="text-sm font-black text-green-400 uppercase tracking-widest truncate">{nameA}</p>
            <p className="text-7xl font-black text-green-400 mt-1 leading-none">{totalA}</p>
            <p className="text-xs text-green-700 mt-1 font-semibold">pts</p>
          </div>
          <div className="bg-purple-950/40 px-8 py-5 text-center">
            <p className="text-sm font-black text-purple-400 uppercase tracking-widest truncate">{nameB}</p>
            <p className="text-7xl font-black text-purple-400 mt-1 leading-none">{totalB}</p>
            <p className="text-xs text-purple-700 mt-1 font-semibold">pts</p>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-5xl mx-auto w-full">

        {/* ── Idle ── */}
        {round === 'idle' && (
          <div className="text-center space-y-5">
            <div className="text-9xl">🎓</div>
            <h1 className="text-5xl font-black text-white tracking-tight">Final Scholars Challenge</h1>
            <p className="text-slate-400 text-xl">Waiting for the match to begin…</p>
          </div>
        )}

        {/* ── Finished ── */}
        {round === 'finished' && (
          <div className="text-center space-y-6 w-full max-w-2xl">
            <div className="text-7xl">🏆</div>
            <h2 className="text-4xl font-black text-white">Final Results</h2>
            <div className="grid grid-cols-2 gap-4">
              {(['a', 'b'] as const).map(team => {
                const name = team === 'a' ? nameA : nameB
                const rf = team === 'a' ? (s?.rf_score_a ?? 0) : (s?.rf_score_b ?? 0)
                const bz = team === 'a' ? (s?.bz_score_a ?? 0) : (s?.bz_score_b ?? 0)
                const is = team === 'a' ? (s?.is_score_a ?? 0) : (s?.is_score_b ?? 0)
                const total = rf + bz + is
                const other = team === 'a' ? totalB : totalA
                const color = team === 'a'
                  ? { border: 'border-green-500/40', text: 'text-green-400', dim: 'text-green-700' }
                  : { border: 'border-purple-500/40', text: 'text-purple-400', dim: 'text-purple-700' }
                const isWinner = total > other
                return (
                  <div key={team} className={`bg-[#0a1628] border-2 ${color.border} rounded-3xl p-6 ${isWinner ? 'ring-2 ring-[#f5a623]/60' : ''}`}>
                    {isWinner && <p className="text-sm font-black text-[#f5a623] text-center mb-2">🏆 WINNER</p>}
                    <p className={`text-base font-black ${color.text} text-center`}>{name}</p>
                    <p className={`text-6xl font-black ${color.text} text-center mt-2`}>{total}</p>
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">⚡ Rapid Fire</span><span className={color.text}>{rf}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">🔔 Buzzer</span><span className={color.text}>{bz}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">💡 Innovation</span><span className={color.text}>{is}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {totalA === totalB && (
              <p className="text-2xl font-black text-[#f5a623]">🤝 It&apos;s a Tie!</p>
            )}
          </div>
        )}

        {/* ── RAPID FIRE ── */}
        {round === 'rapid_fire' && (
          <div className="w-full space-y-6">

            {s?.rf_phase === 'idle' && (
              <RoundInstructionsInline
                info={ROUND_INFO.rapid_fire}
                footerHint="Waiting for the host to start Team A's 60 seconds…"
              />
            )}

            {(s?.rf_phase === 'a_playing' || s?.rf_phase === 'b_playing') && (
              <>
                {/* Big timer */}
                <div className={`rounded-3xl p-6 text-center border-2 transition-all ${
                  timerWarn ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' :
                  s.rf_phase === 'a_playing' ? 'border-green-400/50 bg-green-500/10' : 'border-purple-400/50 bg-purple-500/10'
                }`}>
                  <p className={`text-base font-black uppercase tracking-widest ${s.rf_phase === 'a_playing' ? 'text-green-400' : 'text-purple-400'}`}>
                    {s.rf_phase === 'a_playing' ? nameA : nameB} — Rapid Fire
                  </p>
                  <p className={`text-8xl font-black mt-2 ${timerWarn || timerSecs === 0 ? 'text-red-400' : s.rf_phase === 'a_playing' ? 'text-green-400' : 'text-purple-400'}`}>
                    {fmtTime(timerMs)}
                  </p>
                  <p className="text-slate-500 mt-2">
                    Question {Math.min(s.rf_q_index + 1, RF_Q_COUNT)} of {RF_Q_COUNT}
                    {s.rf_phase === 'a_playing' && ` · ${s.rf_correct_a} correct`}
                    {s.rf_phase === 'b_playing' && ` · ${s.rf_correct_b} correct`}
                  </p>
                </div>

                {/* Current question (no answer) */}
                {s.rf_phase === 'a_playing' && s.rf_questions?.[s.rf_q_index] && (
                  <div className="bg-[#0a1628] border border-white/10 rounded-3xl p-8 shadow-2xl">
                    <p className="text-xs text-slate-500 mb-3">{s.rf_questions[s.rf_q_index].category}</p>
                    <p className="text-3xl md:text-4xl font-bold text-white text-center leading-snug">
                      {s.rf_questions[s.rf_q_index].question}
                    </p>
                  </div>
                )}
                {s.rf_phase === 'b_playing' && (s.rf_questions_b ?? s.rf_questions)?.[s.rf_q_index] && (
                  <div className="bg-[#0a1628] border border-white/10 rounded-3xl p-8 shadow-2xl">
                    <p className="text-xs text-slate-500 mb-3">{(s.rf_questions_b ?? s.rf_questions)[s.rf_q_index].category}</p>
                    <p className="text-3xl md:text-4xl font-bold text-white text-center leading-snug">
                      {(s.rf_questions_b ?? s.rf_questions)[s.rf_q_index].question}
                    </p>
                  </div>
                )}

                {/* Round scores */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-4 text-center">
                    <p className="text-xs font-bold text-green-400 truncate">{nameA}</p>
                    <p className="text-3xl font-black text-green-400">{s.rf_score_a}</p>
                  </div>
                  <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 text-center">
                    <p className="text-xs font-bold text-purple-400 truncate">{nameB}</p>
                    <p className="text-3xl font-black text-purple-400">{s.rf_score_b}</p>
                  </div>
                </div>
              </>
            )}

            {s?.rf_phase === 'break' && (
              <div className="text-center space-y-5">
                <div className="bg-green-950/40 border border-green-500/40 rounded-3xl p-8 inline-block min-w-[240px]">
                  <p className="text-base font-black text-green-400">{nameA}</p>
                  <p className="text-6xl font-black text-green-400 mt-1">{s.rf_score_a}</p>
                  <p className="text-sm text-green-700 mt-2">{s.rf_correct_a} correct</p>
                </div>
                <p className="text-xl font-bold text-slate-400">{nameB} is next…</p>
              </div>
            )}

            {s?.rf_phase === 'done' && (
              <div className="space-y-5 text-center">
                <h3 className="text-2xl font-black text-white">Rapid Fire Complete!</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-950/40 border border-green-500/40 rounded-2xl p-6 text-center">
                    <p className="text-base font-black text-green-400">{nameA}</p>
                    <p className="text-5xl font-black text-green-400 mt-1">{s.rf_score_a}</p>
                    <p className="text-sm text-green-700">{s.rf_correct_a} correct</p>
                  </div>
                  <div className="bg-purple-950/40 border border-purple-500/40 rounded-2xl p-6 text-center">
                    <p className="text-base font-black text-purple-400">{nameB}</p>
                    <p className="text-5xl font-black text-purple-400 mt-1">{s.rf_score_b}</p>
                    <p className="text-sm text-purple-700">{s.rf_correct_b} correct</p>
                  </div>
                </div>
                <p className="text-slate-400">🔔 Buzzer Round coming up next…</p>
              </div>
            )}
          </div>
        )}

        {/* ── BUZZER ROUND ── */}
        {round === 'buzzer' && (
          <div className="w-full space-y-6">

            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">🔔 Buzzer Round</h2>
              <span className="text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm">
                Q {(s?.bz_q_index ?? 0) + 1} / {s?.bz_questions?.length ?? 10}
              </span>
            </div>

            {/* Buzzer scores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-green-400 truncate">{nameA}</p>
                <p className="text-4xl font-black text-green-400">{s?.bz_score_a ?? 0}</p>
              </div>
              <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-purple-400 truncate">{nameB}</p>
                <p className="text-4xl font-black text-purple-400">{s?.bz_score_b ?? 0}</p>
              </div>
            </div>

            {s?.bz_phase === 'idle' && s.bz_q_index === 0 && s.bz_score_a === 0 && s.bz_score_b === 0 && (
              <RoundInstructionsInline
                info={ROUND_INFO.buzzer}
                footerHint="Waiting for the first question…"
              />
            )}
            {s?.bz_phase === 'idle' && !(s.bz_q_index === 0 && s.bz_score_a === 0 && s.bz_score_b === 0) && (
              <div className="text-center py-8">
                <p className="text-5xl animate-bounce">🔔</p>
                <p className="text-white font-bold text-xl mt-3">Next question incoming…</p>
              </div>
            )}

            {(s?.bz_phase === 'showing' || s?.bz_phase === 'buzzed_a' || s?.bz_phase === 'buzzed_b' || s?.bz_phase === 'second_chance' || s?.bz_phase === 'revealed') && s?.bz_questions?.[s.bz_q_index] && (
              <div className="bg-[#0a1628] border border-white/10 rounded-3xl p-8 shadow-2xl">
                <p className="text-xs text-slate-500 mb-3">{s.bz_questions[s.bz_q_index].category}</p>
                <p className="text-3xl md:text-4xl font-bold text-white text-center leading-snug">
                  {s.bz_questions[s.bz_q_index].question}
                </p>
              </div>
            )}

            {s?.bz_phase === 'showing' && (
              <div className="rounded-2xl border border-[#f5a623]/20 bg-[#f5a623]/5 px-8 py-5 text-center">
                <p className="text-[#f5a623] font-bold text-xl">🔔 Waiting for a buzz…</p>
              </div>
            )}

            {(s?.bz_phase === 'buzzed_a' || s?.bz_phase === 'buzzed_b') && (
              <>
                <div className={`rounded-2xl px-6 py-5 text-center font-black text-3xl border-2 animate-pulse ${
                  s.bz_phase === 'buzzed_a'
                    ? 'border-green-400 bg-green-500/20 text-green-300'
                    : 'border-purple-400 bg-purple-500/20 text-purple-300'
                }`}>
                  🔔 {s.bz_phase === 'buzzed_a' ? nameA : nameB} BUZZED IN!
                </div>
                <div className={`rounded-xl px-6 py-4 text-center border ${timerSecs <= 5 ? 'border-red-400 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
                  <p className="text-xs text-slate-400 font-bold mb-1">Answering in</p>
                  <p className={`text-5xl font-black ${timerSecs <= 5 ? 'text-red-400' : 'text-white'}`}>{timerSecs}s</p>
                </div>
              </>
            )}

            {s?.bz_phase === 'second_chance' && (
              <div className={`rounded-2xl px-6 py-5 text-center border-2 ${
                s.bz_second_chance_team === 'a'
                  ? 'border-green-400/60 bg-green-500/10 text-green-300'
                  : 'border-purple-400/60 bg-purple-500/10 text-purple-300'
              }`}>
                <p className="text-xl font-black">Second Chance!</p>
                <p className="text-lg font-semibold mt-1">
                  {s.bz_second_chance_team === 'a' ? nameA : nameB} — no penalty
                </p>
                <p className="text-4xl font-black mt-2">{timerSecs}s</p>
              </div>
            )}

            {s?.bz_phase === 'revealed' && (
              <div className={`rounded-2xl px-6 py-4 text-center text-xl font-black border transition-all ${
                s.bz_last_result === 'correct_a' ? 'bg-green-500/20 border-green-400/40 text-green-300' :
                s.bz_last_result === 'correct_b' ? 'bg-purple-500/20 border-purple-400/40 text-purple-300' :
                s.bz_last_result === 'penalty_a' ? 'bg-red-500/15 border-red-400/30 text-red-300' :
                s.bz_last_result === 'penalty_b' ? 'bg-red-500/15 border-red-400/30 text-red-300' :
                'bg-slate-700/20 border-slate-600/30 text-slate-400'
              }`}>
                {s.bz_last_result === 'correct_a' && `✅ ${nameA} answered correctly! +10 pts`}
                {s.bz_last_result === 'correct_b' && `✅ ${nameB} answered correctly! +10 pts`}
                {s.bz_last_result === 'penalty_a' && `❌ ${nameA} — Penalty: −5 pts`}
                {s.bz_last_result === 'penalty_b' && `❌ ${nameB} — Penalty: −5 pts`}
                {s.bz_last_result === 'skip' && '⏭ No one scored this round'}
              </div>
            )}

            {s?.bz_phase === 'done' && (
              <div className="space-y-4 text-center">
                <h3 className="text-2xl font-black text-white">Buzzer Round Complete!</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-950/40 border border-green-500/40 rounded-2xl p-5 text-center">
                    <p className="text-base font-black text-green-400">{nameA}</p>
                    <p className="text-5xl font-black text-green-400 mt-1">{s.bz_score_a}</p>
                  </div>
                  <div className="bg-purple-950/40 border border-purple-500/40 rounded-2xl p-5 text-center">
                    <p className="text-base font-black text-purple-400">{nameB}</p>
                    <p className="text-5xl font-black text-purple-400 mt-1">{s.bz_score_b}</p>
                  </div>
                </div>
                <p className="text-slate-400">💡 Innovation Sprint coming up next…</p>
              </div>
            )}
          </div>
        )}

        {/* ── INNOVATION SPRINT ── */}
        {round === 'innovation_sprint' && (
          <div className="w-full space-y-6">

            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white">💡 Innovation Sprint</h2>
              <span className="text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-sm">
                Problem {(s?.is_problem_index ?? 0) + 1} / {s?.is_problems?.length ?? 2}
              </span>
            </div>

            {/* IS Scores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-950/40 border border-green-500/30 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-green-400 truncate">{nameA}</p>
                <p className="text-4xl font-black text-green-400">{s?.is_score_a ?? 0}</p>
              </div>
              <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-3 text-center">
                <p className="text-xs font-bold text-purple-400 truncate">{nameB}</p>
                <p className="text-4xl font-black text-purple-400">{s?.is_score_b ?? 0}</p>
              </div>
            </div>

            {/* Problem statement */}
            {s?.is_problems?.[s?.is_problem_index ?? 0] && (
              <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-3xl p-8 shadow-2xl">
                <p className="text-sm font-black text-[#f5a623] uppercase tracking-wider mb-3">Problem Statement</p>
                <p className="text-2xl md:text-3xl font-bold text-white leading-snug text-center">
                  {s.is_problems[s.is_problem_index].statement}
                </p>
              </div>
            )}

            {s?.is_phase === 'idle' && s.is_problem_index === 0 && s.is_score_a === 0 && s.is_score_b === 0 && (
              <RoundInstructionsInline
                info={ROUND_INFO.innovation_sprint}
                footerHint="Waiting for the host to reveal the first problem…"
              />
            )}
            {s?.is_phase === 'idle' && !(s.is_problem_index === 0 && s.is_score_a === 0 && s.is_score_b === 0) && (
              <div className="text-center">
                <p className="text-slate-400 text-lg">Waiting for timer to start…</p>
                <p className="text-slate-500 text-sm mt-1">Teams will arrange the solution steps</p>
              </div>
            )}

            {s?.is_phase === 'working' && (
              <div className="space-y-4">
                <div className={`rounded-3xl p-6 text-center border-2 transition-all ${
                  timerWarn ? 'border-red-400 bg-red-500/10 animate-pulse' : 'border-[#f5a623]/40 bg-[#f5a623]/5'
                }`}>
                  <p className="text-base font-black text-[#f5a623] uppercase tracking-widest">Teams Arranging Steps</p>
                  <p className={`text-8xl font-black mt-2 ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-[#f5a623]'}`}>
                    {fmtTime(timerMs)}
                  </p>
                </div>
                {(s.is_problems?.[s.is_problem_index]?.steps_shuffled?.length ?? 0) > 0 && (
                  <div className="bg-[#0a1628] border border-[#f5a623]/20 rounded-2xl p-5">
                    <p className="text-xs font-black text-[#f5a623] uppercase tracking-wider mb-3">Steps (shuffled — teams are arranging these)</p>
                    <div className="space-y-2">
                      {s.is_problems[s.is_problem_index].steps_shuffled.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                          <span className="text-xs font-black text-[#f5a623]/60 w-5 text-center shrink-0 mt-0.5">{i + 1}</span>
                          <p className="text-sm text-white/80 leading-snug">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {s?.is_phase === 'solution' && s.is_problems?.[s.is_problem_index] && (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-[10px] md:text-xs font-black text-[#f5a623] uppercase tracking-[0.4em]">The correct solution</p>
                  <p className="text-2xl md:text-4xl font-black text-white mt-2 max-w-3xl mx-auto leading-tight">
                    {s.is_problems[s.is_problem_index].statement}
                  </p>
                </div>
                <ol className="space-y-3 max-w-3xl mx-auto">
                  {s.is_problems[s.is_problem_index].steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-4 rounded-2xl border border-[#f5a623]/40 bg-gradient-to-r from-[#f5a623]/15 to-transparent px-5 py-4 shadow-[0_6px_20px_-8px_rgba(245,166,35,0.4)]"
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      <span className="shrink-0 w-11 h-11 rounded-full bg-[#f5a623] text-[#0a1628] text-xl font-black flex items-center justify-center shadow-lg">
                        {i + 1}
                      </span>
                      <p className="text-base md:text-xl font-semibold text-white/95 leading-snug">{step}</p>
                    </li>
                  ))}
                </ol>
                <p className="text-center text-slate-500 text-sm italic">Next: how each team did →</p>
              </div>
            )}

            {s?.is_phase === 'collecting' && (
              <div className="flex items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-8 py-6">
                <Loader2 className="animate-spin text-[#f5a623]" size={28} />
                <p className="text-white font-bold text-lg">Collecting team answers…</p>
              </div>
            )}

            {s?.is_phase === 'revealed' && (
              <div className="space-y-5">
                <p className="text-2xl font-black text-white text-center">📊 Results!</p>

                {/* Per-team step breakdowns side by side */}
                {(s.is_step_results_a || s.is_step_results_b) && (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Team A breakdown */}
                    {s.is_team_a_answer && s.is_step_results_a && (
                      <div className="bg-green-950/30 border border-green-500/30 rounded-2xl p-4">
                        <p className="text-xs font-black text-green-400 mb-3 truncate">{nameA}</p>
                        {s.is_team_a_answer.map((step, i) => {
                          const ok = s.is_step_results_a![i]
                          return (
                            <div key={i} className="flex items-start gap-1.5 py-1.5 border-b border-white/5 last:border-0">
                              <span className={`text-xs shrink-0 mt-0.5 font-black ${ok ? 'text-green-400' : 'text-red-400'}`}>{ok ? '✓' : '✗'}</span>
                              <p className="text-[11px] text-white/80 leading-snug">{step}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Team B breakdown */}
                    {s.is_team_b_answer && s.is_step_results_b && (
                      <div className="bg-purple-950/30 border border-purple-500/30 rounded-2xl p-4">
                        <p className="text-xs font-black text-purple-400 mb-3 truncate">{nameB}</p>
                        {s.is_team_b_answer.map((step, i) => {
                          const ok = s.is_step_results_b![i]
                          return (
                            <div key={i} className="flex items-start gap-1.5 py-1.5 border-b border-white/5 last:border-0">
                              <span className={`text-xs shrink-0 mt-0.5 font-black ${ok ? 'text-green-400' : 'text-red-400'}`}>{ok ? '✓' : '✗'}</span>
                              <p className="text-[11px] text-white/80 leading-snug">{step}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Scores */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-950/40 border border-green-500/40 rounded-2xl p-5 text-center">
                    <p className="text-base font-black text-green-400">{nameA}</p>
                    <p className="text-4xl font-black text-green-400 mt-1">{s.is_score_a}</p>
                    <p className="text-xs text-green-700">IS total</p>
                  </div>
                  <div className="bg-purple-950/40 border border-purple-500/40 rounded-2xl p-5 text-center">
                    <p className="text-base font-black text-purple-400">{nameB}</p>
                    <p className="text-4xl font-black text-purple-400 mt-1">{s.is_score_b}</p>
                    <p className="text-xs text-purple-700">IS total</p>
                  </div>
                </div>
              </div>
            )}

            {s?.is_phase === 'done' && (
              <div className="text-center space-y-3">
                <p className="text-2xl font-black text-white">Innovation Sprint Complete!</p>
                <p className="text-slate-400">🏆 Final scores incoming…</p>
              </div>
            )}
          </div>
        )}

        {/* ── MYSTERY CHAIN ── */}
        {round === 'mystery_chain' && s && (
          <div className="w-full space-y-6">
            {(s.mc_phase === 'idle' || s.mc_phase === 'story') && (
              <div className="text-center space-y-4">
                <p className="text-7xl">🔮</p>
                <h2 className="text-4xl font-black text-white">Mystery Chain</h2>
                <p className="text-2xl font-bold text-[#f5a623]">{s.mc_scenario_title}</p>
                <p className="text-slate-300 text-xl max-w-2xl mx-auto leading-relaxed">{s.mc_opening_story}</p>
              </div>
            )}

            {(s.mc_phase === 'a_playing' || s.mc_phase === 'b_playing' || s.mc_phase === 'c_playing') && (() => {
              const isA = s.mc_phase === 'a_playing', isB = s.mc_phase === 'b_playing'
              const teamName = isA ? nameA : isB ? nameB : nameC
              const puzzles = isA ? s.mc_puzzles_a : isB ? s.mc_puzzles_b : s.mc_puzzles_c
              const correct = isA ? s.mc_correct_a : isB ? s.mc_correct_b : s.mc_correct_c
              const currentPuzzle = puzzles[s.mc_q_index]
              const colorClass = isA ? 'text-green-400' : isB ? 'text-purple-400' : 'text-blue-400'
              const borderClass = isA ? 'border-green-400/50 bg-green-500/10' : isB ? 'border-purple-400/50 bg-purple-500/10' : 'border-blue-400/50 bg-blue-500/10'
              return (
                <>
                  <div className={`rounded-3xl p-6 text-center border-2 transition-all ${timerWarn ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : borderClass}`}>
                    <p className={`text-base font-black uppercase tracking-widest ${colorClass}`}>{teamName} — Mystery Chain</p>
                    <p className={`text-8xl font-black mt-2 ${timerWarn || timerSecs === 0 ? 'text-red-400' : colorClass}`}>{fmtTime(timerMs)}</p>
                    <p className="text-slate-500 mt-2">Puzzle {Math.min(s.mc_q_index + 1, MC_PUZZLE_COUNT)} · {correct} correct</p>
                  </div>

                  {currentPuzzle && (
                    <div className="bg-[#0a1628] border border-white/10 rounded-3xl p-8 shadow-2xl space-y-4">
                      <p className="text-slate-400 text-lg text-center">{currentPuzzle.clue}</p>
                      <div className="bg-purple-900/30 border border-purple-500/30 rounded-2xl p-6 text-center">
                        <p className="text-xs text-purple-400 font-bold uppercase tracking-widest mb-2">Unscramble</p>
                        <p className="text-5xl md:text-6xl font-black text-purple-200 tracking-[0.4em]">{currentPuzzle.scrambled}</p>
                      </div>
                      {s.mc_revealed && (
                        <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-4 text-center">
                          <p className="text-xs text-green-400 font-bold uppercase tracking-widest mb-1">Answer</p>
                          <p className="text-3xl font-black text-green-300 tracking-widest">{currentPuzzle.answer}</p>
                          {currentPuzzle.story && <p className="text-slate-300 text-sm mt-2 italic">{currentPuzzle.story}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
            })()}

            {s.mc_phase === 'done' && (
              <div className="text-center space-y-4">
                <p className="text-7xl">🎯</p>
                <h2 className="text-4xl font-black text-white">Mystery Chain Complete!</h2>
                <p className="text-slate-400 text-xl">Grand Final upcoming…</p>
              </div>
            )}
          </div>
        )}

        {/* ── AUDIO VISUAL ── */}
        {round === 'audio_visual' && s && (
          <div className="w-full space-y-6">
            {s.av_phase === 'idle' && (
              <div className="text-center space-y-4">
                <p className="text-7xl">🎬</p>
                <h2 className="text-4xl font-black text-white">Grand Final</h2>
                <p className="text-slate-400 text-xl">Audio Visual Round — Each team answers 10 questions</p>
              </div>
            )}

            {(s.av_phase === 'a_playing' || s.av_phase === 'b_playing') && (() => {
              const isA = s.av_phase === 'a_playing'
              const teamName = isA ? nameA : nameB
              const questions = isA ? s.av_questions_a : s.av_questions_b
              const correct = isA ? s.av_correct_a : s.av_correct_b
              const currentQ = questions[s.av_q_index]
              const colorText = isA ? 'text-green-400' : 'text-purple-400'
              const borderColor = isA ? 'border-green-400/50 bg-green-500/10' : 'border-purple-400/50 bg-purple-500/10'
              return (
                <>
                  <div className={`rounded-3xl p-6 text-center border-2 ${timerWarn ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : borderColor}`}>
                    <p className={`text-base font-black uppercase tracking-widest ${colorText}`}>{teamName} — Audio Visual</p>
                    <p className={`text-8xl font-black mt-2 ${timerWarn || timerSecs === 0 ? 'text-red-400' : colorText}`}>{fmtTime(timerMs)}</p>
                    <p className="text-slate-500 mt-2">Question {Math.min(s.av_q_index + 1, 10)} of 10 · {correct} correct</p>
                  </div>
                  {currentQ && (
                    <div className="bg-[#0a1628] border border-white/10 rounded-3xl p-8 shadow-2xl">
                      <p className="text-3xl md:text-4xl font-bold text-white text-center leading-snug">{currentQ.question}</p>
                    </div>
                  )}
                </>
              )
            })()}

            {s.av_phase === 'break' && (
              <div className="text-center space-y-4">
                <p className="text-7xl">⏸</p>
                <h2 className="text-3xl font-black text-white">{nameA} Done!</h2>
                <p className="text-slate-400 text-xl">Next: {nameB}</p>
              </div>
            )}

            {s.av_phase === 'done' && (
              <div className="text-center space-y-4">
                <p className="text-7xl">🏆</p>
                <h2 className="text-4xl font-black text-white">Grand Final Complete!</h2>
                <p className="text-slate-400 text-xl">Final results loading…</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
