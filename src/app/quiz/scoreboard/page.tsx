'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Trophy, Medal, Crown, Loader2, RefreshCw, Users, ArrowLeft } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { getSessionById, getParticipants, type QuizSession, type QuizParticipant } from '@/lib/quiz'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const RANK_STYLES = [
  { bg: 'bg-yellow-400', text: 'text-yellow-900', icon: Crown,  label: '1st' },
  { bg: 'bg-gray-300',   text: 'text-gray-800',  icon: Medal,  label: '2nd' },
  { bg: 'bg-orange-400', text: 'text-orange-900', icon: Medal,  label: '3rd' },
]

function ScoreboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session') ?? ''

  const [session, setSession] = useState<QuizSession | null>(null)
  const [participants, setParticipants] = useState<QuizParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (id?: string) => {
    const sid = id || sessionId
    if (!sid) {
      setLoading(false)
      return
    }
    const [{ data: sess }, { data: parts }] = await Promise.all([
      getSessionById(sid),
      getParticipants(sid),
    ])
    setSession(sess)
    setParticipants(parts ?? [])
    setLastUpdated(new Date())
    setLoading(false)
  }, [sessionId])

  // Subscribe to realtime updates
  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    load()

    const sb = getSupabase()
    const channel = sb
      .channel(`scoreboard-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_participants', filter: `session_id=eq.${sessionId}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_sessions', filter: `id=eq.${sessionId}` },
        () => load()
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const sorted = [...participants].sort((a, b) => b.score - a.score)

  if (loading) {
    return (
      <div className="min-h-screen bg-primary-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-gold-400" />
      </div>
    )
  }

  const statusColor = session?.status === 'active'
    ? 'bg-green-400 text-green-900'
    : session?.status === 'completed'
    ? 'bg-gray-400 text-gray-900'
    : 'bg-yellow-300 text-yellow-900'

  const statusLabel = session?.status === 'active' ? '● LIVE' : session?.status === 'completed' ? 'Completed' : '⏳ Waiting'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/quiz')}
            className="flex items-center gap-1.5 text-primary-200 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 text-primary-200 hover:text-white text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Title card */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-400 px-4 py-1.5 rounded-full text-sm font-semibold border border-gold-500/30">
            <Trophy className="w-4 h-4" /> Scoreboard
          </div>
          <h1 className="text-3xl font-extrabold text-white">
            {session?.name ?? 'Scholars Challenge'}
          </h1>
          <div className="flex items-center justify-center gap-3">
            {session && (
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                {statusLabel}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-primary-300 text-sm">
              <Users className="w-4 h-4" /> {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </span>
          </div>
          {lastUpdated && (
            <p className="text-primary-400 text-xs">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Podium (top 3) */}
        {sorted.length >= 2 && (
          <div className="flex items-end justify-center gap-3 pb-2">
            {/* 2nd */}
            {sorted[1] && (
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-800 font-extrabold text-lg">
                  {sorted[1].name.charAt(0).toUpperCase()}
                </div>
                <p className="text-white text-xs font-semibold max-w-[70px] text-center truncate">{sorted[1].name}</p>
                <p className="text-gray-300 font-bold text-sm">{sorted[1].score}pts</p>
                <div className="w-16 h-14 bg-gray-400/40 border border-gray-400/50 rounded-t-lg flex items-center justify-center text-white text-lg font-bold">
                  2
                </div>
              </div>
            )}
            {/* 1st */}
            {sorted[0] && (
              <div className="flex flex-col items-center gap-1 -mt-4">
                <Crown className="w-5 h-5 text-gold-400" />
                <div className="w-14 h-14 rounded-full bg-yellow-400 flex items-center justify-center text-yellow-900 font-extrabold text-xl ring-4 ring-gold-400/50">
                  {sorted[0].name.charAt(0).toUpperCase()}
                </div>
                <p className="text-white text-sm font-semibold max-w-[80px] text-center truncate">{sorted[0].name}</p>
                <p className="text-gold-400 font-bold">{sorted[0].score}pts</p>
                <div className="w-16 h-20 bg-gold-500/40 border border-gold-500/50 rounded-t-lg flex items-center justify-center text-white text-lg font-bold">
                  1
                </div>
              </div>
            )}
            {/* 3rd */}
            {sorted[2] && (
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center text-orange-900 font-extrabold text-lg">
                  {sorted[2].name.charAt(0).toUpperCase()}
                </div>
                <p className="text-white text-xs font-semibold max-w-[70px] text-center truncate">{sorted[2].name}</p>
                <p className="text-orange-300 font-bold text-sm">{sorted[2].score}pts</p>
                <div className="w-16 h-10 bg-orange-400/40 border border-orange-400/50 rounded-t-lg flex items-center justify-center text-white text-lg font-bold">
                  3
                </div>
              </div>
            )}
          </div>
        )}

        {/* Full leaderboard */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-primary-200">
              <Users className="w-10 h-10 opacity-40" />
              <p className="font-medium">No participants yet</p>
              <p className="text-xs text-primary-300">Waiting for students to join…</p>
            </div>
          ) : (
            sorted.map((p, idx) => {
              const rankStyle = RANK_STYLES[idx]
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 ${idx === 0 ? 'bg-gold-500/10' : ''}`}
                >
                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${rankStyle ? `${rankStyle.bg} ${rankStyle.text}` : 'bg-white/10 text-white'}`}>
                    {idx + 1}
                  </div>

                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                    idx === 1 ? 'bg-gray-300 text-gray-800' :
                    idx === 2 ? 'bg-orange-400 text-orange-900' :
                    'bg-primary-600 text-white'
                  }`}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + stats */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${idx === 0 ? 'text-gold-300' : 'text-white'}`}>
                      {p.name}
                      {p.is_finished && <span className="ml-2 text-xs text-green-400 font-normal">✓ Finished</span>}
                    </p>
                    <p className="text-primary-300 text-xs mt-0.5">
                      {p.questions_correct} correct · {p.questions_answered} answered
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-extrabold ${idx === 0 ? 'text-gold-400' : 'text-white'}`}>
                      {p.score}
                    </p>
                    <p className="text-primary-400 text-xs">points</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Back to quiz */}
        <button
          onClick={() => router.push('/quiz')}
          className="w-full py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors text-sm border border-white/10"
        >
          ← Back to Quiz Lobby
        </button>

      </div>
    </div>
  )
}

export default function ScoreboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-gold-400" />
      </div>
    }>
      <ScoreboardContent />
    </Suspense>
  )
}
