'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Zap, Clock, Users, ChevronRight, Loader2, BookOpen, Play } from 'lucide-react'
import { getActiveSession, joinSession, type QuizSession } from '@/lib/quiz'

export default function QuizLandingPage() {
  const router = useRouter()
  const [session, setSession] = useState<QuizSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await getActiveSession()
      setSession(data)
      setLoading(false)
    }
    load()
  }, [])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !session) return
    setJoining(true)
    setError('')
    const { data, error: joinError } = await joinSession(session.id, name.trim())
    if (joinError || !data) {
      setError('Could not join. Please try again.')
      setJoining(false)
      return
    }
    router.push(`/quiz/play?session=${session.id}&participant=${data.id}`)
  }

  const timeLabel = session
    ? session.round_type === 'rapid_fire'
      ? `${session.time_per_question}s total duration (Rapid Fire!)`
      : `${session.time_per_question}s total quiz duration`
    : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 flex flex-col items-center justify-center px-4 py-16">

      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-gold-500/20 text-gold-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-5 border border-gold-500/30">
          <Trophy className="w-4 h-4" />
          Scholars Challenge
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
          Test Your <span className="text-gold-400">Knowledge</span>
        </h1>
        <p className="mt-3 text-primary-200 text-lg max-w-md mx-auto">
          Compete in live quiz rounds, climb the leaderboard, and prove you're the top scholar.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary-800" />
            <p className="text-gray-500 text-sm">Looking for active sessions…</p>
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">No Active Quiz</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              There's no quiz session running right now. Check back soon or ask your admin to start one.
            </p>
            <button
              onClick={() => router.push('/quiz/scoreboard')}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 border-2 border-primary-800 text-primary-800 font-semibold rounded-full hover:bg-primary-50 transition-colors text-sm"
            >
              <Trophy className="w-4 h-4" /> View Scoreboard
            </button>
          </div>
        ) : (
          <div>
            {/* Session Banner */}
            <div className={`px-6 py-4 ${session.round_type === 'rapid_fire' ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-primary-800 to-primary-600'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-xs font-medium uppercase tracking-wide">
                    {session.round_type === 'rapid_fire' ? '⚡ Rapid Fire Round' : '📚 Standard Round'}
                  </p>
                  <h2 className="text-white text-xl font-bold mt-0.5">{session.name}</h2>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  session.status === 'active'
                    ? 'bg-green-400 text-green-900'
                    : 'bg-yellow-300 text-yellow-900'
                }`}>
                  {session.status === 'active' ? '● LIVE' : '⏳ Waiting'}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-white/80 text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  {timeLabel}
                </div>
                <div className="flex items-center gap-1.5 text-white/80 text-xs">
                  <BookOpen className="w-3.5 h-3.5" />
                  {session.question_ids?.length || session.questions_per_round} questions
                </div>
              </div>
            </div>

            {/* Join Form */}
            <form onSubmit={handleJoin} className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your full name"
                  maxLength={60}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-800 transition-colors"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={joining || !name.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-800 text-white font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {joining ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Joining…</>
                ) : (
                  <><Play className="w-4 h-4 fill-white" /> Join Quiz</>
                )}
              </button>

              <button
                type="button"
                onClick={() => router.push(`/quiz/scoreboard?session=${session.id}`)}
                className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                <Users className="w-4 h-4" /> Watch Scoreboard
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Feature Pills */}
      <div className="flex flex-wrap justify-center gap-3 mt-8">
        {[
          { icon: Trophy, label: '10 pts per correct answer' },
          { icon: Zap, label: 'Live scoreboard' },
          { icon: ChevronRight, label: 'Wrong answers recycle' },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 bg-white/10 text-white/80 px-4 py-2 rounded-full text-xs font-medium backdrop-blur-sm border border-white/20">
            <Icon className="w-3.5 h-3.5" />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
