'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Shield, Plus, Trash2, Edit3, Check, X, Loader2, BookOpen,
  Play, Square, Trophy, Zap, Clock, Users, RefreshCw, ChevronDown,
  CheckCircle2, ToggleLeft, ToggleRight, Eye
} from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import {
  getAllQuestions, addQuestion, updateQuestion, deleteQuestion,
  getAllSessions, createSession, updateSessionStatus, deleteSession,
  getParticipants, getRandomActiveQuestions, updateSessionQuestions,
  type QuizQuestion, type QuizSession, type QuizParticipant
} from '@/lib/quiz'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CATEGORIES = ['General', 'Mathematics', 'English', 'Science', 'History', 'Geography', 'Technology', 'Current Affairs']
const OPTION_LABELS = ['A', 'B', 'C', 'D']

type Tab = 'questions' | 'sessions'

// ── blank form states ────────────────────────────────────────
const blankQ = () => ({ question: '', options: ['', '', '', ''], correct_answer: 0, category: 'General' })
type SForm = { name: string; round_type: 'standard' | 'rapid_fire'; time_per_question: number; questions_per_round: number }
const blankS = (): SForm => ({ name: '', round_type: 'standard', time_per_question: 300, questions_per_round: 10 })

export default function AdminQuizPage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('questions')

  // Questions state
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [qLoading, setQLoading] = useState(true)
  const [showAddQ, setShowAddQ] = useState(false)
  const [editingQ, setEditingQ] = useState<QuizQuestion | null>(null)
  const [qForm, setQForm] = useState(blankQ())
  const [qSaving, setQSaving] = useState(false)
  const [qError, setQError] = useState('')

  // Sessions state
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [sLoading, setSLoading] = useState(true)
  const [showAddS, setShowAddS] = useState(false)
  const [sForm, setSForm] = useState(blankS())
  const [sSaving, setSSaving] = useState(false)
  const [sError, setSError] = useState('')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [sessionParticipants, setSessionParticipants] = useState<Record<string, QuizParticipant[]>>({})

  const [toast, setToast] = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // ── auth check ───────────────────────────────────────────────
  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/login'); return }
      const { data } = await sb.from('profiles').select('role').eq('id', session.user.id).single()
      const role = data?.role ?? session.user.user_metadata?.role
      if (role === 'admin' || role === 'moderator') {
        setAuthorized(true)
      } else {
        router.push('/dashboard')
      }
      setAuthLoading(false)
    })
  }, [router])

  // ── load questions ────────────────────────────────────────────
  const loadQuestions = useCallback(async () => {
    setQLoading(true)
    const { data } = await getAllQuestions()
    setQuestions(data ?? [])
    setQLoading(false)
  }, [])

  // ── load sessions ─────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSLoading(true)
    const { data } = await getAllSessions()
    setSessions(data ?? [])
    setSLoading(false)
  }, [])

  useEffect(() => { if (authorized) { loadQuestions(); loadSessions() } }, [authorized, loadQuestions, loadSessions])

  // ── save question ─────────────────────────────────────────────
  async function handleSaveQuestion() {
    if (!qForm.question.trim()) { setQError('Question text required'); return }
    if (qForm.options.some(o => !o.trim())) { setQError('All 4 options required'); return }
    setQSaving(true); setQError('')
    if (editingQ) {
      const { error } = await updateQuestion(editingQ.id, { ...qForm, options: qForm.options })
      if (error) { setQError(error.message); setQSaving(false); return }
      showToast('Question updated ✅')
    } else {
      const { error } = await addQuestion(qForm)
      if (error) { setQError(error.message); setQSaving(false); return }
      showToast('Question added ✅')
    }
    setQSaving(false); setShowAddQ(false); setEditingQ(null); setQForm(blankQ())
    loadQuestions()
  }

  function startEditQuestion(q: QuizQuestion) {
    setEditingQ(q)
    setQForm({ question: q.question, options: [...q.options], correct_answer: q.correct_answer, category: q.category })
    setShowAddQ(true)
    setQError('')
  }

  async function handleDeleteQuestion(id: string) {
    if (!confirm('Delete this question?')) return
    await deleteQuestion(id)
    showToast('Deleted'); loadQuestions()
  }

  async function handleToggleActive(q: QuizQuestion) {
    await updateQuestion(q.id, { is_active: !q.is_active })
    loadQuestions()
  }

  // ── save session ──────────────────────────────────────────────
  async function handleSaveSession() {
    if (!sForm.name.trim()) { setSError('Session name required'); return }
    if (questions.filter(q => q.is_active).length === 0) { setSError('No active questions available. Add questions first.'); return }
    setSSaving(true); setSError('')

    // Auto-select random questions for the session
    const { data: pickedQuestions } = await getRandomActiveQuestions(sForm.questions_per_round)
    const qIds = pickedQuestions?.map(q => q.id) ?? []

    const { error } = await createSession({ ...sForm, question_ids: qIds })
    if (error) { setSError(error.message); setSSaving(false); return }
    showToast('Session created ✅')
    setSSaving(false); setShowAddS(false); setSForm(blankS())
    loadSessions()
  }

  async function handleSessionStatus(id: string, status: 'waiting' | 'active' | 'completed') {
    await updateSessionStatus(id, status)
    showToast(`Session ${status} ✅`)
    loadSessions()
  }

  async function handleDeleteSession(id: string) {
    if (!confirm('Delete this session and all its data?')) return
    await deleteSession(id)
    showToast('Session deleted'); loadSessions()
  }

  async function handleRegenerateQuestions(session: QuizSession) {
    const { data: pickedQuestions } = await getRandomActiveQuestions(session.questions_per_round)
    const qIds = pickedQuestions?.map(q => q.id) ?? []
    await updateSessionQuestions(session.id, qIds)
    showToast('Questions refreshed ✅'); loadSessions()
  }

  async function handleExpandSession(sessionId: string) {
    if (expandedSession === sessionId) { setExpandedSession(null); return }
    setExpandedSession(sessionId)
    const { data } = await getParticipants(sessionId)
    setSessionParticipants(prev => ({ ...prev, [sessionId]: data ?? [] }))
  }

  // ── guards ────────────────────────────────────────────────────
  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary-800" />
    </div>
  )
  if (!authorized) return null

  const activeQuestions = questions.filter(q => q.is_active)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-primary-800 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-16 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-800 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Quiz Manager</h1>
                <p className="text-xs text-gray-400">Scholars Challenge Admin</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/quiz/scoreboard')}
              className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-800 font-semibold rounded-full hover:bg-primary-100 transition-colors text-sm"
            >
              <Eye className="w-4 h-4" /> Live Scoreboard
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {(['questions', 'sessions'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors capitalize ${
                  activeTab === tab
                    ? 'bg-primary-800 text-white'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {tab === 'questions' ? `Questions (${questions.length})` : `Sessions (${sessions.length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── QUESTIONS TAB ── */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{activeQuestions.length} active · {questions.length - activeQuestions.length} inactive</p>
              <div className="flex gap-2">
                <button onClick={loadQuestions} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => { setShowAddQ(true); setEditingQ(null); setQForm(blankQ()); setQError('') }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-800 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Question
                </button>
              </div>
            </div>

            {/* Add/Edit form */}
            {showAddQ && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-gray-900">{editingQ ? 'Edit Question' : 'New Question'}</h3>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Question</label>
                  <textarea
                    value={qForm.question}
                    onChange={e => setQForm(f => ({ ...f, question: e.target.value }))}
                    rows={3}
                    placeholder="Type your question here…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-600 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {qForm.options.map((opt, idx) => (
                    <div key={idx} className="relative">
                      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                        Option {OPTION_LABELS[idx]}
                        {qForm.correct_answer === idx && <span className="ml-1 text-green-600">✓ Correct</span>}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={e => setQForm(f => {
                            const opts = [...f.options]; opts[idx] = e.target.value; return { ...f, options: opts }
                          })}
                          placeholder={`Option ${OPTION_LABELS[idx]}`}
                          className={`flex-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-none transition-colors ${
                            qForm.correct_answer === idx ? 'border-green-400 bg-green-50 focus:border-green-500' : 'border-gray-200 focus:border-primary-600'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setQForm(f => ({ ...f, correct_answer: idx }))}
                          title="Mark as correct"
                          className={`px-2 rounded-lg border text-xs font-bold transition-colors ${
                            qForm.correct_answer === idx
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-500'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Category</label>
                  <select
                    value={qForm.category}
                    onChange={e => setQForm(f => ({ ...f, category: e.target.value }))}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-600 bg-white"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {qError && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{qError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveQuestion}
                    disabled={qSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary-800 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {qSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editingQ ? 'Update' : 'Save Question'}
                  </button>
                  <button
                    onClick={() => { setShowAddQ(false); setEditingQ(null); setQForm(blankQ()) }}
                    className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Questions list */}
            {qLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-800" /></div>
            ) : questions.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No questions yet</p>
                <p className="text-sm mt-1">Add your first question to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div key={q.id} className={`bg-white border rounded-xl p-4 ${!q.is_active ? 'opacity-60' : 'border-gray-200'}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold text-gray-400 pt-0.5 min-w-[24px]">#{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 leading-relaxed">{q.question}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {q.options.map((opt, oi) => (
                            <span key={oi} className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                              oi === q.correct_answer ? 'bg-green-100 text-green-700 ring-1 ring-green-300' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {OPTION_LABELS[oi]}: {opt}
                            </span>
                          ))}
                        </div>
                        <span className="inline-block mt-2 text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{q.category}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleToggleActive(q)} title="Toggle active" className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          {q.is_active
                            ? <ToggleRight className="w-5 h-5 text-green-500" />
                            : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                        </button>
                        <button onClick={() => startEditQuestion(q)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          <Edit3 className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => handleDeleteQuestion(q.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SESSIONS TAB ── */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {sessions.filter(s => s.status === 'active').length} live · {sessions.filter(s => s.status === 'waiting').length} waiting
              </p>
              <div className="flex gap-2">
                <button onClick={loadSessions} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => { setShowAddS(true); setSForm(blankS()); setSError('') }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-800 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> New Session
                </button>
              </div>
            </div>

            {/* Note about questions */}
            {activeQuestions.length < 10 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
                ⚠ Only {activeQuestions.length} active question{activeQuestions.length !== 1 ? 's' : ''} available.
                Add more questions for the best experience (recommended: 10+).
              </div>
            )}

            {/* Create session form */}
            {showAddS && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="font-bold text-gray-900">New Quiz Session</h3>
                <p className="text-sm text-gray-500">
                  {activeQuestions.length} active questions available.
                  Questions will be randomly selected from the pool.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Session Name</label>
                  <input
                    type="text"
                    value={sForm.name}
                    onChange={e => setSForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Scholars Challenge Round 1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Round Type</label>
                    <select
                      value={sForm.round_type}
                      onChange={e => {
                        const rt = e.target.value as 'standard' | 'rapid_fire'
                        setSForm(f => ({ ...f, round_type: rt, time_per_question: rt === 'rapid_fire' ? 120 : 300 }))
                      }}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-600 bg-white"
                    >
                      <option value="standard">📚 Standard</option>
                      <option value="rapid_fire">⚡ Rapid Fire</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Total Quiz Duration (seconds)</label>
                    <input
                      type="number"
                      value={sForm.time_per_question}
                      onChange={e => setSForm(f => ({ ...f, time_per_question: Number(e.target.value) }))}
                      min={30} max={3600}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Questions per Round</label>
                  <input
                    type="number"
                    value={sForm.questions_per_round}
                    onChange={e => setSForm(f => ({ ...f, questions_per_round: Math.min(Number(e.target.value), activeQuestions.length) }))}
                    min={1} max={activeQuestions.length || 10}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-600"
                  />
                </div>

                {sError && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{sError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveSession}
                    disabled={sSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary-800 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {sSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Create Session
                  </button>
                  <button
                    onClick={() => setShowAddS(false)}
                    className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Sessions list */}
            {sLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-800" /></div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No sessions yet</p>
                <p className="text-sm mt-1">Create a session to start the quiz</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(s => {
                  const isActive = s.status === 'active'
                  const isWaiting = s.status === 'waiting'
                  const isDone = s.status === 'completed'
                  const isExpanded = expandedSession === s.id
                  const parts = sessionParticipants[s.id] ?? []

                  return (
                    <div key={s.id} className={`bg-white border rounded-2xl overflow-hidden ${isActive ? 'border-green-300 shadow-green-100 shadow-md' : 'border-gray-200'}`}>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-gray-900">{s.name}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                isActive ? 'bg-green-100 text-green-700' :
                                isWaiting ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-500'
                              }`}>
                                {isActive ? '● LIVE' : isWaiting ? 'Waiting' : 'Completed'}
                              </span>
                              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                s.round_type === 'rapid_fire' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {s.round_type === 'rapid_fire' ? <><Zap className="w-3 h-3" /> Rapid Fire</> : <><BookOpen className="w-3 h-3" /> Standard</>}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.time_per_question}s total</span>
                              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{s.question_ids?.length || s.questions_per_round} questions</span>
                              <span className="text-gray-300">{new Date(s.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isWaiting && (
                              <button
                                onClick={() => handleSessionStatus(s.id, 'active')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-500 transition-colors"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" /> Start
                              </button>
                            )}
                            {isActive && (
                              <button
                                onClick={() => handleSessionStatus(s.id, 'completed')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-500 transition-colors"
                              >
                                <Square className="w-3.5 h-3.5 fill-white" /> End
                              </button>
                            )}
                            {!isDone && (
                              <button
                                onClick={() => handleRegenerateQuestions(s)}
                                title="Re-pick random questions"
                                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                              >
                                <RefreshCw className="w-4 h-4 text-gray-400" />
                              </button>
                            )}
                            <button
                              onClick={() => handleExpandSession(s.id)}
                              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                              <Users className="w-4 h-4 text-gray-400" />
                            </button>
                            <button
                              onClick={() => router.push(`/quiz/scoreboard?session=${s.id}`)}
                              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                              <Eye className="w-4 h-4 text-gray-400" />
                            </button>
                            <button onClick={() => handleDeleteSession(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                            <button onClick={() => handleExpandSession(s.id)} className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded participants */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                            Participants ({parts.length})
                          </h4>
                          {parts.length === 0 ? (
                            <p className="text-sm text-gray-400">No participants yet</p>
                          ) : (
                            <div className="space-y-2">
                              {parts
                                .sort((a, b) => b.score - a.score)
                                .map((p, idx) => (
                                  <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-gray-100">
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs font-bold text-gray-400 w-6">#{idx + 1}</span>
                                      <div className="w-7 h-7 rounded-full bg-primary-800 text-white text-xs font-bold flex items-center justify-center">
                                        {p.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span className="text-sm font-medium text-gray-800">
                                        {p.name}
                                        {p.is_finished && <span className="ml-1.5 text-xs text-green-500">✓</span>}
                                      </span>
                                    </div>
                                    <div className="text-right text-xs text-gray-500">
                                      <span className="font-bold text-primary-800">{p.score}pts</span>
                                      <span className="ml-2">{p.questions_correct}/{p.questions_answered}</span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
