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

export default function BuzzParticipantPage() {
  const [team, setTeam] = useState<'a' | 'b' | null>(null)
  const [gameState, setGameState] = useState<BzLiveState>(defaultState())
  const [buzzStatus, setBuzzStatus] = useState<'idle' | 'won' | 'lost' | null>(null)
  const [countdown, setCountdown] = useState(10)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stateRef = useRef<BzLiveState>(defaultState())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const applyState = (s: BzLiveState) => {
    stateRef.current = s
    setGameState(s)
    // Reset buzz status on phase change
    if (s.phase === 'ready' || s.phase === 'open') setBuzzStatus('idle')
    // Update countdown timer
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

  // ─── Load team from localStorage & initial state from DB ─────────────────────
  useEffect(() => {
    const savedTeam = localStorage.getItem('sc_bz_team') as 'a' | 'b' | null
    if (savedTeam) setTeam(savedTeam)

    ;(supabase as any)
      .from('sc_buzzer_session')
      .select('*')
      .eq('id', 'main')
      .single()
      .then(({ data }: { data: BzLiveState | null }) => {
        if (data) applyState(data)
      })

    // Subscribe to realtime
    const ch = supabase.channel(BZ_CHANNEL + '_participant_' + Math.random().toString(36).slice(2))
    channelRef.current = ch

    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (payload) applyState(payload as BzLiveState)
    })
    ch.subscribe()

    // Poll localStorage fallback
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem('sc_bz_state')
        if (!raw) return
        const parsed: BzLiveState = JSON.parse(raw)
        if (parsed.phase !== stateRef.current.phase || parsed.questionIndex !== stateRef.current.questionIndex) {
          applyState(parsed)
        }
      } catch { /* ignore */ }
    }, 150)

    return () => {
      supabase.removeChannel(ch)
      clearInterval(poll)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTeamSelect = (t: 'a' | 'b') => {
    localStorage.setItem('sc_bz_team', t)
    setTeam(t)
  }

  const handleBuzz = async () => {
    if (!team || !channelRef.current) return
    try {
      const { data } = await (supabase as any).rpc('sc_buzz_in', { p_team: team })
      if (data === true) {
        // Won the race — broadcast to admin
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
      // Fallback: just broadcast (no race protection)
      await channelRef.current.send({
        type: 'broadcast',
        event: 'buzzed',
        payload: { team },
      })
      setBuzzStatus('won')
    }
  }

  const { phase, teamAName, teamBName, scoreA, scoreB, buzzedTeam, bonusTeam, questionText, questionSubject } = gameState
  const myName = team === 'a' ? teamAName : teamBName
  const oppName = team === 'a' ? teamBName : teamAName
  const myScore = team === 'a' ? scoreA : scoreB
  const oppScore = team === 'a' ? scoreB : scoreA
  const myColor = team === 'a' ? 'blue' : 'purple'
  const iMyTurn = team && (buzzedTeam === team || bonusTeam === team)
  const isOppTurn = team && (buzzedTeam !== null && buzzedTeam !== team && bonusTeam === null)

  // ─── Team selector ────────────────────────────────────────────────────────────
  if (!team) {
    return (
      <div className="min-h-screen bg-[#040c18] text-white flex flex-col items-center justify-center gap-8 px-6">
        <div className="text-6xl">⚡</div>
        <h1 className="text-3xl font-black text-blue-300">SELECT YOUR TEAM</h1>
        <p className="text-slate-400 text-center">Tap your team to join the buzzer round</p>
        <div className="grid grid-cols-1 gap-5 w-full max-w-sm">
          <button
            onClick={() => handleTeamSelect('a')}
            className="py-12 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-3xl rounded-3xl shadow-lg shadow-blue-500/30 transition-all"
          >
            Team A<br />
            <span className="text-base font-normal opacity-70">{gameState.teamAName}</span>
          </button>
          <button
            onClick={() => handleTeamSelect('b')}
            className="py-12 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-black text-3xl rounded-3xl shadow-lg shadow-purple-500/30 transition-all"
          >
            Team B<br />
            <span className="text-base font-normal opacity-70">{gameState.teamBName}</span>
          </button>
        </div>
      </div>
    )
  }

  const accentBg = myColor === 'blue' ? 'bg-blue-600' : 'bg-purple-600'
  const accentText = myColor === 'blue' ? 'text-blue-300' : 'text-purple-300'
  const accentBorder = myColor === 'blue' ? 'border-blue-400' : 'border-purple-400'

  return (
    <div className="min-h-screen bg-[#040c18] text-white flex flex-col">
      {/* Header */}
      <div className="bg-[#070f1c] border-b border-white/10 px-5 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Playing as</p>
          <p className={`text-sm font-bold ${accentText}`}>{myName}</p>
        </div>
        <button
          onClick={() => { localStorage.removeItem('sc_bz_team'); setTeam(null) }}
          className="text-xs text-slate-500 hover:text-slate-300 transition"
        >
          Change team
        </button>
      </div>

      {/* Scores */}
      <div className="px-5 py-3 bg-[#050d1a] border-b border-white/5 flex items-center justify-center gap-8 text-sm">
        <span className={`font-bold ${accentText}`}>{myName}: {myScore}</span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400">{oppName}: {oppScore}</span>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">

        {/* Question */}
        {questionText && (
          <div className="w-full max-w-sm text-center">
            {questionSubject && <p className="text-xs text-blue-400/60 uppercase tracking-wider mb-2">{questionSubject}</p>}
            <p className="text-lg font-semibold text-white leading-relaxed">{questionText}</p>
          </div>
        )}

        {/* Phase UX */}
        {(phase === 'setup' || phase === 'ready') && (
          <div className="text-center">
            <div className="text-5xl mb-4">⏳</div>
            <p className="text-slate-400 text-lg">
              {phase === 'setup' ? 'Waiting for round to start…' : 'Get ready to buzz!'}
            </p>
          </div>
        )}

        {phase === 'open' && (
          <div className="w-full max-w-sm flex flex-col items-center gap-4">
            {buzzStatus === 'won' ? (
              <div className={`w-full py-16 rounded-3xl border-2 ${accentBorder} ${accentBg}/20 text-center`}>
                <div className="text-5xl mb-3">⚡</div>
                <p className={`text-3xl font-black ${accentText}`}>YOU BUZZED IN!</p>
              </div>
            ) : buzzStatus === 'lost' ? (
              <div className="w-full py-16 rounded-3xl border-2 border-red-400/40 bg-red-500/10 text-center">
                <div className="text-5xl mb-3">😅</div>
                <p className="text-2xl font-bold text-red-400">Too slow!</p>
              </div>
            ) : (
              <button
                onClick={handleBuzz}
                className={`w-full py-24 ${accentBg} hover:brightness-110 active:scale-95 text-white font-black text-4xl rounded-3xl shadow-2xl transition-all`}
                style={{ boxShadow: myColor === 'blue' ? '0 0 60px rgba(96,165,250,0.4)' : '0 0 60px rgba(167,139,250,0.4)' }}
              >
                ⚡ BUZZ!
              </button>
            )}
          </div>
        )}

        {phase === 'buzzed' && (
          <div className="w-full max-w-sm text-center">
            {iMyTurn ? (
              <div className={`py-10 rounded-3xl border-2 ${accentBorder} ${accentBg}/20`}>
                <p className="text-2xl font-black text-white mb-2">YOU BUZZED IN!</p>
                <p className={`text-6xl font-black ${accentText}`}>{countdown}</p>
                <p className="text-slate-400 text-sm mt-2">seconds to answer</p>
              </div>
            ) : (
              <div className="py-10 rounded-3xl border border-white/10 bg-white/5 text-center">
                <div className="text-4xl mb-3">🔔</div>
                <p className="text-xl font-bold text-slate-300">{oppName} buzzed first</p>
              </div>
            )}
          </div>
        )}

        {phase === 'bonus' && (
          <div className="w-full max-w-sm text-center">
            {bonusTeam === team ? (
              <div className={`py-10 rounded-3xl border-2 border-yellow-400/60 bg-yellow-500/10`}>
                <div className="text-4xl mb-3">🎯</div>
                <p className="text-2xl font-black text-yellow-300">BONUS CHANCE!</p>
                <p className="text-yellow-400 mt-2">+5 points if correct</p>
                <p className={`text-5xl font-black ${accentText} mt-4`}>{countdown}s</p>
              </div>
            ) : (
              <div className="py-10 rounded-3xl border border-white/10 bg-white/5 text-center">
                <p className="text-xl font-bold text-slate-300">{oppName} has the bonus chance</p>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="w-full max-w-sm text-center">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-2xl font-black text-white mb-6">Round Complete!</h2>
            <div className={`py-6 rounded-2xl border-2 ${accentBorder} ${accentBg}/20 mb-4`}>
              <p className="text-sm text-slate-400">{myName}</p>
              <p className={`text-6xl font-black ${accentText}`}>{myScore}</p>
            </div>
            <div className="py-4 rounded-2xl border border-white/10 bg-white/5">
              <p className="text-sm text-slate-400">{oppName}</p>
              <p className="text-4xl font-black text-slate-300">{oppScore}</p>
            </div>
            {myScore > oppScore && <p className="mt-4 text-lg font-bold text-yellow-400">Your team wins! 🎉</p>}
            {oppScore > myScore && <p className="mt-4 text-lg font-bold text-slate-400">Better luck next time!</p>}
            {myScore === oppScore && <p className="mt-4 text-lg font-bold text-slate-300">It's a tie!</p>}
          </div>
        )}
      </div>
    </div>
  )
}
