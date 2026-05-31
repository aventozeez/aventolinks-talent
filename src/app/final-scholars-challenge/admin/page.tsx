'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trophy, Users, HelpCircle, Rocket, Radio,
  Plus, Minus, Trash2, Check, X, SkipForward,
  Bell, Zap, Lightbulb, Loader2, ChevronDown,
} from 'lucide-react'
import {
  getLiveState, saveLiveState,
  QuizLiveState, LiveQuestion, LivePhase, GameMode,
  POINTS, BROADCAST_ROOM,
} from '@/lib/quiz-live'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'teams' | 'questions' | 'launch' | 'live'

type FSCTeam = {
  id: string
  name: string
  school: string
  status: 'active' | 'eliminated' | 'winner'
  created_at: string
}

type FSCQuestion = {
  id: string
  question: string
  answer: string
  category: string
  created_at: string
}

const MODES: { key: GameMode; label: string; Icon: typeof Zap }[] = [
  { key: 'rapid_fire',        label: 'Rapid Fire',        Icon: Zap       },
  { key: 'buzzer',            label: 'Buzzer',            Icon: Bell      },
  { key: 'innovation_sprint', label: 'Innovation Sprint', Icon: Lightbulb },
]

// ── Component ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab]     = useState<Tab>('teams')

  // ── Teams ──────────────────────────────────────────────────────────────────
  const [teams,       setTeams]       = useState<FSCTeam[]>([])
  const [teamsLoading,setTeamsLoading]= useState(false)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamSchool,setNewTeamSchool]=useState('')
  const [teamSaving,  setTeamSaving]  = useState(false)

  // ── Questions ──────────────────────────────────────────────────────────────
  const [questions,   setQuestions]   = useState<FSCQuestion[]>([])
  const [qsLoading,   setQsLoading]   = useState(false)
  const [showAddQ,    setShowAddQ]    = useState(false)
  const [newQ,        setNewQ]        = useState('')
  const [newA,        setNewA]        = useState('')
  const [newCat,      setNewCat]      = useState('General')
  const [qSaving,     setQSaving]     = useState(false)

  // ── Live quiz ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef  = useRef<any>(null)
  const stateRef    = useRef<QuizLiveState | null>(null)
  const buzzLockRef = useRef(false)

  const [liveState,   setLiveState]   = useState<QuizLiveState | null>(null)
  const [liveLoading, setLiveLoading] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [mode, setMode] = useState<GameMode>(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('ql_mode') as GameMode) || 'rapid_fire'
      : 'rapid_fire'
  )
  const [innovA, setInnovA] = useState(0)
  const [innovB, setInnovB] = useState(0)

  // ── Launch form ────────────────────────────────────────────────────────────
  const [launchTeamA, setLaunchTeamA] = useState('')
  const [launchTeamB, setLaunchTeamB] = useState('')
  const [launchMode,  setLaunchMode]  = useState<GameMode>('rapid_fire')
  const [launchQCount,setLaunchQCount]= useState(10)
  const [launching,   setLaunching]   = useState(false)

  // ── Keep stateRef in sync ──────────────────────────────────────────────────
  useEffect(() => { stateRef.current = liveState }, [liveState])

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/login'); return }
      const { data } = await supabase
        .from('profiles').select('role').eq('id', session.user.id).single()
      const role = data?.role ?? session.user.user_metadata?.role
      if (role === 'admin' || role === 'moderator') setAuthChecked(true)
      else router.push('/dashboard')
    })
  }, [router])

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadTeams = useCallback(async () => {
    setTeamsLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('fsc_teams').select('*').order('created_at')
    setTeams((data as FSCTeam[]) || [])
    setTeamsLoading(false)
  }, [])

  const loadQuestions = useCallback(async () => {
    setQsLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('fsc_questions').select('*').order('created_at')
    setQuestions((data as FSCQuestion[]) || [])
    setQsLoading(false)
  }, [])

  const loadLiveState = useCallback(async () => {
    const { data } = await getLiveState()
    if (data) {
      setLiveState(data)
    } else {
      const { data: created } = await saveLiveState({
        team_a_name: 'Team A', team_b_name: 'Team B',
        score_a: 0, score_b: 0, questions: [],
        current_index: 0, phase: 'idle', last_result: null,
      })
      if (created) setLiveState(created)
    }
    setLiveLoading(false)
  }, [])

  // ── Patch helper ───────────────────────────────────────────────────────────
  const patch = useCallback(async (updates: Partial<QuizLiveState>) => {
    setSaving(true)
    const { data } = await saveLiveState(updates)
    if (data) {
      const m: GameMode = (localStorage.getItem('ql_mode') as GameMode) || 'rapid_fire'
      setLiveState(data)
      channelRef.current?.send({ type: 'broadcast', event: 'quiz_state', payload: { ...data, mode: m } })
    }
    setSaving(false)
  }, [])

  // ── Channel + initial loads ────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bc = (supabase.channel(BROADCAST_ROOM) as any)
      .on('broadcast', { event: 'buzz' }, (msg: { payload: { team: 'a' | 'b' } }) => {
        if (buzzLockRef.current) return
        const s = stateRef.current
        if (!s || s.phase !== 'showing') return
        buzzLockRef.current = true
        const newPhase: LivePhase = msg.payload.team === 'a' ? 'buzzed_a' : 'buzzed_b'
        patch({ phase: newPhase })
      })
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') channelRef.current = bc })

    loadTeams(); loadQuestions(); loadLiveState()
    return () => { supabase.removeChannel(bc); channelRef.current = null }
  }, [authChecked, loadTeams, loadQuestions, loadLiveState, patch])

  // ── Mode change ────────────────────────────────────────────────────────────
  const changeMode = (m: GameMode) => {
    setMode(m)
    localStorage.setItem('ql_mode', m)
    const s = stateRef.current
    if (s) channelRef.current?.send({ type: 'broadcast', event: 'quiz_state', payload: { ...s, mode: m } })
  }

  // ── Team actions ───────────────────────────────────────────────────────────
  const addTeam = async () => {
    if (!newTeamName.trim()) return
    setTeamSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('fsc_teams').insert({ name: newTeamName.trim(), school: newTeamSchool.trim(), status: 'active' })
    setNewTeamName(''); setNewTeamSchool(''); setShowAddTeam(false)
    await loadTeams()
    setTeamSaving(false)
  }

  const updateTeamStatus = async (id: string, status: FSCTeam['status']) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('fsc_teams').update({ status }).eq('id', id)
    setTeams(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  const deleteTeam = async (id: string) => {
    if (!confirm('Delete this team?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('fsc_teams').delete().eq('id', id)
    setTeams(prev => prev.filter(t => t.id !== id))
  }

  // ── Question actions ───────────────────────────────────────────────────────
  const addQuestion = async () => {
    if (!newQ.trim()) return
    setQSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('fsc_questions').insert({ question: newQ.trim(), answer: newA.trim(), category: newCat.trim() || 'General' })
    setNewQ(''); setNewA(''); setNewCat('General'); setShowAddQ(false)
    await loadQuestions()
    setQSaving(false)
  }

  const deleteQuestion = async (id: string) => {
    if (!confirm('Delete this question?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('fsc_questions').delete().eq('id', id)
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  // ── Launch ─────────────────────────────────────────────────────────────────
  const launchMatch = async () => {
    if (!launchTeamA || !launchTeamB || launchTeamA === launchTeamB) return
    setLaunching(true)
    const tA = teams.find(t => t.id === launchTeamA)
    const tB = teams.find(t => t.id === launchTeamB)
    const shuffled = [...questions].sort(() => Math.random() - 0.5).slice(0, launchQCount)
    const liveQs: LiveQuestion[] = shuffled.map(q => ({
      id: q.id, question: q.question, options: [],
      correct_answer: 0, category: q.category, answer_key: q.answer,
    }))
    localStorage.setItem('ql_mode', launchMode)
    setMode(launchMode)
    buzzLockRef.current = false
    await patch({
      team_a_name: tA?.name || 'Team A',
      team_b_name: tB?.name || 'Team B',
      score_a: 0, score_b: 0,
      questions: liveQs,
      current_index: 0,
      phase: 'showing',
      last_result: null,
    })
    setLaunching(false)
    setActiveTab('live')
  }

  // ── Live actions ───────────────────────────────────────────────────────────
  const markCorrect = (team: 'a' | 'b') => {
    if (!liveState) return
    patch({
      score_a: team === 'a' ? liveState.score_a + POINTS : liveState.score_a,
      score_b: team === 'b' ? liveState.score_b + POINTS : liveState.score_b,
      phase: 'revealed',
      last_result: team === 'a' ? 'correct_a' : 'correct_b',
    })
  }
  const markWrong = () => patch({ phase: 'revealed', last_result: 'wrong' })
  const markPass  = () => {
    if (!liveState) return
    buzzLockRef.current = false
    setInnovA(0); setInnovB(0)
    const next = liveState.current_index + 1
    patch(next >= liveState.questions.length
      ? { phase: 'idle', last_result: 'pass' }
      : { current_index: next, phase: 'showing', last_result: 'pass' })
  }
  const nextQuestion = () => {
    if (!liveState) return
    buzzLockRef.current = false; setInnovA(0); setInnovB(0)
    const next = liveState.current_index + 1
    patch(next >= liveState.questions.length
      ? { phase: 'idle', last_result: null }
      : { current_index: next, phase: 'showing', last_result: null })
  }
  const awardInnovPoints = () => {
    if (!liveState || (innovA === 0 && innovB === 0)) return
    patch({
      score_a: liveState.score_a + innovA,
      score_b: liveState.score_b + innovB,
      phase: 'revealed',
      last_result: innovA > innovB ? 'correct_a' : innovB > innovA ? 'correct_b' : 'wrong',
    })
    setInnovA(0); setInnovB(0)
  }
  const endMatch = async () => {
    if (!confirm('End the current match?')) return
    buzzLockRef.current = false; setInnovA(0); setInnovB(0)
    await patch({ phase: 'idle', last_result: null })
    setActiveTab('teams')
  }

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!authChecked || liveLoading) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={40} />
    </div>
  )

  // ── Derived ────────────────────────────────────────────────────────────────
  const phase        = liveState?.phase ?? 'idle'
  const matchActive  = phase !== 'idle'
  const currentQ     = liveState?.questions?.[liveState?.current_index ?? 0] ?? null
  const totalQ       = liveState?.questions?.length ?? 0
  const buzzedName   = phase === 'buzzed_a' ? liveState?.team_a_name : phase === 'buzzed_b' ? liveState?.team_b_name : null
  const activeTeams  = teams.filter(t => t.status === 'active')
  const elimTeams    = teams.filter(t => t.status === 'eliminated')
  const winnerTeams  = teams.filter(t => t.status === 'winner')

  const TABS = [
    { key: 'teams'     as Tab, label: 'Teams',        Icon: Users      },
    { key: 'questions' as Tab, label: 'Questions',    Icon: HelpCircle },
    { key: 'launch'    as Tab, label: 'Launch Match', Icon: Rocket     },
    { key: 'live'      as Tab, label: 'Live Control', Icon: Radio      },
  ]

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col">

      {/* Header */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/20 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Trophy className="text-[#f5a623]" size={24} />
        <div className="flex-1">
          <h1 className="text-base font-black text-white leading-none">Final Scholars Challenge</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Scholars Challenge Administration</p>
        </div>
        {matchActive && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 border border-green-500/40 rounded-full text-[10px] font-bold text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE
          </span>
        )}
        {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      {/* Tabs */}
      <div className="bg-[#0a1628] border-b border-white/10 px-4 flex gap-0 overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key ? 'border-[#f5a623] text-[#f5a623]' : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            <Icon size={13} />
            {label}
            {key === 'live' && matchActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-0.5" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl mx-auto w-full space-y-4">

        {/* ════════════════ TEAMS ════════════════ */}
        {activeTab === 'teams' && <>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'TOTAL',      value: teams.length,       color: 'text-white'     },
              { label: 'ACTIVE',     value: activeTeams.length, color: 'text-green-400' },
              { label: 'ELIMINATED', value: elimTeams.length,   color: 'text-red-400'   },
              { label: 'WINNERS 🏆', value: winnerTeams.length, color: 'text-[#f5a623]' },
            ].map(s => (
              <div key={s.label} className="bg-[#0a1628] border border-white/10 rounded-2xl px-5 py-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{s.label}</p>
                <p className={`text-4xl font-black mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Header row */}
          <div className="flex items-center justify-between">
            <h2 className="font-black text-white text-sm">Registered Teams <span className="text-slate-500 font-normal">({teams.length})</span></h2>
            <button onClick={() => setShowAddTeam(v => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors">
              <Plus size={12} /> Register Team
            </button>
          </div>

          {/* Add team form */}
          {showAddTeam && (
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-[#f5a623]">New Team</p>
              <input placeholder="Team Name *" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <input placeholder="School (optional)" value={newTeamSchool} onChange={e => setNewTeamSchool(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <div className="flex gap-2">
                <button onClick={addTeam} disabled={teamSaving || !newTeamName.trim()}
                  className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                  {teamSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Team'}
                </button>
                <button onClick={() => { setShowAddTeam(false); setNewTeamName(''); setNewTeamSchool('') }}
                  className="px-4 py-2.5 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Team list */}
          {teamsLoading
            ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>
            : teams.length === 0
            ? <p className="text-center text-slate-600 text-sm py-10">No teams yet — register your first team above</p>
            : teams.map(team => {
                const statusStyle = {
                  active:     'bg-green-500/20 text-green-400 border-green-500/30',
                  eliminated: 'bg-red-500/20 text-red-400 border-red-500/30',
                  winner:     'bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30',
                }[team.status]
                return (
                  <div key={team.id} className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#f5a623]/20 border border-[#f5a623]/30 flex items-center justify-center text-[#f5a623] font-black text-lg shrink-0">
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-white text-sm">{team.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle}`}>
                            {team.status.charAt(0).toUpperCase() + team.status.slice(1)}
                          </span>
                        </div>
                        {team.school && <p className="text-xs text-slate-500 mt-0.5 truncate">{team.school}</p>}
                      </div>
                      <button onClick={() => deleteTeam(team.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2 mt-3 pl-13">
                      <button
                        onClick={() => updateTeamStatus(team.id, team.status === 'active' ? 'eliminated' : 'active')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30">
                        {team.status === 'active' ? 'Eliminate' : 'Reinstate'}
                      </button>
                      <button onClick={() => updateTeamStatus(team.id, 'winner')}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 hover:bg-[#f5a623]/30 transition-colors">
                        🏆 Winner
                      </button>
                    </div>
                  </div>
                )
              })
          }
        </>}

        {/* ════════════════ QUESTIONS ════════════════ */}
        {activeTab === 'questions' && <>

          <div className="flex items-center justify-between">
            <h2 className="font-black text-white text-sm">Questions <span className="text-slate-500 font-normal">({questions.length})</span></h2>
            <button onClick={() => setShowAddQ(v => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors">
              <Plus size={12} /> Add Question
            </button>
          </div>

          {showAddQ && (
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-[#f5a623]">New Question</p>
              <textarea placeholder="Question *" value={newQ} onChange={e => setNewQ(e.target.value)} rows={3}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />
              <input placeholder="Answer (shown to admin only)" value={newA} onChange={e => setNewA(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <input placeholder="Category (e.g. Science, History)" value={newCat} onChange={e => setNewCat(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <div className="flex gap-2">
                <button onClick={addQuestion} disabled={qSaving || !newQ.trim()}
                  className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                  {qSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Question'}
                </button>
                <button onClick={() => { setShowAddQ(false); setNewQ(''); setNewA(''); setNewCat('General') }}
                  className="px-4 py-2.5 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {qsLoading
            ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>
            : questions.length === 0
            ? <p className="text-center text-slate-600 text-sm py-10">No questions yet — add your first question above</p>
            : questions.map((q, idx) => (
              <div key={q.id} className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-slate-600 font-bold">#{idx + 1}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-slate-400">{q.category}</span>
                    </div>
                    <p className="text-sm text-white font-medium leading-relaxed">{q.question}</p>
                    {q.answer && <p className="text-xs text-[#f5a623]/80 mt-2 font-semibold">✓ {q.answer}</p>}
                  </div>
                  <button onClick={() => deleteQuestion(q.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          }
        </>}

        {/* ════════════════ LAUNCH ════════════════ */}
        {activeTab === 'launch' && <>

          {matchActive && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Match In Progress</p>
                <p className="text-sm text-white mt-0.5">{liveState?.team_a_name} vs {liveState?.team_b_name}</p>
              </div>
              <button onClick={endMatch}
                className="px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/30 transition-colors">
                End Match
              </button>
            </div>
          )}

          {/* Team selectors */}
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Select Teams</p>
            {(['a','b'] as const).map(side => (
              <div key={side}>
                <label className="text-xs text-slate-400 block mb-1.5">Team {side.toUpperCase()}</label>
                <div className="relative">
                  <select value={side === 'a' ? launchTeamA : launchTeamB}
                    onChange={e => side === 'a' ? setLaunchTeamA(e.target.value) : setLaunchTeamB(e.target.value)}
                    className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] appearance-none">
                    <option value="">— Select Team {side.toUpperCase()} —</option>
                    {activeTeams.filter(t => t.id !== (side === 'a' ? launchTeamB : launchTeamA)).map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            ))}
          </div>

          {/* Mode */}
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Game Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setLaunchMode(key)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-bold transition-all ${
                    launchMode === key ? 'border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623]' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}>
                  <Icon size={18} />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Question count */}
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Questions</p>
              <span className="text-sm font-bold text-white">{Math.min(launchQCount, questions.length)} of {questions.length}</span>
            </div>
            <input type="range" min={1} max={Math.max(questions.length, 1)}
              value={Math.min(launchQCount, Math.max(questions.length, 1))}
              onChange={e => setLaunchQCount(Number(e.target.value))}
              className="w-full accent-[#f5a623]" />
            <p className="text-xs text-slate-500 text-center">
              {questions.length === 0 ? 'Add questions first' : `${Math.min(launchQCount, questions.length)} questions will be randomly selected`}
            </p>
          </div>

          <button onClick={launchMatch}
            disabled={launching || !launchTeamA || !launchTeamB || launchTeamA === launchTeamB || questions.length === 0}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl hover:bg-[#e0941a] disabled:opacity-40 text-base transition-colors shadow-lg shadow-[#f5a623]/20">
            {launching ? <Loader2 size={20} className="animate-spin" /> : <Rocket size={20} />}
            🚀 Launch Match
          </button>
        </>}

        {/* ════════════════ LIVE CONTROL ════════════════ */}
        {activeTab === 'live' && <>

          {!matchActive ? (
            <div className="text-center py-16 space-y-4">
              <div className="text-6xl">📡</div>
              <p className="text-white font-bold text-lg">No match in progress</p>
              <p className="text-slate-400 text-sm">Go to Launch Match to start</p>
              <button onClick={() => setActiveTab('launch')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm hover:bg-[#e0941a] transition-colors">
                <Rocket size={14} /> Launch Match
              </button>
            </div>
          ) : <>

            {/* Mode switcher */}
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => changeMode(key)}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                    mode === key ? 'border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623]' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}>
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>

            {/* Scores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#0a1628] border border-green-500/30 rounded-2xl p-4 text-center">
                <p className="text-xs font-bold text-green-400 mb-1 truncate">{liveState?.team_a_name}</p>
                <p className="text-4xl font-black text-green-400">{liveState?.score_a ?? 0}</p>
              </div>
              <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
                <p className="text-xs font-bold text-purple-400 mb-1 truncate">{liveState?.team_b_name}</p>
                <p className="text-4xl font-black text-purple-400">{liveState?.score_b ?? 0}</p>
              </div>
            </div>

            {/* Buzz alert */}
            {buzzedName && (
              <div className={`rounded-2xl px-5 py-4 text-center font-black text-lg border animate-pulse ${
                phase === 'buzzed_a' ? 'bg-green-500/20 border-green-400/60 text-green-300' : 'bg-purple-500/20 border-purple-400/60 text-purple-300'
              }`}>
                🔔 {buzzedName} BUZZED IN!
              </div>
            )}

            {/* Question */}
            {currentQ && <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Q <strong className="text-white">{(liveState?.current_index ?? 0) + 1}</strong> of <strong className="text-white">{totalQ}</strong></span>
                <span className="text-xs bg-white/5 text-slate-400 px-2.5 py-1 rounded-full border border-white/10">{currentQ.category}</span>
              </div>

              <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-5">
                <p className="text-white font-semibold text-sm leading-relaxed">{currentQ.question}</p>
                {currentQ.answer_key && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">Answer (admin only)</p>
                    <p className="text-sm font-bold text-[#f5a623]">{currentQ.answer_key}</p>
                  </div>
                )}
              </div>

              {/* Result banner */}
              {phase === 'revealed' && liveState?.last_result && liveState.last_result !== 'pass' && (
                <div className={`rounded-xl px-4 py-3 text-center font-bold text-sm border ${
                  liveState.last_result === 'correct_a' ? 'bg-green-500/20 border-green-500/40 text-green-300' :
                  liveState.last_result === 'correct_b' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' :
                  'bg-red-500/20 border-red-500/40 text-red-300'
                }`}>
                  {liveState.last_result === 'correct_a' && `✅ +${POINTS} pts — ${liveState.team_a_name}`}
                  {liveState.last_result === 'correct_b' && `✅ +${POINTS} pts — ${liveState.team_b_name}`}
                  {liveState.last_result === 'wrong'     && '❌ No points awarded'}
                </div>
              )}

              {/* Rapid Fire controls */}
              {mode === 'rapid_fire' && phase === 'showing' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => markCorrect('a')} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-green-600/80 hover:bg-green-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                      <Check size={15} /> {liveState?.team_a_name}
                    </button>
                    <button onClick={() => markCorrect('b')} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-purple-600/80 hover:bg-purple-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                      <Check size={15} /> {liveState?.team_b_name}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={markWrong} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-3 bg-red-600/30 hover:bg-red-600/50 text-red-300 font-bold rounded-xl text-sm border border-red-500/30 disabled:opacity-50 transition-colors">
                      <X size={15} /> Wrong
                    </button>
                    <button onClick={markPass} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                      <SkipForward size={15} /> Pass
                    </button>
                  </div>
                </div>
              )}

              {/* Buzzer waiting */}
              {mode === 'buzzer' && phase === 'showing' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-3 rounded-xl border border-[#f5a623]/20 bg-[#f5a623]/5 px-5 py-4">
                    <Bell size={18} className="text-[#f5a623] animate-pulse" />
                    <span className="text-[#f5a623]/70 font-semibold text-sm">Waiting for a buzz…</span>
                  </div>
                  <button onClick={markPass} disabled={saving}
                    className="w-full flex items-center justify-center gap-1.5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                    <SkipForward size={15} /> Pass
                  </button>
                </div>
              )}

              {/* Buzzer buzzed */}
              {mode === 'buzzer' && (phase === 'buzzed_a' || phase === 'buzzed_b') && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => markCorrect(phase === 'buzzed_a' ? 'a' : 'b')} disabled={saving}
                      className={`flex items-center justify-center gap-1.5 py-4 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors ${
                        phase === 'buzzed_a' ? 'bg-green-600/80 hover:bg-green-600' : 'bg-purple-600/80 hover:bg-purple-600'
                      }`}>
                      <Check size={15} /> Correct
                    </button>
                    <button onClick={markWrong} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-red-600/30 hover:bg-red-600/50 text-red-300 font-bold rounded-xl text-sm border border-red-500/30 disabled:opacity-50 transition-colors">
                      <X size={15} /> Wrong
                    </button>
                  </div>
                  <button onClick={markPass} disabled={saving}
                    className="w-full flex items-center justify-center gap-1.5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                    <SkipForward size={15} /> Pass
                  </button>
                </div>
              )}

              {/* Innovation Sprint */}
              {mode === 'innovation_sprint' && phase === 'showing' && (
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest text-center">Award Points</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0a1628] border border-green-500/30 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-green-400 text-center truncate">{liveState?.team_a_name}</p>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setInnovA(v => Math.max(0, v - 5))} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"><Minus size={12} /></button>
                        <span className="text-2xl font-black text-green-400 w-10 text-center">{innovA}</span>
                        <button onClick={() => setInnovA(v => v + 5)} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"><Plus size={12} /></button>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[5,10,15,20].map(v => (
                          <button key={v} onClick={() => setInnovA(v)}
                            className={`py-1 rounded text-[10px] font-bold transition-colors ${innovA===v?'bg-green-500 text-white':'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{v}</button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-[#0a1628] border border-purple-500/30 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-bold text-purple-400 text-center truncate">{liveState?.team_b_name}</p>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setInnovB(v => Math.max(0, v - 5))} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"><Minus size={12} /></button>
                        <span className="text-2xl font-black text-purple-400 w-10 text-center">{innovB}</span>
                        <button onClick={() => setInnovB(v => v + 5)} className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"><Plus size={12} /></button>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[5,10,15,20].map(v => (
                          <button key={v} onClick={() => setInnovB(v)}
                            className={`py-1 rounded text-[10px] font-bold transition-colors ${innovB===v?'bg-purple-500 text-white':'bg-white/5 text-slate-400 hover:bg-white/10'}`}>{v}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button onClick={awardInnovPoints} disabled={saving || (innovA===0 && innovB===0)}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors">
                    <Trophy size={14} /> Apply Points
                  </button>
                  <button onClick={markPass} disabled={saving}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                    <SkipForward size={14} /> Pass
                  </button>
                </div>
              )}

              {/* Next question */}
              {phase === 'revealed' && (
                <button onClick={nextQuestion} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <SkipForward size={16} />}
                  {(liveState?.current_index ?? 0) + 1 >= totalQ ? '🏁 End Match' : '⏭ Next Question'}
                </button>
              )}

              <button onClick={endMatch} className="w-full py-2.5 bg-white/5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-xs border border-white/5 transition-colors">
                End Match Early
              </button>
            </>}
          </>}
        </>}

      </div>
    </div>
  )
}
