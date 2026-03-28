'use client'

import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Trophy, Clock, CheckCircle2, XCircle, SkipForward, Loader2, Zap, RotateCcw } from 'lucide-react'
import {
  getSessionById, getQuestionsByIds, getCorrectlyAnsweredIds,
  recordAttempt, updateParticipant,
  type QuizSession, type QuizQuestion
} from '@/lib/quiz'

const OPTION_LABELS = ['A', 'B', 'C', 'D']
const FEEDBACK_DURATION = 1800 // ms to show feedback before advancing

type GameState = 'loading' | 'waiting' | 'playing' | 'feedback' | 'finished'
type FeedbackType = 'correct' | 'wrong' | 'passed' | 'timeout'

// ── shuffle helper ──────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

// ── format seconds as mm:ss ─────────────────────────────────
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function QuizPlayContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session') ?? ''
  const participantId = searchParams.get('participant') ?? ''

  const [session, setSession] = useState<QuizSession | null>(null)
  const [queue, setQueue] = useState<QuizQuestion[]>([])
  const [answeredCorrectly, setAnsweredCorrectly] = useState<Set<string>>(new Set())
  const [score, setScore] = useState(0)
  const [questionsAnswered, setQuestionsAnswered] = useState(0)
  const [totalTimeLeft, setTotalTimeLeft] = useState(300)
  const [gameState, setGameState] = useState<GameState>('loading')
  const [feedback, setFeedback] = useState<FeedbackType | null>(null)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerStartedRef = useRef(false)
  const handlePassRef = useRef<() => void>(() => {})
  const handleTimeoutRef = useRef<() => void>(() => {})

  const currentQuestion = queue[0] ?? null

  // ── stop session timer ──────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  // ── keep timeout handler up-to-date (avoids stale closure) ─
  useEffect(() => {
    handleTimeoutRef.current = () => {
      setGameState('finished')
      updateParticipant(participantId, {
        is_finished: true,
        score,
        questions_answered: questionsAnswered,
        questions_correct: answeredCorrectly.size,
      })
    }
  }, [participantId, score, questionsAnswered, answeredCorrectly])

  // ── session-level timer — starts once when first question loads
  useEffect(() => {
    if (gameState !== 'playing' || timerStartedRef.current || !session) return
    timerStartedRef.current = true
    setTotalTimeLeft(session.time_per_question) // field now holds total quiz seconds

    timerRef.current = setInterval(() => {
      setTotalTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          handleTimeoutRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => stopTimer()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, session])

  // ── advance to next question ────────────────────────────────
  const advance = useCallback((
    newQueue: QuizQuestion[],
    newAnswered: Set<string>,
    newScore: number,
    newAnsweredCount: number
  ) => {
    setFeedback(null)
    setSelectedOption(null)

    if (newQueue.length === 0) {
      stopTimer()
      setGameState('finished')
      updateParticipant(participantId, {
        is_finished: true,
        score: newScore,
        questions_answered: newAnsweredCount,
        questions_correct: newAnswered.size,
      })
      return
    }

    setQueue(newQueue)
    setScore(newScore)
    setAnsweredCorrectly(newAnswered)
    setQuestionsAnswered(newAnsweredCount)
    setGameState('playing')
  }, [participantId, stopTimer])

  // ── show feedback then advance ──────────────────────────────
  const showFeedbackThenAdvance = useCallback((
    type: FeedbackType,
    newQueue: QuizQuestion[],
    newAnswered: Set<string>,
    newScore: number,
    newAnsweredCount: number
  ) => {
    setFeedback(type)
    setGameState('feedback')
    if (feedbackRef.current) clearTimeout(feedbackRef.current)
    feedbackRef.current = setTimeout(() => {
      advance(newQueue, newAnswered, newScore, newAnsweredCount)
    }, FEEDBACK_DURATION)
  }, [advance])

  // ── handle answer ───────────────────────────────────────────
  const handleAnswer = useCallback(async (optionIndex: number) => {
    if (gameState !== 'playing' || !currentQuestion || !session) return
    setSelectedOption(optionIndex)

    const isCorrect = optionIndex === currentQuestion.correct_answer
    await recordAttempt({
      session_id: sessionId,
      participant_id: participantId,
      question_id: currentQuestion.id,
      selected_option: optionIndex,
      is_correct: isCorrect,
      is_passed: false,
    })

    const newAnsweredCount = questionsAnswered + 1
    let newScore = score
    const newAnswered = new Set(answeredCorrectly)
    let newQueue: QuizQuestion[]

    if (isCorrect) {
      newScore += 10
      newAnswered.add(currentQuestion.id)
      newQueue = queue.slice(1)
      await updateParticipant(participantId, {
        score: newScore,
        questions_answered: newAnsweredCount,
        questions_correct: newAnswered.size,
      })
      showFeedbackThenAdvance('correct', newQueue, newAnswered, newScore, newAnsweredCount)
    } else {
      newQueue = [...queue.slice(1), currentQuestion]
      await updateParticipant(participantId, {
        questions_answered: newAnsweredCount,
      })
      showFeedbackThenAdvance('wrong', newQueue, newAnswered, newScore, newAnsweredCount)
    }
  }, [gameState, currentQuestion, session, sessionId, participantId, score, answeredCorrectly, queue, questionsAnswered, showFeedbackThenAdvance])

  // ── handle pass ─────────────────────────────────────────────
  const handlePass = useCallback(async () => {
    if ((gameState !== 'playing' && gameState !== 'feedback') || !currentQuestion) return
    await recordAttempt({
      session_id: sessionId,
      participant_id: participantId,
      question_id: currentQuestion.id,
      selected_option: null,
      is_correct: false,
      is_passed: true,
    })
    const newQueue = [...queue.slice(1), currentQuestion]
    showFeedbackThenAdvance('passed', newQueue, answeredCorrectly, score, questionsAnswered)
  }, [gameState, currentQuestion, sessionId, participantId, queue, answeredCorrectly, score, questionsAnswered, showFeedbackThenAdvance])

  // Keep ref always pointing to latest handlePass
  useEffect(() => { handlePassRef.current = handlePass }, [handlePass])

  // ── initial load ────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !participantId) { router.push('/quiz'); return }

    async function load() {
      const { data: sess } = await getSessionById(sessionId)
      if (!sess) { router.push('/quiz'); return }
      setSession(sess)
      setTotalTimeLeft(sess.time_per_question)

      if (sess.status === 'waiting') { setGameState('waiting'); return }
      if (sess.status === 'completed') { setGameState('finished'); return }

      const qIds: string[] = Array.isArray(sess.question_ids) ? sess.question_ids : []
      const { data: questions } = await getQuestionsByIds(qIds)
      if (!questions?.length) { setGameState('waiting'); return }

      const alreadyCorrect = await getCorrectlyAnsweredIds(participantId)
      const correctSet = new Set(alreadyCorrect)
      const remaining = questions.filter(q => !correctSet.has(q.id))

      setAnsweredCorrectly(correctSet)
      if (remaining.length === 0) { setGameState('finished'); return }

      setQueue(shuffle(remaining))
      setGameState('playing')
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── cleanup ─────────────────────────────────────────────────
  useEffect(() => () => {
    stopTimer()
    if (feedbackRef.current) clearTimeout(feedbackRef.current)
  }, [stopTimer])

  const totalDuration = session?.time_per_question ?? 300
  const totalQuestions = session?.question_ids?.length || session?.questions_per_round || 10
  const progressPct = totalQuestions > 0 ? (answeredCorrectly.size / totalQuestions) * 100 : 0
  const timerPct = totalDuration > 0 ? (totalTimeLeft / totalDuration) * 100 : 100
  const isRapidFire = session?.round_type === 'rapid_fire'
  const timerColor =
    totalTimeLeft <= 30 ? 'bg-red-500' :
    totalTimeLeft <= 60 ? 'bg-orange-400' :
    isRapidFire ? 'bg-orange-500' :
    'bg-primary-600'

  // ── LOADING ─────────────────────────────────────────────────
  if (gameState === 'loading') {
    return (
      <div className="min-h-screen bg-primary-900 flex items-center justify-center">
        <div className="text-center text-white space-y-3">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-gold-400" />
          <p className="text-primary-200">Loading quiz…</p>
        </div>
      </div>
    )
  }

  // ── WAITING ─────────────────────────────────────────────────
  if (gameState === 'waiting') {
    return (
      <div className="min-h-screen bg-primary-900 flex items-center justify-center px-4">
        <div className="text-center text-white space-y-4 max-w-sm">
          <div className="w-20 h-20 rounded-full bg-gold-500/20 border-2 border-gold-400 flex items-center justify-center mx-auto">
            <Clock className="w-10 h-10 text-gold-400" />
          </div>
          <h2 className="text-2xl font-bold">You&apos;re in the lobby!</h2>
          <p className="text-primary-200">The quiz hasn&apos;t started yet. Hang tight — the admin will kick things off soon.</p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-primary-700 rounded-full text-sm hover:bg-primary-600 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>
    )
  }

  // ── FINISHED ────────────────────────────────────────────────
  if (gameState === 'finished') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-700 flex items-center justify-center px-4">
        <div className="text-center text-white space-y-5 max-w-sm">
          <div className="w-24 h-24 rounded-full bg-gold-500/20 border-4 border-gold-400 flex items-center justify-center mx-auto">
            <Trophy className="w-12 h-12 text-gold-400" />
          </div>
          <h2 className="text-3xl font-extrabold">
            {totalTimeLeft === 0 ? "Time's Up!" : 'Quiz Complete!'}
          </h2>
          <div className="bg-white/10 rounded-2xl px-8 py-6 space-y-2 backdrop-blur-sm">
            <p className="text-primary-200 text-sm">Your Final Score</p>
            <p className="text-5xl font-extrabold text-gold-400">{score}</p>
            <p className="text-primary-200 text-sm">points</p>
          </div>
          <div className="flex gap-3 justify-center text-sm text-primary-200">
            <span>✅ {answeredCorrectly.size} correct</span>
            <span>·</span>
            <span>📝 {questionsAnswered} attempted</span>
          </div>
          <button
            onClick={() => router.push(`/quiz/scoreboard?session=${sessionId}`)}
            className="w-full py-3 bg-gold-500 text-primary-900 font-bold rounded-xl hover:bg-gold-400 transition-colors"
          >
            View Scoreboard
          </button>
          <button
            onClick={() => router.push('/quiz')}
            className="w-full py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  // ── PLAYING / FEEDBACK ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-primary-900 flex flex-col">

      {/* Top bar */}
      <div className="px-4 pt-6 pb-3 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isRapidFire && <Zap className="w-4 h-4 text-orange-400" />}
            <span className="text-primary-200 text-sm font-medium">
              {isRapidFire ? 'Rapid Fire Round' : 'Scholars Challenge'}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-gold-500/20 px-3 py-1.5 rounded-full border border-gold-500/30">
            <Trophy className="w-4 h-4 text-gold-400" />
            <span className="text-gold-300 font-bold text-sm">{score} pts</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 bg-primary-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-gold-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-primary-300 text-xs whitespace-nowrap">
            {answeredCorrectly.size}/{totalQuestions}
          </span>
        </div>

        {/* Session countdown timer */}
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-1 bg-primary-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-1000 ${timerColor}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <span className={`text-sm font-bold tabular-nums min-w-[52px] text-right ${totalTimeLeft <= 30 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            {formatTime(totalTimeLeft)}
          </span>
        </div>
        <p className="text-primary-400 text-xs text-right mb-1">time remaining</p>
      </div>

      {/* Question card */}
      <div className="flex-1 flex flex-col justify-center px-4 pb-6 max-w-2xl mx-auto w-full">
        {currentQuestion && (
          <div className="space-y-4">
            {/* Category badge */}
            <span className="inline-block bg-primary-700 text-primary-200 px-3 py-1 rounded-full text-xs font-medium">
              {currentQuestion.category}
            </span>

            {/* Question */}
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <p className="text-white text-lg md:text-xl font-semibold leading-relaxed">
                {currentQuestion.question}
              </p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 gap-3">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedOption === idx
                const isCorrect = idx === currentQuestion.correct_answer
                let btnClass = 'border-2 border-white/20 bg-white/5 text-white hover:border-primary-400 hover:bg-white/10'

                if (feedback && isSelected && !isCorrect) {
                  btnClass = 'border-2 border-red-400 bg-red-500/20 text-red-200'
                } else if (feedback && isCorrect) {
                  btnClass = 'border-2 border-green-400 bg-green-500/20 text-green-200'
                } else if (isSelected) {
                  btnClass = 'border-2 border-primary-400 bg-primary-700/50 text-white'
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={gameState === 'feedback'}
                    className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl text-left font-medium transition-all text-sm ${btnClass} disabled:cursor-default`}
                  >
                    <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {OPTION_LABELS[idx]}
                    </span>
                    <span>{option}</span>
                    {feedback && isCorrect && <CheckCircle2 className="w-5 h-5 text-green-400 ml-auto flex-shrink-0" />}
                    {feedback && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-400 ml-auto flex-shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Feedback banner */}
            {feedback && (
              <div className={`rounded-xl px-5 py-3 text-center text-sm font-bold ${
                feedback === 'correct' ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                feedback === 'wrong' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
              }`}>
                {feedback === 'correct' && '✅ Correct! +10 points'}
                {feedback === 'wrong' && '❌ Wrong — question will reappear'}
                {feedback === 'passed' && '⏭ Passed — question will reappear'}
                {feedback === 'timeout' && '⏰ Time up! — question will reappear'}
              </div>
            )}

            {/* Pass button */}
            {gameState === 'playing' && (
              <button
                onClick={handlePass}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 text-white/70 font-medium rounded-xl hover:bg-white/15 transition-colors text-sm border border-white/10"
              >
                <SkipForward className="w-4 h-4" /> Pass this question
              </button>
            )}

            {/* Remaining in queue */}
            {queue.length > 1 && (
              <p className="text-center text-primary-400 text-xs">
                {queue.length - 1} question{queue.length - 1 !== 1 ? 's' : ''} remaining in queue
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function QuizPlayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-gold-400" />
      </div>
    }>
      <QuizPlayContent />
    </Suspense>
  )
}
