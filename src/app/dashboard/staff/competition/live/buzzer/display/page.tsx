'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { BZ_CHANNEL, type BzLiveState } from '../types'

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

export default function BuzzerDisplayPage() {
  const [state, setState] = useState<BzLiveState>(defaultState())
  const [countdown, setCountdown] = useState(10)
  const [dots, setDots] = useState('')
  const stateRef = useRef<BzLiveState>(defaultState())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dotsRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const applyState = (s: BzLiveState) => {
    stateRef.current = s
    setState(s)
    updateCountdown(s)
  }

  const updateCountdown = (s: BzLiveState) => {
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
    // Admin is the single source of truth — no DB read on mount.
    // Subscribe to the same Realtime channel as admin.
    const ch = supabase.channel(BZ_CHANNEL)

    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applyState(payload as BzLiveState)
    })

    // On connect: ping admin so it immediately re-sends current state
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'ping', payload: {} }).catch(() => {})
      }
    })

    // localStorage fallback (same-browser / same-device)
    pollRef.current = setInterval(() => {
      try {
        const raw = localStorage.getItem('sc_bz_state')
        if (!raw) return
        const parsed: BzLiveState = JSON.parse(raw)
        if (parsed.phase !== stateRef.current.phase || parsed.questionIndex !== stateRef.current.questionIndex) {
          applyState(parsed)
        }
      } catch { /* ignore */ }
    }, 150)

    // Animated dots for setup/waiting screen
    dotsRef.current = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)

    return () => {
      supabase.removeChannel(ch)
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      if (dotsRef.current) clearInterval(dotsRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { phase, teamAName, teamBName, scoreA, scoreB, questionText, questionSubject, buzzedTeam, bonusTeam, questionIndex, totalQuestions } = state

  // ─── SETUP ───────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-[#040c18] flex flex-col items-center justify-center text-white">
        <div className="text-center">
          <div className="text-8xl mb-8">⚡</div>
          <h1 className="text-6xl font-black tracking-tight text-blue-300 mb-4">BUZZER ROUND</h1>
          <p className="text-2xl text-slate-400">
            Get ready{dots}
          </p>
          <div className="mt-12 flex gap-2 justify-center">
            {[0,1,2].map(i => (
              <div
                key={i}
                className="w-3 h-3 bg-blue-400 rounded-full"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.2;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
      </div>
    )
  }

  // ─── DONE ────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-[#040c18] flex flex-col items-center justify-center text-white px-8">
        <h1 className="text-5xl font-black text-blue-300 mb-10">FINAL SCORES</h1>
        <div className="grid grid-cols-3 gap-8 items-center w-full max-w-3xl">
          <ScorePanel name={teamAName} score={scoreA} color="blue" winner={scoreA > scoreB} />
          <div className="text-center text-4xl font-black text-slate-600">VS</div>
          <ScorePanel name={teamBName} score={scoreB} color="purple" winner={scoreB > scoreA} />
        </div>
        <p className="mt-10 text-2xl font-bold text-slate-400">
          {scoreA === scoreB ? "It's a Tie!" : `${scoreA > scoreB ? teamAName : teamBName} Wins!`}
        </p>
      </div>
    )
  }

  // ─── PLAYING PHASES ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
      {/* Scoreboard */}
      <div className="bg-[#070f1c] border-b border-blue-500/20 px-12 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <TeamScore name={teamAName} score={scoreA} color="blue" highlight={buzzedTeam === 'a' || bonusTeam === 'a'} />
          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Question</p>
            <p className="text-2xl font-black text-slate-300">{questionIndex + 1}<span className="text-slate-600 text-lg">/{totalQuestions}</span></p>
          </div>
          <TeamScore name={teamBName} score={scoreB} color="purple" highlight={buzzedTeam === 'b' || bonusTeam === 'b'} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-12 py-8 gap-8">

        {/* Question */}
        {questionText && (
          <div className="w-full max-w-4xl text-center">
            {questionSubject && (
              <p className="text-sm text-blue-400/70 uppercase tracking-widest mb-4">{questionSubject}</p>
            )}
            <p className="text-4xl font-bold leading-relaxed text-white">{questionText}</p>
          </div>
        )}

        {/* Phase-specific overlays */}
        {(phase === 'ready' || phase === 'open') && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-green-500/20 rounded-full blur-3xl scale-150" />
              <div className="relative px-10 py-4 bg-green-500/20 border-2 border-green-400 rounded-full">
                <span className="text-3xl font-black text-green-400 tracking-widest animate-pulse">BUZZ OPEN ⚡</span>
              </div>
            </div>
          </div>
        )}

        {phase === 'buzzed' && buzzedTeam && (
          <div className="flex flex-col items-center gap-6">
            <BuzzedBanner name={buzzedTeam === 'a' ? teamAName : teamBName} color={buzzedTeam === 'a' ? 'blue' : 'purple'} />
            <CountdownCircle value={countdown} max={10} color={buzzedTeam === 'a' ? 'blue' : 'purple'} />
          </div>
        )}

        {phase === 'bonus' && bonusTeam && (
          <div className="flex flex-col items-center gap-6">
            <div className={`px-10 py-5 rounded-2xl border-2 text-center ${bonusTeam === 'a' ? 'bg-blue-500/20 border-blue-400' : 'bg-purple-500/20 border-purple-400'}`}>
              <p className="text-lg text-slate-300 mb-1">BONUS CHANCE</p>
              <p className={`text-4xl font-black ${bonusTeam === 'a' ? 'text-blue-300' : 'text-purple-300'}`}>
                {bonusTeam === 'a' ? teamAName : teamBName}
              </p>
              <p className="text-xl text-yellow-400 font-bold mt-2">+5 points if correct</p>
            </div>
            <CountdownCircle value={countdown} max={10} color={bonusTeam === 'a' ? 'blue' : 'purple'} />
          </div>
        )}
      </div>
    </div>
  )
}

function TeamScore({ name, score, color, highlight }: { name: string; score: number; color: 'blue' | 'purple'; highlight: boolean }) {
  const c = color === 'blue' ? 'text-blue-300 border-blue-400 bg-blue-500/20' : 'text-purple-300 border-purple-400 bg-purple-500/20'
  return (
    <div className={`text-center px-6 py-2 rounded-xl border transition-all ${highlight ? c : 'border-transparent'}`}>
      <p className="text-sm text-slate-400 truncate max-w-[160px]">{name}</p>
      <p className={`text-5xl font-black ${color === 'blue' ? 'text-blue-300' : 'text-purple-300'}`}>{score}</p>
    </div>
  )
}

function ScorePanel({ name, score, color, winner }: { name: string; score: number; color: 'blue' | 'purple'; winner: boolean }) {
  const c = color === 'blue' ? 'border-blue-400 bg-blue-500/20 text-blue-300' : 'border-purple-400 bg-purple-500/20 text-purple-300'
  return (
    <div className={`text-center p-8 rounded-2xl border-2 ${winner ? c : 'border-white/10 bg-white/5'}`}>
      <p className="text-lg text-slate-400 mb-2 truncate">{name}</p>
      <p className={`text-8xl font-black ${color === 'blue' ? 'text-blue-300' : 'text-purple-300'}`}>{score}</p>
      {winner && <p className="text-2xl mt-3">🏆</p>}
    </div>
  )
}

function BuzzedBanner({ name, color }: { name: string; color: 'blue' | 'purple' }) {
  const c = color === 'blue' ? 'border-blue-400 bg-blue-500/20 text-blue-300' : 'border-purple-400 bg-purple-500/20 text-purple-300'
  return (
    <div className={`px-12 py-6 rounded-2xl border-2 text-center ${c}`}>
      <p className="text-xl text-slate-400 mb-1">BUZZED IN!</p>
      <p className="text-6xl font-black">{name}</p>
      <p className="text-4xl mt-2">⚡</p>
    </div>
  )
}

function CountdownCircle({ value, max, color }: { value: number; max: number; color: 'blue' | 'purple' }) {
  const r = 60
  const circ = 2 * Math.PI * r
  const offset = circ - (value / max) * circ
  const isRed = value <= 3
  const stroke = isRed ? '#ef4444' : color === 'blue' ? '#60a5fa' : '#a78bfa'
  const textColor = isRed ? 'text-red-400' : color === 'blue' ? 'text-blue-300' : 'text-purple-300'

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="160" height="160" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="80" cy="80" r={r} fill="none"
          stroke={stroke} strokeWidth="8"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.2s linear, stroke 0.3s' }}
        />
      </svg>
      <span className={`text-6xl font-black ${textColor}`}>{value}</span>
    </div>
  )
}
