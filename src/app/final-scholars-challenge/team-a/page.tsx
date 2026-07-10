'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import {
  FSCState,
  getMatchState, subscribeToMatch,
  RF_Q_COUNT, RF_TIME_MS, BZ_TIME_MS, IS_TIME_MS,
} from '@/lib/fsc-live'

const TEAM: 'a' | 'b' = 'a'
const COLOR = { bg: 'bg-green-950/60', border: 'border-green-500/30', text: 'text-green-400', buzz: 'bg-green-500 hover:bg-green-400 border-green-400 shadow-green-500/40', buzzed: 'bg-green-600/40 border-green-400/60 text-green-300' }

export default function TeamAPage() {
  const [state, setState] = useState<FSCState | null>(null)
  const [loading, setLoading] = useState(true)
  const [timerMs, setTimerMs] = useState(0)

  // IS step arrangement
  const [mySteps, setMySteps] = useState<string[]>([])
  const myStepsRef = useRef<string[]>([])
  const initKeyRef = useRef('')
  const submittedRef = useRef(false)
  const [submitted, setSubmitted] = useState(false)


  // Buzz
  const [buzzed, setBuzzed] = useState(false)

  // Subscription functions
  const sendBuzzRef = useRef<((team: 'a' | 'b', qIndex?: number) => void) | null>(null)
  const submitISRef = useRef<((team: 'a' | 'b', problemIndex: number, answer: string[]) => void) | null>(null)
  const stateRef = useRef<FSCState | null>(null)

  useEffect(() => { myStepsRef.current = mySteps }, [mySteps])
  useEffect(() => { stateRef.current = state }, [state])

  const handleStateUpdate = useCallback((s: FSCState) => {
    setState(s)

    // Reset buzz on new BZ question
    if (s.bz_phase === 'showing') setBuzzed(false)

    // Initialize IS steps when working starts
    const initKey = `${s.is_problem_index}-working`
    if (s.is_phase === 'working' && initKey !== initKeyRef.current) {
      const prob = s.is_problems?.[s.is_problem_index]
      if (prob?.steps_shuffled?.length) {
        const shuffled = [...prob.steps_shuffled]
        setMySteps(shuffled)
        myStepsRef.current = shuffled
        initKeyRef.current = initKey
        submittedRef.current = false
        setSubmitted(false)
      }
    }

    // Reset IS state on new problem
    if (s.is_phase === 'idle' && initKeyRef.current !== `${s.is_problem_index}-idle`) {
      initKeyRef.current = `${s.is_problem_index}-idle`
      submittedRef.current = false
      setSubmitted(false)
      setMySteps([])
      myStepsRef.current = []
    }
  }, [])

  useEffect(() => {
    getMatchState().then(s => {
      if (s) handleStateUpdate(s)
      setLoading(false)
    })

    const sub = subscribeToMatch(handleStateUpdate)
    sendBuzzRef.current = sub.sendBuzz
    submitISRef.current = sub.submitISAnswer

    return sub.unsubscribe
  }, [handleStateUpdate])

  // Auto-submit IS answer when collecting phase starts
  useEffect(() => {
    const s = stateRef.current
    if (!s || s.is_phase !== 'collecting') return
    if (submittedRef.current) return
    const steps = myStepsRef.current
    if (steps.length === 0) return
    submittedRef.current = true
    setSubmitted(true)
    submitISRef.current?.(TEAM, s.is_problem_index, steps)
  }, [state?.is_phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Timer
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      if (!s) return
      if ((s.rf_phase === 'a_playing' || s.rf_phase === 'b_playing') && s.rf_timer_start) {
        setTimerMs(Math.max(0, RF_TIME_MS - (Date.now() - s.rf_timer_start)))
      } else if ((s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b' || s.bz_phase === 'second_chance') && s.bz_buzz_start) {
        setTimerMs(Math.max(0, BZ_TIME_MS - (Date.now() - s.bz_buzz_start)))
      } else if (s.is_phase === 'working' && s.is_timer_start) {
        const remaining = Math.max(0, IS_TIME_MS - (Date.now() - s.is_timer_start))
        setTimerMs(remaining)
        // Auto-submit when IS timer hits 0 (before admin clicks "Collect Answers")
        if (remaining === 0 && !submittedRef.current && myStepsRef.current.length > 0) {
          submittedRef.current = true
          setSubmitted(true)
          submitISRef.current?.(TEAM, s.is_problem_index, myStepsRef.current)
        }
      } else {
        setTimerMs(0)
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  const handleBuzz = () => {
    if (buzzed || state?.bz_phase !== 'showing') return
    setBuzzed(true)
    sendBuzzRef.current?.(TEAM, state.bz_q_index)
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= mySteps.length) return
    const ns = [...mySteps];
    [ns[idx], ns[target]] = [ns[target], ns[idx]]
    setMySteps(ns)
  }

  const submitManually = () => {
    const s = stateRef.current; if (!s) return
    submittedRef.current = true
    setSubmitted(true)
    submitISRef.current?.(TEAM, s.is_problem_index, myStepsRef.current)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#060f1f] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={40} />
    </div>
  )

  const s = state
  const round = s?.round ?? 'idle'
  const myName = s?.team_a_name ?? 'Team A'
  const theirName = s?.team_b_name ?? 'Team B'
  const myTotalScore = (s?.rf_score_a ?? 0) + (s?.bz_score_a ?? 0) + (s?.is_score_a ?? 0)
  const theirTotalScore = (s?.rf_score_b ?? 0) + (s?.bz_score_b ?? 0) + (s?.is_score_b ?? 0)
  const timerSecs = Math.ceil(timerMs / 1000)
  const timerWarn = timerSecs <= 10 && timerSecs > 0
  const fmtTime = (ms: number) => { const sc = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(sc / 60)}:${String(sc % 60).padStart(2, '0')}` }

  // ── Innovation Sprint · working — dedicated compact layout that ALWAYS
  // fits inside the viewport (no scrolling), so students on smaller
  // laptops can still reach the Submit button under time pressure.
  // Uses h-[100dvh] + overflow-hidden on the outer shell.
  if (round === 'innovation_sprint' && s?.is_phase === 'working') {
    const prob = s.is_problems?.[s.is_problem_index]
    return (
      <div className="h-[100dvh] w-full overflow-hidden bg-[#060f1f] text-white flex flex-col select-none">
        {/* Compact top strip — team + scores + IS badge */}
        <div className={`${COLOR.bg} border-b ${COLOR.border} px-4 py-2 flex items-center justify-between gap-3 shrink-0`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[#f5a623] text-xs font-black">💡</span>
            <div className="min-w-0">
              <p className={`text-[10px] font-black ${COLOR.text} uppercase tracking-widest leading-none`}>Your Team</p>
              <p className="text-white text-sm md:text-base font-black leading-tight truncate">{myName}</p>
            </div>
          </div>
          {/* Cumulative score removed — students focus on the current round only. */}
        </div>

        {/* Slim timer bar */}
        <div className={`shrink-0 border-b border-white/10 ${timerWarn ? 'bg-red-500/10' : 'bg-[#f5a623]/5'}`}>
          <div className="px-4 py-1.5 flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-widest ${timerWarn ? 'text-red-400' : 'text-[#f5a623]'}`}>
              Problem {(s.is_problem_index ?? 0) + 1} of {s.is_problems?.length ?? 2}
            </span>
            <span className={`text-2xl font-black tabular-nums leading-none ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-[#f5a623]'}`}>{fmtTime(timerMs)}</span>
          </div>
          <div className="h-1 bg-white/5">
            <div
              className={`h-full transition-all ${timerWarn ? 'bg-red-400' : 'bg-[#f5a623]'}`}
              style={{ width: `${Math.max(0, Math.min(100, (timerMs / IS_TIME_MS) * 100))}%` }}
            />
          </div>
        </div>

        {/* Problem statement — capped height with INTERNAL scroll for long text */}
        {prob && (
          <div className="shrink-0 border-b border-white/10 px-4 py-2 bg-[#0a1628]/60 max-h-[18dvh] overflow-y-auto">
            <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-widest mb-1">Problem</p>
            <p className="text-sm md:text-base text-white leading-snug">{prob.statement}</p>
          </div>
        )}

        {/* Steps — stretch to fill remaining height evenly, no overflow */}
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 px-3 py-2 overflow-hidden">
          <p className="shrink-0 text-[9px] text-slate-400 font-bold uppercase tracking-widest">Arrange the steps in correct order</p>
          <div className="flex-1 min-h-0 flex flex-col gap-1.5">
            {mySteps.map((step, idx) => (
              <div key={idx} className="flex-1 basis-0 min-h-0 flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                <span className={`text-xs font-black w-5 text-center shrink-0 ${COLOR.text}`}>{idx + 1}</span>
                <p className="flex-1 text-xs md:text-sm text-white leading-tight line-clamp-2">{step}</p>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                    className="w-6 h-5 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-white disabled:opacity-20 transition-colors text-[10px]">▲</button>
                  <button onClick={() => moveStep(idx, 1)} disabled={idx === mySteps.length - 1}
                    className="w-6 h-5 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-white disabled:opacity-20 transition-colors text-[10px]">▼</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit pinned at the bottom */}
        <div className="shrink-0 border-t border-white/10 px-3 py-2 bg-[#060f1f]">
          {submitted ? (
            <div className={`text-center py-2 rounded-lg border ${COLOR.border} ${COLOR.text} text-xs font-bold`}>
              ✅ Answer submitted — waiting for the round to end
            </div>
          ) : (
            <button onClick={submitManually}
              className="w-full py-2.5 rounded-lg font-black text-sm text-[#0a1628] bg-[#f5a623] hover:bg-[#e0941a] transition-colors">
              Submit Answer
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col select-none">

      {/* Header — cumulative score intentionally omitted (kept off both team screens
          so students focus on the current round instead of the running total). */}
      <div className={`${COLOR.bg} border-b ${COLOR.border} px-6 py-4 text-center shrink-0`}>
        <p className={`text-[11px] font-black ${COLOR.text} uppercase tracking-[0.3em] mb-1`}>Your Team</p>
        <h1 className="text-2xl md:text-3xl font-black text-white">{myName}</h1>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 max-w-lg mx-auto w-full space-y-4">

        {/* ── Idle ── */}
        {round === 'idle' && (
          <div className="text-center space-y-4">
            <div className="text-7xl">🏆</div>
            <h2 className="text-2xl font-black text-white">{myName}</h2>
            <p className="text-slate-400 text-lg">Waiting for the admin to launch the match…</p>
          </div>
        )}

        {/* ── Finished ── */}
        {round === 'finished' && (
          <div className="text-center space-y-4 w-full">
            <div className="text-6xl">🏆</div>
            <h2 className="text-2xl font-black text-white">Match Complete!</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className={`bg-[#0a1628] border ${COLOR.border} rounded-2xl p-4 text-center`}>
                <p className={`text-xs font-bold ${COLOR.text} truncate`}>{myName}</p>
                <p className={`text-4xl font-black ${COLOR.text} mt-1`}>{myTotalScore}</p>
              </div>
              <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
                <p className="text-xs font-bold text-purple-400 truncate">{theirName}</p>
                <p className="text-4xl font-black text-purple-400 mt-1">{theirTotalScore}</p>
              </div>
            </div>
            {myTotalScore > theirTotalScore && (
              <div className="text-center py-4">
                <div className="text-5xl">🎉</div>
                <p className="text-2xl font-black text-[#f5a623] mt-2">You Win!</p>
              </div>
            )}
            {theirTotalScore > myTotalScore && (
              <p className="text-slate-400 font-semibold">Well played — {theirName} wins this one.</p>
            )}
            {myTotalScore === theirTotalScore && (
              <p className="text-[#f5a623] font-bold">It&apos;s a tie!</p>
            )}
          </div>
        )}

        {/* ── RAPID FIRE ── */}
        {round === 'rapid_fire' && (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
              <span className="text-[#f5a623] text-sm font-black">⚡ Rapid Fire Round</span>
            </div>

            {(s?.rf_phase === 'idle') && (
              <div className="text-center py-8 space-y-2">
                <p className="text-4xl">⚡</p>
                <p className="text-white font-bold">Rapid Fire is about to start!</p>
                <p className="text-slate-400 text-sm">10 questions in 60 seconds</p>
              </div>
            )}

            {(s?.rf_phase === 'a_playing' || s?.rf_phase === 'b_playing') && (
              <>
                <div className={`rounded-2xl p-4 text-center border-2 transition-all ${
                  timerWarn ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' :
                  s.rf_phase === 'a_playing' ? `${COLOR.border} bg-green-500/10` : 'border-purple-400/40 bg-purple-500/10'
                }`}>
                  <p className={`text-xs font-bold uppercase tracking-widest ${s.rf_phase === 'a_playing' ? COLOR.text : 'text-purple-400'}`}>
                    {s.rf_phase === 'a_playing' ? myName : theirName} — Time Remaining
                  </p>
                  <p className={`text-7xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : s.rf_phase === 'a_playing' ? COLOR.text : 'text-purple-400'}`}>
                    {fmtTime(timerMs)}
                  </p>
                  {s.rf_phase === 'a_playing' && (
                    <p className="text-xs text-slate-500 mt-2">Q {Math.min(s.rf_q_index + 1, RF_Q_COUNT)} of {RF_Q_COUNT}</p>
                  )}
                </div>

                {s.rf_phase === 'a_playing' && (
                  <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
                    <p className="text-[10px] text-slate-500 mb-1">{s.rf_questions?.[s.rf_q_index]?.category}</p>
                    <p className="text-xl font-bold text-white leading-snug">
                      {s.rf_questions?.[s.rf_q_index]?.question ?? ''}
                    </p>
                  </div>
                )}

                {s.rf_phase === 'b_playing' && (
                  <div className="bg-[#0a1628] border border-purple-500/20 rounded-2xl p-5 text-center">
                    <p className="text-purple-400 font-semibold">{theirName} is now playing</p>
                    <p className="text-slate-500 text-sm mt-1">Watch the timer!</p>
                  </div>
                )}

                {/* Live round scores — mirrors the audience view so students
                    always see the same running total the projector shows. */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`bg-green-950/40 border ${COLOR.border} rounded-2xl p-4 text-center`}>
                    <p className={`text-xs font-bold ${COLOR.text} truncate`}>{myName}</p>
                    <p className={`text-3xl font-black ${COLOR.text}`}>{s.rf_score_a}</p>
                  </div>
                  <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 text-center">
                    <p className="text-xs font-bold text-purple-400 truncate">{theirName}</p>
                    <p className="text-3xl font-black text-purple-400">{s.rf_score_b}</p>
                  </div>
                </div>
              </>
            )}

            {(s?.rf_phase === 'score_a' || s?.rf_phase === 'announce_b') && (
              <div className="space-y-3">
                <div className={`bg-[#0a1628] border ${COLOR.border} rounded-2xl p-5 text-center`}>
                  <p className={`text-xs font-bold ${COLOR.text}`}>{myName} — Done!</p>
                  <p className={`text-4xl font-black ${COLOR.text} mt-1`}>{s.rf_score_a} pts</p>
                  <p className="text-xs text-slate-500 mt-1">{s.rf_correct_a} correct out of {RF_Q_COUNT}</p>
                </div>
                <div className="bg-[#0a1628] border border-purple-500/20 rounded-2xl p-4 text-center">
                  <p className="text-purple-400 font-semibold text-sm">{theirName}&apos;s turn is next</p>
                  <p className="text-slate-500 text-xs mt-1">10 questions in 60 seconds</p>
                </div>
              </div>
            )}

            {s?.rf_phase === 'done' && (
              <div className="grid grid-cols-2 gap-3">
                <div className={`bg-[#0a1628] border ${COLOR.border} rounded-2xl p-4 text-center`}>
                  <p className={`text-xs font-bold ${COLOR.text} truncate`}>{myName}</p>
                  <p className={`text-3xl font-black ${COLOR.text} mt-1`}>{s.rf_score_a}</p>
                </div>
                <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
                  <p className="text-xs font-bold text-purple-400 truncate">{theirName}</p>
                  <p className="text-3xl font-black text-purple-400 mt-1">{s.rf_score_b}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BUZZER ROUND ── */}
        {round === 'buzzer' && (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
              <span className="text-blue-400 text-sm font-black">🔔 Buzzer Round</span>
              <span className="text-slate-500 text-xs">Q {(s?.bz_q_index ?? 0) + 1} of {s?.bz_questions?.length ?? 10}</span>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className={`bg-[#0a1628] border ${COLOR.border} rounded-xl p-2`}>
                <p className={`text-xs font-bold ${COLOR.text} truncate`}>{myName}</p>
                <p className={`text-2xl font-black ${COLOR.text}`}>{s?.bz_score_a ?? 0}</p>
              </div>
              <div className="bg-[#0a1628] border border-purple-500/30 rounded-xl p-2">
                <p className="text-xs font-bold text-purple-400 truncate">{theirName}</p>
                <p className="text-2xl font-black text-purple-400">{s?.bz_score_b ?? 0}</p>
              </div>
            </div>

            {s?.bz_phase === 'idle' && (
              <div className="text-center py-6">
                <p className="text-4xl animate-bounce">🔔</p>
                <p className="text-white font-bold mt-2">Next question coming…</p>
              </div>
            )}

            {s?.bz_phase === 'showing' && (
              <>
                <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
                  <p className="text-[10px] text-slate-500 mb-1">{s.bz_questions?.[s.bz_q_index]?.category}</p>
                  <p className="text-xl font-bold text-white leading-snug">
                    {s.bz_questions?.[s.bz_q_index]?.question ?? ''}
                  </p>
                </div>
                <button onClick={handleBuzz} disabled={buzzed}
                  className={`w-full py-10 rounded-2xl font-black text-3xl transition-all duration-150 border-2 ${
                    buzzed
                      ? `${COLOR.buzzed} opacity-70`
                      : `${COLOR.buzz} text-white shadow-2xl active:scale-95`
                  }`}>
                  {buzzed ? '🔔 Buzzed! Waiting…' : '🔔 BUZZ IN'}
                </button>
              </>
            )}

            {(s?.bz_phase === 'buzzed_a' || s?.bz_phase === 'buzzed_b') && (
              <>
                <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
                  <p className="text-xl font-bold text-white leading-snug">
                    {s.bz_questions?.[s.bz_q_index]?.question ?? ''}
                  </p>
                </div>
                <div className={`rounded-2xl px-5 py-5 text-center font-black text-xl border-2 ${
                  s.bz_phase === 'buzzed_a'
                    ? `${COLOR.border} bg-green-500/20 ${COLOR.text}`
                    : 'border-purple-400/60 bg-purple-500/20 text-purple-300'
                }`}>
                  {s.bz_phase === 'buzzed_a' ? (
                    <>🔔 You buzzed first!<br /><span className="text-base font-semibold opacity-80">Answer when admin prompts</span></>
                  ) : (
                    <>{theirName} buzzed first</>
                  )}
                </div>
                {(s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b') && (
                  <div className={`rounded-xl px-4 py-3 text-center border ${timerSecs <= 5 ? 'border-red-400 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
                    <p className={`text-4xl font-black ${timerSecs <= 5 ? 'text-red-400' : 'text-white'}`}>{timerSecs}s</p>
                  </div>
                )}
              </>
            )}

            {s?.bz_phase === 'second_chance' && (
              <div className={`rounded-2xl px-5 py-5 text-center border-2 ${
                s.bz_second_chance_team === TEAM
                  ? `${COLOR.border} bg-green-500/20 ${COLOR.text}`
                  : 'border-purple-400/60 bg-purple-500/20 text-purple-300'
              }`}>
                {s.bz_second_chance_team === TEAM ? (
                  <>
                    <p className="text-xl font-black">Your second chance!</p>
                    <p className="text-base font-semibold opacity-80 mt-1">Answer now — no penalty</p>
                    <p className="text-3xl font-black mt-2">{timerSecs}s</p>
                  </>
                ) : (
                  <p className="text-xl font-black">{theirName} has the second chance</p>
                )}
              </div>
            )}

            {s?.bz_phase === 'revealed' && (
              <div className={`rounded-xl px-5 py-4 text-center font-bold text-base border ${
                s.bz_last_result === 'correct_a' ? `bg-green-500/20 border-green-400/40 ${COLOR.text}` :
                s.bz_last_result === 'correct_b' ? 'bg-purple-500/20 border-purple-400/40 text-purple-300' :
                s.bz_last_result === 'penalty_a' ? 'bg-red-500/20 border-red-400/40 text-red-300' :
                'bg-slate-700/30 border-slate-600/30 text-slate-400'
              }`}>
                {s.bz_last_result === 'correct_a' && '✅ You answered correctly!'}
                {s.bz_last_result === 'correct_b' && `${theirName} answered correctly`}
                {s.bz_last_result === 'penalty_a' && '❌ Penalty applied — −5 pts'}
                {s.bz_last_result === 'penalty_b' && `${theirName} got a penalty`}
                {s.bz_last_result === 'skip' && '⏭ No one scored this round'}
              </div>
            )}

            {s?.bz_phase === 'done' && (
              <div className="text-center py-4">
                <p className="text-white font-bold text-lg">Buzzer Round Complete!</p>
                <p className="text-slate-400 text-sm mt-1">Innovation Sprint coming up next</p>
              </div>
            )}
          </div>
        )}

        {/* ── INNOVATION SPRINT ── */}
        {round === 'innovation_sprint' && (
          <div className="w-full space-y-4">
            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl">
              <span className="text-[#f5a623] text-sm font-black">💡 Innovation Sprint</span>
              <span className="text-slate-500 text-xs">Problem {(s?.is_problem_index ?? 0) + 1} of {s?.is_problems?.length ?? 2}</span>
            </div>

            {s?.is_phase === 'idle' && (
              <div className="text-center py-8 space-y-2">
                <p className="text-4xl">💡</p>
                <p className="text-white font-bold">Problem coming up…</p>
                <p className="text-slate-400 text-sm">Arrange the solution steps in the correct order</p>
                {s.is_problems?.[s.is_problem_index]?.statement && (
                  <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-5 text-left mt-4">
                    <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-wider mb-2">Problem Statement</p>
                    <p className="text-base text-white font-medium leading-relaxed">{s.is_problems[s.is_problem_index].statement}</p>
                  </div>
                )}
              </div>
            )}

            {s?.is_phase === 'ready' && (
              <div className="space-y-4">
                <div className="rounded-2xl border-4 border-[#f5a623] bg-[#f5a623]/10 p-6 text-center animate-pulse shadow-[0_16px_40px_-12px_rgba(245,166,35,0.5)]">
                  <p className="text-[#f5a623] text-xs font-black uppercase tracking-[0.4em]">Ready</p>
                  <p className="text-white text-4xl font-black mt-3 leading-none">GET SET</p>
                  <p className="text-slate-300 text-sm mt-4">Timer starts on the moderator&apos;s mark.</p>
                </div>
                {s.is_problems?.[s.is_problem_index]?.statement && (
                  <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-5 text-left">
                    <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-wider mb-2">Problem Statement</p>
                    <p className="text-base text-white font-medium leading-relaxed">{s.is_problems[s.is_problem_index].statement}</p>
                  </div>
                )}
              </div>
            )}

            {s?.is_phase === 'working' && (
              <>
                <div className={`rounded-2xl p-3 text-center border-2 transition-all ${
                  timerWarn ? 'border-red-400 bg-red-500/10 animate-pulse' : 'border-[#f5a623]/40 bg-[#f5a623]/5'
                }`}>
                  <p className={`text-5xl font-black ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-[#f5a623]'}`}>{fmtTime(timerMs)}</p>
                </div>

                {s.is_problems?.[s.is_problem_index] && (
                  <div className="bg-[#0a1628] border border-[#f5a623]/20 rounded-2xl p-4">
                    <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-wider mb-2">Problem</p>
                    <p className="text-sm text-white font-medium mb-4">{s.is_problems[s.is_problem_index].statement}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Arrange the steps in correct order:</p>
                    <div className="space-y-2">
                      {mySteps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                          <span className={`text-xs font-black w-5 text-center shrink-0 ${COLOR.text}`}>{idx + 1}</span>
                          <p className="flex-1 text-sm text-white leading-snug">{step}</p>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                              className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white disabled:opacity-20 transition-colors text-xs">▲</button>
                            <button onClick={() => moveStep(idx, 1)} disabled={idx === mySteps.length - 1}
                              className="w-7 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white disabled:opacity-20 transition-colors text-xs">▼</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {submitted ? (
                      <div className={`mt-3 text-center py-2 rounded-xl border ${COLOR.border} ${COLOR.text} text-xs font-bold`}>
                        ✅ Answer submitted
                      </div>
                    ) : (
                      <button onClick={submitManually}
                        className={`mt-3 w-full py-3 rounded-xl font-bold text-sm text-[#0a1628] bg-[#f5a623] hover:bg-[#e0941a] transition-colors`}>
                        Submit Answer
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {s?.is_phase === 'collecting' && (
              <div className="text-center space-y-3 py-6">
                <Loader2 className={`animate-spin ${COLOR.text} mx-auto`} size={32} />
                <p className="text-white font-bold">Collecting answers…</p>
                {submitted
                  ? <p className={`text-xs ${COLOR.text}`}>✅ Your answer was submitted</p>
                  : <p className="text-xs text-red-400">Submitting your arrangement…</p>
                }
              </div>
            )}

            {s?.is_phase === 'revealed' && (
              <div className="space-y-3">
                <div className="text-center space-y-1">
                  <div className="text-4xl">📊</div>
                  <p className="text-white font-bold text-lg">Results Revealed!</p>
                </div>

                {/* Per-step breakdown for MY team */}
                {s.is_team_a_answer && s.is_step_results_a && (
                  <div className={`bg-[#0a1628] border ${COLOR.border} rounded-2xl p-4`}>
                    <p className={`text-[10px] font-bold ${COLOR.text} uppercase tracking-wider mb-3`}>{myName} — Step Breakdown</p>
                    {s.is_team_a_answer.map((step, i) => {
                      const ok = s.is_step_results_a![i]
                      return (
                        <div key={i} className="flex items-start gap-2 py-2 border-b border-white/5 last:border-0">
                          <span className={`text-sm shrink-0 mt-0.5 ${ok ? 'text-green-400' : 'text-red-400'}`}>
                            {ok ? '✅' : '❌'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-bold mb-0.5 ${ok ? 'text-green-400' : 'text-red-400'}`}>
                              Step {i + 1} — {ok ? 'Correct' : 'Wrong position'}
                            </p>
                            <p className="text-xs text-white/80 leading-snug">{step}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Score comparison */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`bg-[#0a1628] border ${COLOR.border} rounded-2xl p-4 text-center`}>
                    <p className={`text-xs font-bold ${COLOR.text}`}>{myName}</p>
                    <p className={`text-3xl font-black ${COLOR.text} mt-1`}>{s.is_score_a}</p>
                    <p className="text-xs text-slate-500">IS points</p>
                  </div>
                  <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
                    <p className="text-xs font-bold text-purple-400">{theirName}</p>
                    <p className="text-3xl font-black text-purple-400 mt-1">{s.is_score_b}</p>
                    <p className="text-xs text-slate-500">IS points</p>
                  </div>
                </div>
                {s.is_problem_index + 1 < (s.is_problems?.length ?? 2) && (
                  <p className="text-slate-400 text-sm text-center">Next problem coming up…</p>
                )}
              </div>
            )}

            {/* Head-to-head compare — mirrors the audience view so the team
                sees the same per-problem table + total the projector shows. */}
            {s?.is_phase === 'compare' && (() => {
              const a = s.is_score_a
              const b = s.is_score_b
              const aWins = a > b
              const bWins = b > a
              return (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-[#f5a623] uppercase tracking-[0.4em]">Innovation Sprint · Final</p>
                    <h2 className="text-2xl font-black text-white mt-1">Head-to-Head</h2>
                  </div>
                  <div className="bg-[#0a1628] border border-white/10 rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-3 bg-white/5">
                      <div className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Problem</div>
                      <div className={`px-3 py-2 text-[9px] font-black ${COLOR.text} uppercase tracking-widest text-center truncate`}>{myName}</div>
                      <div className="px-3 py-2 text-[9px] font-black text-purple-400 uppercase tracking-widest text-center truncate">{theirName}</div>
                    </div>
                    {Array.from({ length: (s.is_problems?.length ?? 2) }).map((_, i) => {
                      const pa = s.is_problem_scores_a?.[i] ?? 0
                      const pb = s.is_problem_scores_b?.[i] ?? 0
                      return (
                        <div key={i} className="grid grid-cols-3 border-t border-white/5">
                          <div className="px-3 py-3 text-sm font-bold text-white">Problem {i + 1}</div>
                          <div className={`px-3 py-3 text-center text-xl font-black ${pa >= pb ? COLOR.text : 'text-slate-500'}`}>{pa}</div>
                          <div className={`px-3 py-3 text-center text-xl font-black ${pb >= pa ? 'text-purple-300' : 'text-slate-500'}`}>{pb}</div>
                        </div>
                      )
                    })}
                    <div className="grid grid-cols-3 border-t-2 border-[#f5a623]/40 bg-[#f5a623]/5">
                      <div className="px-3 py-3 text-sm font-black text-[#f5a623] uppercase tracking-widest">Total</div>
                      <div className={`px-3 py-3 text-center text-3xl font-black ${aWins ? COLOR.text : 'text-white'}`}>{a}</div>
                      <div className={`px-3 py-3 text-center text-3xl font-black ${bWins ? 'text-purple-300' : 'text-white'}`}>{b}</div>
                    </div>
                  </div>
                  <p className="text-center text-white text-lg font-black">
                    {aWins ? `🏆 ${myName} wins the Innovation Sprint`
                      : bWins ? `🏆 ${theirName} wins the Innovation Sprint`
                      : `🤝 It's a tie at ${a}`}
                  </p>
                </div>
              )
            })()}

            {s?.is_phase === 'done' && (
              <div className="text-center py-4 space-y-2">
                <p className="text-white font-bold text-lg">Innovation Sprint Complete!</p>
                <div className={`text-4xl font-black ${COLOR.text}`}>{s.is_score_a} pts</div>
                <p className="text-slate-400 text-sm">Final scores coming up…</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
