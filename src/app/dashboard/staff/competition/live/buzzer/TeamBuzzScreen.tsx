'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { BZ_CHANNEL, type BzLiveState } from './types'

const TIMER_DURATION = 10000

function defaultState(): BzLiveState {
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
    timerDuration: TIMER_DURATION,
  }
}

export default function TeamBuzzScreen({ team }: { team: 'a' | 'b' }) {
  const [gameState, setGameState] = useState<BzLiveState>(defaultState())
  const [buzzStatus, setBuzzStatus] = useState<'idle' | 'won' | 'lost'>('idle')
  const [countdown, setCountdown] = useState(10)
  const [dots, setDots] = useState('')

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stateRef = useRef<BzLiveState>(defaultState())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const color = team === 'a' ? 'blue' : 'purple'
  const accentText = color === 'blue' ? 'text-blue-300' : 'text-purple-300'
  const accentBg = color === 'blue' ? 'bg-blue-600' : 'bg-purple-600'
  const accentBorder = color === 'blue' ? 'border-blue-400' : 'border-purple-400'
  const accentGlow = color === 'blue' ? '0 0 80px rgba(96,165,250,0.5)' : '0 0 80px rgba(167,139,250,0.5)'
  const accentBgLight = color === 'blue' ? 'bg-blue-500/20' : 'bg-purple-500/20'

  const applyState = (s: BzLiveState) => {
    stateRef.current = s
    setGameState(s)

    // Reset buzz status when a new question starts
    if (s.phase === 'ready' || s.phase === 'open') {
      setBuzzStatus('idle')
    }

    // Timer
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (s.buzzStartedAt && (s.phase === 'buzzed' || s.phase === 'bonus')) {
      const tick = () => {
        const elapsed = Date.now() - (stateRef.current.buzzStartedAt ?? Date.now())
        const rem = Math.max(0, Math.ceil((TIMER_DURATION - elapsed) / 1000))
        setCountdown(rem)
      }
      tick()
      timerRef.current = setInterval(tick, 200)
    }
  }

  useEffect(() => {
    // Load state from DB on mount (cross-device late join)
    ;(supabase as any)
      .from('sc_buzzer_session')
      .select('*')
      .eq('id', 'main')
      .single()
      .then(({ data }: { data: BzLiveState | null }) => {
        if (data) applyState(data)
      })

    // Realtime broadcast
    const ch = supabase.channel(BZ_CHANNEL + '_team_' + team + '_' + Math.random().toString(36).slice(2))
    channelRef.current = ch
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applyState(payload as BzLiveState)
    })
    ch.subscribe()

    // localStorage polling fallback
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem('sc_bz_state')
        if (!raw) return
        const parsed: BzLiveState = JSON.parse(raw)
        if (
          parsed.phase !== stateRef.current.phase ||
          parsed.questionIndex !== stateRef.current.questionIndex ||
          parsed.buzzedTeam !== stateRef.current.buzzedTeam ||
          parsed.bonusTeam !== stateRef.current.bonusTeam
        ) {
          applyState(parsed)
        }
      } catch { /* ignore */ }
    }, 150)

    // Animated dots
    const dotsInt = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)

    return () => {
      supabase.removeChannel(ch)
      clearInterval(poll)
      clearInterval(dotsInt)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBuzz = async () => {
    if (!channelRef.current || buzzStatus !== 'idle') return

    try {
      const { data } = await (supabase as any).rpc('sc_buzz_in', { p_team: team })
      if (data === true) {
        // Won the race — notify admin
        await channelRef.current.send({
          type: 'broadcast',
          event: 'buzzed',
          payload: { team },
        })
        setBuzzStatus('won')
      } else {
        setBuzzStatus('lost')
        setTimeout(() => setBuzzStatus('idle'), 2000)
      }
    } catch {
      // RPC not set up — broadcast anyway as fallback
      await channelRef.current.send({
        type: 'broadcast',
        event: 'buzzed',
        payload: { team },
      })
      setBuzzStatus('won')
    }
  }

  const {
    phase, teamAName, teamBName, scoreA, scoreB,
    questionText, questionSubject, buzzedTeam, bonusTeam,
    questionIndex, totalQuestions,
  } = gameState

  const myName = team === 'a' ? teamAName : teamBName
  const oppName = team === 'a' ? teamBName : teamAName
  const myScore = team === 'a' ? scoreA : scoreB
  const oppScore = team === 'a' ? scoreB : scoreA

  const isBuzzedMe = buzzedTeam === team
  const isBuzzedOpp = buzzedTeam !== null && buzzedTeam !== team
  const isBonusMe = bonusTeam === team
  const isBonusOpp = bonusTeam !== null && bonusTeam !== team

  const isCountingDown = (phase === 'buzzed' && isBuzzedMe) || (phase === 'bonus' && isBonusMe)
  const isRed = countdown <= 3

  // ─── SETUP ───────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-7xl">⚡</div>
        <h1 className={`text-4xl font-black ${accentText}`}>{myName}</h1>
        <p className="text-xl text-slate-400">Waiting for round to start{dots}</p>
        <div className="flex gap-2 mt-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${color === 'blue' ? 'bg-blue-400' : 'bg-purple-400'}`}
              style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
      </div>
    )
  }

  // ─── DONE ────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const won = myScore > oppScore
    const tied = myScore === oppScore
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-6xl">{won ? '🏆' : tied ? '🤝' : '💪'}</div>
        <h2 className="text-3xl font-black text-white">Round Complete!</h2>

        <div className={`w-full max-w-xs py-8 rounded-3xl border-2 ${accentBorder} ${accentBgLight} text-center`}>
          <p className="text-sm text-slate-400 mb-1">{myName}</p>
          <p className={`text-7xl font-black ${accentText}`}>{myScore}</p>
        </div>
        <div className="w-full max-w-xs py-5 rounded-2xl border border-white/10 bg-white/5 text-center">
          <p className="text-sm text-slate-400 mb-1">{oppName}</p>
          <p className="text-5xl font-black text-slate-300">{oppScore}</p>
        </div>

        <p className={`text-lg font-bold ${won ? 'text-yellow-400' : tied ? 'text-slate-300' : 'text-slate-400'}`}>
          {won ? 'Your team wins! 🎉' : tied ? "It's a tie!" : 'Better luck next time!'}
        </p>
      </div>
    )
  }

  // ─── PLAYING PHASES ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col">

      {/* Top bar: team identity + scores */}
      <div className={`border-b border-white/10 px-5 py-3 flex items-center justify-between ${accentBgLight}`}>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-widest">Your team</p>
          <p className={`text-lg font-black ${accentText}`}>{myName}</p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className={`text-2xl font-black ${accentText}`}>{myScore}</p>
            <p className="text-xs text-slate-500 truncate max-w-[80px]">{myName}</p>
          </div>
          <span className="text-slate-600 text-lg">|</span>
          <div className="text-center">
            <p className="text-2xl font-black text-slate-300">{oppScore}</p>
            <p className="text-xs text-slate-500 truncate max-w-[80px]">{oppName}</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      {totalQuestions > 0 && (
        <div className="px-5 py-1.5 bg-[#050d1a] border-b border-white/5 text-center">
          <p className="text-xs text-slate-500">Question {questionIndex + 1} of {totalQuestions}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">

        {/* Question */}
        {questionText && (
          <div className="w-full max-w-lg text-center">
            {questionSubject && (
              <p className={`text-xs uppercase tracking-widest mb-3 ${accentText} opacity-70`}>{questionSubject}</p>
            )}
            <p className="text-2xl font-semibold text-white leading-relaxed">{questionText}</p>
          </div>
        )}

        {/* ── READY: pulsing "get ready" ── */}
        {phase === 'ready' && (
          <div className="flex flex-col items-center gap-3">
            <div className={`w-24 h-24 rounded-full border-4 ${accentBorder} flex items-center justify-center opacity-50 animate-pulse`}>
              <span className="text-4xl">⚡</span>
            </div>
            <p className="text-slate-400 text-lg">Get ready to buzz!</p>
          </div>
        )}

        {/* ── OPEN: big buzz button ── */}
        {phase === 'open' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-4">
            {buzzStatus === 'won' ? (
              <div className={`w-full py-20 rounded-3xl border-4 ${accentBorder} ${accentBgLight} text-center`}>
                <div className="text-6xl mb-4">⚡</div>
                <p className={`text-4xl font-black ${accentText}`}>YOU BUZZED IN!</p>
                <p className="text-slate-300 mt-2 text-lg">Speak your answer now</p>
              </div>
            ) : buzzStatus === 'lost' ? (
              <div className="w-full py-20 rounded-3xl border-2 border-red-400/40 bg-red-500/10 text-center">
                <div className="text-5xl mb-3">😅</div>
                <p className="text-3xl font-bold text-red-400">Too slow!</p>
              </div>
            ) : (
              <button
                onClick={handleBuzz}
                className={`w-full py-28 ${accentBg} hover:brightness-110 active:scale-95 text-white font-black text-5xl rounded-3xl transition-all select-none`}
                style={{ boxShadow: accentGlow }}
              >
                ⚡<br />
                <span className="text-3xl mt-2 block">BUZZ!</span>
              </button>
            )}
          </div>
        )}

        {/* ── BUZZED ── */}
        {phase === 'buzzed' && (
          <div className="w-full max-w-sm">
            {isBuzzedMe ? (
              <div className={`py-10 rounded-3xl border-4 ${accentBorder} ${accentBgLight} text-center`}>
                <p className="text-slate-300 text-lg mb-1">YOU BUZZED IN!</p>
                <p className="text-slate-300 mb-4">Answer now —</p>
                <p className={`text-8xl font-black ${isRed ? 'text-red-400' : accentText}`}>{countdown}</p>
                <p className="text-slate-400 text-sm mt-2">seconds remaining</p>
              </div>
            ) : (
              <div className="py-10 rounded-3xl border border-white/10 bg-white/5 text-center">
                <div className="text-4xl mb-3">🔔</div>
                <p className="text-xl font-bold text-slate-300">{oppName} buzzed first</p>
                <p className="text-slate-500 mt-2">Wait for your bonus chance…</p>
              </div>
            )}
          </div>
        )}

        {/* ── BONUS ── */}
        {phase === 'bonus' && (
          <div className="w-full max-w-sm">
            {isBonusMe ? (
              <div className="py-10 rounded-3xl border-4 border-yellow-400/60 bg-yellow-500/10 text-center">
                <div className="text-4xl mb-2">🎯</div>
                <p className="text-2xl font-black text-yellow-300">BONUS CHANCE!</p>
                <p className="text-yellow-400 text-sm mt-1 mb-4">+5 points if correct</p>
                <p className={`text-8xl font-black ${isRed ? 'text-red-400' : 'text-yellow-300'}`}>{countdown}</p>
                <p className="text-slate-400 text-sm mt-2">seconds remaining</p>
              </div>
            ) : (
              <div className="py-10 rounded-3xl border border-white/10 bg-white/5 text-center">
                <div className="text-3xl mb-3">⏳</div>
                <p className="text-xl font-bold text-slate-300">{oppName} has the bonus</p>
                <p className="text-slate-500 mt-2">Next question coming up…</p>
              </div>
            )}
          </div>
        )}

        {/* Countdown circle for when my team is on the clock */}
        {isCountingDown && (
          <CountdownRing value={countdown} isRed={isRed} color={color} />
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
