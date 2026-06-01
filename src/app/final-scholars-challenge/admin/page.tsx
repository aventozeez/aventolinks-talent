'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trophy, Users, HelpCircle, Rocket, Radio,
  Plus, Trash2, Check, X, SkipForward,
  Bell, Zap, Lightbulb, Loader2, ChevronDown,
  ChevronUp, Timer, ArrowRight, RefreshCw, Layers,
} from 'lucide-react'
import {
  FSCState, BZPhase,
  FSCQuestion, ISProblem,
  FSC_CHANNEL,
  makeDefaultState, safeForViewers,
  getMatchState, saveMatchState, getISAnswers,
  getBuzzPending, clearBuzzPending,
  RF_Q_COUNT, RF_TIME_MS, RF_CORRECT_PTS,
  BZ_Q_COUNT, BZ_CORRECT_PTS, BZ_PENALTY_PTS, BZ_TIME_MS,
  IS_PROB_COUNT, IS_TIME_MS, IS_STEP_PTS, IS_BONUS_PTS,
  QuestionPool, SavedMatch, PoolType,
  getPools, savePools, getSavedMatches, saveSavedMatchesList,
} from '@/lib/fsc-live'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'teams' | 'questions' | 'pools' | 'matches' | 'live'

type FSCTeam = {
  id: string
  name: string
  school: string
  status: 'active' | 'eliminated' | 'winner'
  created_at: string
}

type DBQuestion = {
  id: string
  question: string
  answer: string
  category: string
  type: 'regular' | 'sprint' | null
  steps: string[] | null
  created_at: string
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('teams')

  // ── Teams ──────────────────────────────────────────────────────────────────
  const [teams, setTeams] = useState<FSCTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamSchool, setNewTeamSchool] = useState('')
  const [teamSaving, setTeamSaving] = useState(false)

  // ── Questions ──────────────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<DBQuestion[]>([])
  const [qsLoading, setQsLoading] = useState(false)
  const [showAddQ, setShowAddQ] = useState(false)
  const [newQType, setNewQType] = useState<'regular' | 'sprint'>('regular')
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [newCat, setNewCat] = useState('General')
  const [newSteps, setNewSteps] = useState(['', '', '', '', ''])
  const [qSaving, setQSaving] = useState(false)

  // ── FSC Live State ─────────────────────────────────────────────────────────
  const [fscState, setFscState] = useState<FSCState | null>(null)
  const [fscLoading, setFscLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fscRef = useRef<FSCState | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)
  const buzzLockRef = useRef(false)
  const autoEndedRFRef = useRef(false)   // prevents double-firing auto-end
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyStateRef = useRef<any>(null) // stable ref so timer can call applyState

  // ── Timers ─────────────────────────────────────────────────────────────────
  const [timerMs, setTimerMs] = useState(0)

  // ── IS grading ─────────────────────────────────────────────────────────────
  const [isAnswers, setIsAnswers] = useState<{ a: string[] | null; b: string[] | null } | null>(null)
  const [isGrades, setIsGrades] = useState<{ a: number; b: number } | null>(null)
  const [loadingAnswers, setLoadingAnswers] = useState(false)

  // ── Launch form ────────────────────────────────────────────────────────────
  const [launchTeamA, setLaunchTeamA] = useState('')
  const [launchTeamB, setLaunchTeamB] = useState('')
  const [launching, setLaunching] = useState(false)

  // ── Pools ──────────────────────────────────────────────────────────────────
  const [pools, setPools] = useState<QuestionPool[]>([])
  const [poolsLoading, setPoolsLoading] = useState(false)
  const [showAddPool, setShowAddPool] = useState<PoolType | null>(null)
  const [newPoolName, setNewPoolName] = useState('')
  const [newPoolType, setNewPoolType] = useState<PoolType>('rapid_fire')
  const [poolSaving, setPoolSaving] = useState(false)
  const [managingPool, setManagingPool] = useState<QuestionPool | null>(null)
  const [managingPoolIds, setManagingPoolIds] = useState<Set<string>>(new Set())
  const [managingPoolSaving, setManagingPoolSaving] = useState(false)
  // Inline entry for RF/BZ pools
  const [bulkQs, setBulkQs] = useState<{q: string; a: string}[]>(
    () => Array.from({ length: 10 }, () => ({ q: '', a: '' }))
  )
  const [bulkSaving, setBulkSaving] = useState(false)
  // Inline entry for Sprint pools
  const [sprintStmt, setSprintStmt] = useState('')
  const [sprintSteps, setSprintSteps] = useState(['', '', '', '', ''])
  const [sprintProbSaving, setSprintProbSaving] = useState(false)

  // ── Saved Matches ──────────────────────────────────────────────────────────
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [newMatchName, setNewMatchName] = useState('')
  const [newMatchTeamA, setNewMatchTeamA] = useState('')
  const [newMatchTeamB, setNewMatchTeamB] = useState('')
  const [newMatchRFPool, setNewMatchRFPool] = useState('')
  const [newMatchBZPool, setNewMatchBZPool] = useState('')
  const [newMatchISPool, setNewMatchISPool] = useState('')
  const [matchSaving, setMatchSaving] = useState(false)

  // ── Sync ref ───────────────────────────────────────────────────────────────
  useEffect(() => { fscRef.current = fscState }, [fscState])

  // Reset auto-end flag whenever a team's RF turn begins
  useEffect(() => {
    if (fscState?.rf_phase === 'a_playing' || fscState?.rf_phase === 'b_playing') {
      autoEndedRFRef.current = false
    }
  }, [fscState?.rf_phase])

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      const role = data?.role ?? session.user.user_metadata?.role
      if (role === 'admin' || role === 'moderator') setAuthChecked(true)
      else router.push('/dashboard')
    })
  }, [router])

  // ── Core: save state + broadcast to all clients ────────────────────────────
  const applyState = useCallback(async (newState: FSCState) => {
    // 1. Update local state immediately (no waiting)
    fscRef.current = newState
    setFscState(newState)
    // 2. Broadcast to viewers instantly — before any DB write
    channelRef.current?.send({
      type: 'broadcast', event: 'state',
      payload: safeForViewers(newState),
    })
    // 3. Persist to DB in background (keeps poll-based fallback in sync)
    setSaving(true)
    await saveMatchState(newState)
    setSaving(false)
  }, [])
  // Keep ref in sync so the timer interval can call applyState
  useEffect(() => { applyStateRef.current = applyState }, [applyState])

  // ── Resync: tell all viewer pages to reload ────────────────────────────────
  const handleResync = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'reload', payload: {} })
  }, [])

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
    setQuestions((data as DBQuestion[]) || [])
    setQsLoading(false)
  }, [])

  const loadFSCState = useCallback(async () => {
    const s = await getMatchState()
    setFscState(s)
    if (s) {
      fscRef.current = s
      // Re-broadcast current state so all viewer pages sync immediately
      // (use a short delay to ensure channelRef is set after subscribe)
      setTimeout(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'state',
          payload: safeForViewers(s),
        })
      }, 500)
    }
    setFscLoading(false)
  }, [])

  const loadPools = useCallback(async () => {
    setPoolsLoading(true)
    setPools(await getPools())
    setPoolsLoading(false)
  }, [])

  const loadSavedMatches = useCallback(async () => {
    setMatchesLoading(true)
    setSavedMatches(await getSavedMatches())
    setMatchesLoading(false)
  }, [])

  // ── Buzz poll — admin checks DB every 200 ms during 'showing' phase ─────────
  useEffect(() => {
    const id = setInterval(async () => {
      const s = fscRef.current
      if (!s || s.round !== 'buzzer' || s.bz_phase !== 'showing') return
      if (buzzLockRef.current) return
      const pending = await getBuzzPending()
      if (!pending) return
      // Stale buzz from a previous question — ignore and clean up
      if (pending.q_index !== s.bz_q_index) { clearBuzzPending().catch(() => {}); return }
      buzzLockRef.current = true
      clearBuzzPending().catch(() => {})
      const newPhase: BZPhase = pending.team === 'a' ? 'buzzed_a' : 'buzzed_b'
      applyState({ ...s, bz_phase: newPhase, bz_buzz_start: pending.time })
    }, 200)
    return () => clearInterval(id)
  }, [applyState])

  // ── Admin state sync — pick up external bz_phase changes during 'showing' ──
  // The buzz poll above only reads fsc_buzz_pending. If the viewer-page backup
  // processor fires first (admin tab closed/backgrounded), it clears the pending
  // record and writes bz_phase:'buzzed_a' directly to fsc_match_state. This poll
  // detects that DB change and syncs the admin UI so Correct/Wrong become available.
  useEffect(() => {
    const id = setInterval(async () => {
      const s = fscRef.current
      if (!s || s.round !== 'buzzer' || s.bz_phase !== 'showing') return
      if (buzzLockRef.current) return
      const latest = await getMatchState()
      if (!latest || latest.bz_phase === 'showing') return
      // State was changed externally — sync admin and re-broadcast to viewers
      buzzLockRef.current = true
      fscRef.current = latest
      setFscState(latest)
      channelRef.current?.send({
        type: 'broadcast', event: 'state',
        payload: safeForViewers(latest),
      })
    }, 500)
    return () => clearInterval(id)
  }, [])

  // ── Channel (admin sends state; also listens for team buzzes) ──────────────
  useEffect(() => {
    if (!authChecked) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel(FSC_CHANNEL) as any)
      // Team pages broadcast 'buzz' directly — process it immediately here
      .on('broadcast', { event: 'buzz' }, (msg: { payload: { team: 'a' | 'b'; q_index: number; time: number } }) => {
        const s = fscRef.current
        if (!s || s.round !== 'buzzer' || s.bz_phase !== 'showing') return
        if (buzzLockRef.current) return
        if (msg.payload.q_index !== s.bz_q_index) return
        buzzLockRef.current = true
        clearBuzzPending().catch(() => {})
        const newPhase: BZPhase = msg.payload.team === 'a' ? 'buzzed_a' : 'buzzed_b'
        applyStateRef.current?.({ ...s, bz_phase: newPhase, bz_buzz_start: msg.payload.time })
      })
      .subscribe((status: string) => { if (status === 'SUBSCRIBED') channelRef.current = ch })

    loadTeams(); loadQuestions(); loadFSCState(); loadPools(); loadSavedMatches()
    return () => { supabase.removeChannel(ch); channelRef.current = null }
  }, [authChecked, loadTeams, loadQuestions, loadFSCState, loadPools, loadSavedMatches, applyState])

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const s = fscRef.current
      if (!s) return
      if (s.rf_phase === 'a_playing' || s.rf_phase === 'b_playing') {
        const remaining = Math.max(0, RF_TIME_MS - (Date.now() - (s.rf_timer_start ?? Date.now())))
        setTimerMs(remaining)
        // Auto-end team's turn when timer reaches 0
        if (remaining === 0 && !autoEndedRFRef.current) {
          autoEndedRFRef.current = true
          // Score is already current from live updates — just flip the phase
          const isA = s.rf_phase === 'a_playing'
          applyStateRef.current?.({ ...s, rf_phase: isA ? 'break' : 'done' })
        }
      } else if ((s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b' || s.bz_phase === 'second_chance') && s.bz_buzz_start) {
        setTimerMs(Math.max(0, BZ_TIME_MS - (Date.now() - s.bz_buzz_start)))
      } else if (s.is_phase === 'working' && s.is_timer_start) {
        setTimerMs(Math.max(0, IS_TIME_MS - (Date.now() - s.is_timer_start)))
      } else {
        setTimerMs(0)
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

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
    if (newQType === 'sprint') {
      const filledSteps = newSteps.filter(s => s.trim())
      if (filledSteps.length < 2) { alert('Add at least 2 steps for a Sprint Problem'); setQSaving(false); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('fsc_questions').insert({
        question: newQ.trim(), answer: '', category: newCat.trim() || 'Sprint',
        type: 'sprint', steps: filledSteps,
      })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('fsc_questions').insert({
        question: newQ.trim(), answer: newA.trim(), category: newCat.trim() || 'General',
        type: 'regular', steps: null,
      })
    }
    setNewQ(''); setNewA(''); setNewCat('General'); setNewSteps(['', '', '', '', '']); setShowAddQ(false)
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
  const regularQs = questions.filter(q => !q.type || q.type === 'regular')
  const sprintQs  = questions.filter(q => q.type === 'sprint')

  const launchMatch = async () => {
    if (!launchTeamA || !launchTeamB || launchTeamA === launchTeamB) return
    const needed = RF_Q_COUNT + BZ_Q_COUNT
    if (regularQs.length < needed) {
      alert(`Need at least ${needed} regular questions (have ${regularQs.length}). RF uses ${RF_Q_COUNT}, Buzzer uses ${BZ_Q_COUNT}.`)
      return
    }
    if (sprintQs.length < IS_PROB_COUNT) {
      alert(`Need at least ${IS_PROB_COUNT} sprint problems (have ${sprintQs.length}).`)
      return
    }
    setLaunching(true)
    const tA = teams.find(t => t.id === launchTeamA)
    const tB = teams.find(t => t.id === launchTeamB)

    const shuffledReg = [...regularQs].sort(() => Math.random() - 0.5)
    const rfQs: FSCQuestion[] = shuffledReg.slice(0, RF_Q_COUNT).map(q => ({
      id: q.id, question: q.question, answer: q.answer ?? '', category: q.category,
    }))
    const bzQs: FSCQuestion[] = shuffledReg.slice(RF_Q_COUNT, RF_Q_COUNT + BZ_Q_COUNT).map(q => ({
      id: q.id, question: q.question, answer: q.answer ?? '', category: q.category,
    }))
    const shuffledSprint = [...sprintQs].sort(() => Math.random() - 0.5)
    const isProbs: ISProblem[] = shuffledSprint.slice(0, IS_PROB_COUNT).map(q => ({
      id: q.id,
      statement: q.question,
      steps: q.steps ?? [],
      steps_shuffled: [...(q.steps ?? [])].sort(() => Math.random() - 0.5),
    }))

    buzzLockRef.current = false
    setIsAnswers(null); setIsGrades(null)
    const matchState: FSCState = {
      ...makeDefaultState(tA?.name || 'Team A', tB?.name || 'Team B'),
      round: 'rapid_fire',
      rf_questions: rfQs,
      bz_questions: bzQs,
      is_problems: isProbs,
    }
    await applyState(matchState)
    setLaunching(false)
    setActiveTab('live')
  }

  // ── Pool actions ──────────────────────────────────────────────────────────
  const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

  const createPool = async (typeOverride?: PoolType) => {
    if (!newPoolName.trim()) return
    setPoolSaving(true)
    const newPool: QuestionPool = {
      id: genId(), name: newPoolName.trim(), type: typeOverride ?? newPoolType, question_ids: [],
      created_at: new Date().toISOString(),
    }
    const updated = [...pools, newPool]
    setPools(updated)
    await savePools(updated)
    setNewPoolName(''); setShowAddPool(null); setPoolSaving(false)
  }

  const deletePool = async (id: string) => {
    if (!confirm('Delete this question pool?')) return
    const updated = pools.filter(p => p.id !== id)
    setPools(updated)
    await savePools(updated)
    // Remove pool references from any saved match
    const updatedMatches = savedMatches.map(m => ({
      ...m,
      rf_pool_id: m.rf_pool_id === id ? null : m.rf_pool_id,
      bz_pool_id: m.bz_pool_id === id ? null : m.bz_pool_id,
      is_pool_id: m.is_pool_id === id ? null : m.is_pool_id,
    }))
    setSavedMatches(updatedMatches)
    await saveSavedMatchesList(updatedMatches)
  }

  const openManagePool = (pool: QuestionPool) => {
    setManagingPool(pool)
    setManagingPoolIds(new Set(pool.question_ids))
    // reset inline entry forms
    setBulkQs(Array.from({ length: 10 }, () => ({ q: '', a: '' })))
    setSprintStmt(''); setSprintSteps(['', '', '', '', ''])
  }

  const savePoolQuestions = async () => {
    if (!managingPool) return
    setManagingPoolSaving(true)
    const updated = pools.map(p =>
      p.id === managingPool.id ? { ...p, question_ids: Array.from(managingPoolIds) } : p
    )
    setPools(updated)
    await savePools(updated)
    setManagingPool(null); setManagingPoolIds(new Set()); setManagingPoolSaving(false)
  }

  /** Bulk-insert RF/BZ questions into fsc_questions AND add to pool */
  const addBulkQuestionsToPool = async () => {
    if (!managingPool) return
    const filled = bulkQs.filter(r => r.q.trim())
    if (filled.length === 0) return
    setBulkSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('fsc_questions')
      .insert(filled.map(r => ({
        question: r.q.trim(), answer: r.a.trim(),
        category: 'General', type: 'regular', steps: null,
      })))
      .select('id')
    if (error) { alert('Error saving questions'); setBulkSaving(false); return }
    const newIds: string[] = (data as { id: string }[]).map(d => d.id)
    const updatedPool: QuestionPool = {
      ...managingPool,
      question_ids: [...managingPool.question_ids, ...newIds],
    }
    const updatedPools = pools.map(p => p.id === managingPool.id ? updatedPool : p)
    setManagingPool(updatedPool)
    setManagingPoolIds(new Set(updatedPool.question_ids))
    setPools(updatedPools)
    await savePools(updatedPools)
    await loadQuestions()
    setBulkQs(Array.from({ length: 10 }, () => ({ q: '', a: '' })))
    setBulkSaving(false)
  }

  /** Insert a sprint problem into fsc_questions AND add to pool */
  const addSprintProblemToPool = async () => {
    if (!managingPool || !sprintStmt.trim()) return
    const filledSteps = sprintSteps.filter(s => s.trim())
    if (filledSteps.length < 2) { alert('Add at least 2 steps'); return }
    setSprintProbSaving(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('fsc_questions')
      .insert({ question: sprintStmt.trim(), answer: '', category: 'Sprint', type: 'sprint', steps: filledSteps })
      .select('id')
      .single()
    if (error) { alert('Error saving problem'); setSprintProbSaving(false); return }
    const newId: string = (data as { id: string }).id
    const updatedPool: QuestionPool = {
      ...managingPool,
      question_ids: [...managingPool.question_ids, newId],
    }
    const updatedPools = pools.map(p => p.id === managingPool.id ? updatedPool : p)
    setManagingPool(updatedPool)
    setManagingPoolIds(new Set(updatedPool.question_ids))
    setPools(updatedPools)
    await savePools(updatedPools)
    await loadQuestions()
    setSprintStmt(''); setSprintSteps(['', '', '', '', ''])
    setSprintProbSaving(false)
  }

  /** Remove a question from the pool (does not delete from fsc_questions) */
  const removeFromPool = async (qId: string) => {
    if (!managingPool) return
    const updatedPool: QuestionPool = {
      ...managingPool,
      question_ids: managingPool.question_ids.filter(id => id !== qId),
    }
    const updatedPools = pools.map(p => p.id === managingPool.id ? updatedPool : p)
    setManagingPool(updatedPool)
    setManagingPoolIds(new Set(updatedPool.question_ids))
    setPools(updatedPools)
    await savePools(updatedPools)
  }

  // ── Saved match actions ────────────────────────────────────────────────────
  const createSavedMatch = async () => {
    if (!newMatchName.trim() || !newMatchTeamA.trim() || !newMatchTeamB.trim()) return
    if (!newMatchRFPool || !newMatchBZPool || !newMatchISPool) {
      alert('Please select a pool for each round.'); return
    }
    setMatchSaving(true)
    const newMatch: SavedMatch = {
      id: genId(), name: newMatchName.trim(),
      team_a_name: newMatchTeamA.trim(), team_b_name: newMatchTeamB.trim(),
      rf_pool_id: newMatchRFPool, bz_pool_id: newMatchBZPool, is_pool_id: newMatchISPool,
      status: 'draft', created_at: new Date().toISOString(),
    }
    const updated = [...savedMatches, newMatch]
    setSavedMatches(updated)
    await saveSavedMatchesList(updated)
    setNewMatchName(''); setNewMatchTeamA(''); setNewMatchTeamB('')
    setNewMatchRFPool(''); setNewMatchBZPool(''); setNewMatchISPool('')
    setShowAddMatch(false); setMatchSaving(false)
  }

  const deleteSavedMatch = async (id: string) => {
    if (!confirm('Delete this match?')) return
    const updated = savedMatches.filter(m => m.id !== id)
    setSavedMatches(updated)
    await saveSavedMatchesList(updated)
  }

  const launchSavedMatch = async (match: SavedMatch) => {
    const rfPool = pools.find(p => p.id === match.rf_pool_id)
    const bzPool = pools.find(p => p.id === match.bz_pool_id)
    const isPool = pools.find(p => p.id === match.is_pool_id)

    const rfPoolQs = rfPool
      ? questions.filter(q => rfPool.question_ids.includes(q.id) && (!q.type || q.type === 'regular'))
      : regularQs
    const bzPoolQs = bzPool
      ? questions.filter(q => bzPool.question_ids.includes(q.id) && (!q.type || q.type === 'regular'))
      : regularQs
    const isPoolQs = isPool
      ? questions.filter(q => isPool.question_ids.includes(q.id) && q.type === 'sprint')
      : sprintQs

    if (rfPoolQs.length < RF_Q_COUNT) {
      alert(`RF pool needs at least ${RF_Q_COUNT} regular questions (has ${rfPoolQs.length}).`); return
    }
    if (bzPoolQs.length < BZ_Q_COUNT) {
      alert(`Buzzer pool needs at least ${BZ_Q_COUNT} regular questions (has ${bzPoolQs.length}).`); return
    }
    if (isPoolQs.length < IS_PROB_COUNT) {
      alert(`Sprint pool needs at least ${IS_PROB_COUNT} sprint problems (has ${isPoolQs.length}).`); return
    }

    setMatchSaving(true)
    const shuffledRF = [...rfPoolQs].sort(() => Math.random() - 0.5)
    const rfQs: FSCQuestion[] = shuffledRF.slice(0, RF_Q_COUNT).map(q => ({
      id: q.id, question: q.question, answer: q.answer ?? '', category: q.category,
    }))
    const shuffledBZ = [...bzPoolQs].sort(() => Math.random() - 0.5)
    const bzQs: FSCQuestion[] = shuffledBZ.slice(0, BZ_Q_COUNT).map(q => ({
      id: q.id, question: q.question, answer: q.answer ?? '', category: q.category,
    }))
    const shuffledIS = [...isPoolQs].sort(() => Math.random() - 0.5)
    const isProbs: ISProblem[] = shuffledIS.slice(0, IS_PROB_COUNT).map(q => ({
      id: q.id, statement: q.question, steps: q.steps ?? [],
      steps_shuffled: [...(q.steps ?? [])].sort(() => Math.random() - 0.5),
    }))

    buzzLockRef.current = false
    setIsAnswers(null); setIsGrades(null)
    await applyState({
      ...makeDefaultState(match.team_a_name, match.team_b_name),
      round: 'rapid_fire', rf_questions: rfQs, bz_questions: bzQs, is_problems: isProbs,
    })

    // Mark this match live, any previously live match → completed
    const updatedMatches = savedMatches.map(m =>
      m.id === match.id ? { ...m, status: 'live' as const } :
      m.status === 'live' ? { ...m, status: 'completed' as const } : m
    )
    setSavedMatches(updatedMatches)
    await saveSavedMatchesList(updatedMatches)
    setMatchSaving(false)
    setActiveTab('live')
  }

  // ── RF Actions ─────────────────────────────────────────────────────────────
  const startRFTeamA = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, rf_phase: 'a_playing', rf_q_index: 0, rf_timer_start: Date.now(), rf_correct_a: 0 })
  }
  const startRFTeamB = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, rf_phase: 'b_playing', rf_q_index: 0, rf_timer_start: Date.now(), rf_correct_b: 0 })
  }
  const rfAction = (result: 'correct' | 'wrong' | 'skip') => {
    const s = fscRef.current; if (!s) return
    const isA = s.rf_phase === 'a_playing'
    const correct = result === 'correct'
    const newCorrectA = (isA && correct) ? s.rf_correct_a + 1 : s.rf_correct_a
    const newCorrectB = (!isA && correct) ? s.rf_correct_b + 1 : s.rf_correct_b
    // Wrong or skipped → recycle: append current question to end of the queue
    const newQuestions = [...s.rf_questions]
    if (result !== 'correct') {
      newQuestions.push(newQuestions[s.rf_q_index])
    }
    const nextIdx = s.rf_q_index + 1
    // Turn ends only when all (unrecycled) questions are answered correctly —
    // normal end-of-turn is handled by the 60 s timer auto-end.
    const done = nextIdx >= newQuestions.length
    // Update live score after every click so viewers see it immediately
    const newState: FSCState = {
      ...s,
      rf_questions: newQuestions,
      rf_correct_a: newCorrectA,
      rf_correct_b: newCorrectB,
      rf_q_index: nextIdx,
      rf_score_a: isA  ? newCorrectA * RF_CORRECT_PTS : s.rf_score_a,
      rf_score_b: !isA ? newCorrectB * RF_CORRECT_PTS : s.rf_score_b,
    }
    if (done) {
      applyState({ ...newState, rf_phase: isA ? 'break' : 'done' })
    } else {
      applyState(newState)
    }
  }
  const endRFEarly = () => {
    const s = fscRef.current; if (!s) return
    // Score is already current from live updates — just flip the phase
    const isA = s.rf_phase === 'a_playing'
    applyState({ ...s, rf_phase: isA ? 'break' : 'done' })
  }
  const proceedToBuzzer = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, round: 'buzzer', bz_phase: 'idle', bz_q_index: 0, bz_score_a: 0, bz_score_b: 0 })
  }

  // ── BZ Actions ─────────────────────────────────────────────────────────────
  const showBZQuestion = () => {
    const s = fscRef.current; if (!s) return
    buzzLockRef.current = false
    // Note: stale buzzes from previous questions are cleaned up by the poll's
    // q_index mismatch check. Calling clearBuzzPending() here could race with
    // a fast buzz arriving right after the broadcast, wiping it out.
    applyState({ ...s, bz_phase: 'showing', bz_buzz_start: null, bz_second_chance_team: null, bz_last_result: null })
  }
  const bzCorrect = () => {
    const s = fscRef.current; if (!s) return
    const team: 'a' | 'b' =
      s.bz_phase === 'buzzed_a' ? 'a' :
      s.bz_phase === 'buzzed_b' ? 'b' :
      s.bz_phase === 'second_chance' ? (s.bz_second_chance_team ?? 'a') : 'a'
    applyState({
      ...s, bz_phase: 'revealed',
      bz_last_result: team === 'a' ? 'correct_a' : 'correct_b',
      bz_score_a: team === 'a' ? s.bz_score_a + BZ_CORRECT_PTS : s.bz_score_a,
      bz_score_b: team === 'b' ? s.bz_score_b + BZ_CORRECT_PTS : s.bz_score_b,
    })
  }
  const bzWrong = () => {
    const s = fscRef.current; if (!s) return
    if (s.bz_phase === 'second_chance') {
      // No penalty for second chance team
      applyState({ ...s, bz_phase: 'revealed', bz_last_result: 'skip' })
    } else {
      // First buzzer wrong → penalty + second chance
      const firstBuzzer: 'a' | 'b' = s.bz_phase === 'buzzed_a' ? 'a' : 'b'
      const secondTeam: 'a' | 'b' = firstBuzzer === 'a' ? 'b' : 'a'
      applyState({
        ...s,
        bz_phase: 'second_chance',
        bz_second_chance_team: secondTeam,
        bz_last_result: firstBuzzer === 'a' ? 'penalty_a' : 'penalty_b',
        bz_score_a: firstBuzzer === 'a' ? s.bz_score_a - BZ_PENALTY_PTS : s.bz_score_a,
        bz_score_b: firstBuzzer === 'b' ? s.bz_score_b - BZ_PENALTY_PTS : s.bz_score_b,
        bz_buzz_start: Date.now(), // reset 15s timer for second team
      })
    }
  }
  const bzSkip = () => {
    const s = fscRef.current; if (!s) return
    buzzLockRef.current = false
    applyState({ ...s, bz_phase: 'revealed', bz_last_result: 'skip' })
  }
  const nextBZQuestion = () => {
    const s = fscRef.current; if (!s) return
    buzzLockRef.current = false
    const next = s.bz_q_index + 1
    if (next >= BZ_Q_COUNT) applyState({ ...s, bz_phase: 'done' })
    else applyState({ ...s, bz_phase: 'idle', bz_q_index: next })
  }
  const proceedToIS = () => {
    const s = fscRef.current; if (!s) return
    setIsAnswers(null); setIsGrades(null)
    applyState({ ...s, round: 'innovation_sprint', is_phase: 'idle', is_problem_index: 0, is_score_a: 0, is_score_b: 0 })
  }

  // ── IS Actions ─────────────────────────────────────────────────────────────
  const startISTimer = () => {
    const s = fscRef.current; if (!s) return
    setIsAnswers(null); setIsGrades(null)
    applyState({ ...s, is_phase: 'working', is_timer_start: Date.now(), is_team_a_answer: null, is_team_b_answer: null })
  }
  const collectISAnswers = async () => {
    const s = fscRef.current; if (!s) return
    await applyState({ ...s, is_phase: 'collecting' })
    setLoadingAnswers(true)
    // Give teams 3 seconds to auto-submit
    await new Promise(r => setTimeout(r, 3000))
    const answers = await getISAnswers(s.is_problem_index)
    setIsAnswers(answers)
    setLoadingAnswers(false)
  }
  const loadAnswersNow = async () => {
    const s = fscRef.current; if (!s) return
    setLoadingAnswers(true)
    const answers = await getISAnswers(s.is_problem_index)
    setIsAnswers(answers)
    setLoadingAnswers(false)
  }
  const gradeAndReveal = async () => {
    const s = fscRef.current; if (!s || !isAnswers) return
    const prob = s.is_problems[s.is_problem_index]
    if (!prob) return
    const gradeTeam = (answer: string[] | null): number => {
      if (!answer || answer.length === 0) return 0
      let pts = 0
      for (let i = 0; i < prob.steps.length; i++) {
        if (answer[i] === prob.steps[i]) pts += IS_STEP_PTS
      }
      if (pts === IS_STEP_PTS * prob.steps.length && prob.steps.length > 0) pts += IS_BONUS_PTS
      return pts
    }
    const gradeA = gradeTeam(isAnswers.a)
    const gradeB = gradeTeam(isAnswers.b)
    setIsGrades({ a: gradeA, b: gradeB })
    // Compute per-step correct/wrong so all screens can show the breakdown
    const stepResultsA = prob.steps.map((step, i) => isAnswers.a ? isAnswers.a[i] === step : false)
    const stepResultsB = prob.steps.map((step, i) => isAnswers.b ? isAnswers.b[i] === step : false)
    await applyState({
      ...s,
      is_phase: 'revealed',
      is_score_a: s.is_score_a + gradeA,
      is_score_b: s.is_score_b + gradeB,
      is_team_a_answer: isAnswers.a,
      is_team_b_answer: isAnswers.b,
      is_step_results_a: stepResultsA,
      is_step_results_b: stepResultsB,
    })
  }
  const nextISProblem = () => {
    const s = fscRef.current; if (!s) return
    const next = s.is_problem_index + 1
    setIsAnswers(null); setIsGrades(null)
    if (next >= IS_PROB_COUNT) applyState({ ...s, is_phase: 'done', is_step_results_a: null, is_step_results_b: null })
    else applyState({ ...s, is_phase: 'idle', is_problem_index: next, is_step_results_a: null, is_step_results_b: null })
  }
  const finishMatch = async () => {
    if (!confirm('Finish the match and show final scores?')) return
    const s = fscRef.current; if (!s) return
    applyState({ ...s, round: 'finished' })
  }
  const endMatchEarly = async () => {
    if (!confirm('End the match?')) return
    const s = fscRef.current; if (!s) return
    applyState({ ...s, round: 'idle' })
  }

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!authChecked || fscLoading) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={40} />
    </div>
  )

  // ── Derived ────────────────────────────────────────────────────────────────
  const s = fscState
  const round = s?.round ?? 'idle'
  const matchActive = round !== 'idle' && round !== 'finished'
  const activeTeams  = teams.filter(t => t.status === 'active')
  const elimTeams    = teams.filter(t => t.status === 'eliminated')
  const winnerTeams  = teams.filter(t => t.status === 'winner')

  const totalA = (s?.rf_score_a ?? 0) + (s?.bz_score_a ?? 0) + (s?.is_score_a ?? 0)
  const totalB = (s?.rf_score_b ?? 0) + (s?.bz_score_b ?? 0) + (s?.is_score_b ?? 0)

  const currentRFQ = s?.rf_questions?.[s?.rf_q_index ?? 0] ?? null
  const currentBZQ = s?.bz_questions?.[s?.bz_q_index ?? 0] ?? null
  const currentISP = s?.is_problems?.[s?.is_problem_index ?? 0] ?? null

  const timerSecs = Math.ceil(timerMs / 1000)
  const timerWarn = timerSecs <= 10 && timerSecs > 0

  const TABS = [
    { key: 'teams'     as Tab, label: 'Teams',        Icon: Users      },
    { key: 'questions' as Tab, label: 'Questions',    Icon: HelpCircle },
    { key: 'pools'     as Tab, label: 'Question Banks', Icon: Layers     },
    { key: 'matches'   as Tab, label: 'Matches',      Icon: Rocket     },
    { key: 'live'      as Tab, label: 'Live Control', Icon: Radio      },
  ]

  // ── Score display helper ────────────────────────────────────────────────────
  const ScoreBar = ({ label = 'Scores' }: { label?: string }) => (
    <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 text-center">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="text-center">
          <p className="text-xs font-bold text-green-400 truncate">{s?.team_a_name ?? 'Team A'}</p>
          <p className="text-3xl font-black text-green-400">{totalA}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-purple-400 truncate">{s?.team_b_name ?? 'Team B'}</p>
          <p className="text-3xl font-black text-purple-400">{totalB}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#060f1f] text-white flex flex-col">

      {/* Header */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/20 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Trophy className="text-[#f5a623]" size={24} />
        <div className="flex-1">
          <h1 className="text-base font-black text-white leading-none">Final Scholars Challenge</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Admin Control</p>
        </div>
        {matchActive && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 border border-green-500/40 rounded-full text-[10px] font-bold text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE
          </span>
        )}
        <button onClick={handleResync} title="Force all viewer screens to reload"
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/20 border border-blue-500/40 rounded-full text-[10px] font-bold text-blue-400 hover:bg-blue-500/30 transition-colors">
          📡 Resync
        </button>
        {saving && <Loader2 size={14} className="animate-spin text-slate-400" />}
      </div>

      {/* Tabs */}
      <div className="bg-[#0a1628] border-b border-white/10 px-4 flex gap-0 overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key ? 'border-[#f5a623] text-[#f5a623]' : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            <Icon size={13} />{label}
            {key === 'live' && matchActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-0.5" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl mx-auto w-full space-y-4">

        {/* ════════════════ TEAMS ════════════════ */}
        {activeTab === 'teams' && <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'TOTAL',      value: teams.length,       color: 'text-white'     },
              { label: 'ACTIVE',     value: activeTeams.length, color: 'text-green-400' },
              { label: 'ELIMINATED', value: elimTeams.length,   color: 'text-red-400'   },
              { label: 'WINNERS 🏆', value: winnerTeams.length, color: 'text-[#f5a623]' },
            ].map(stat => (
              <div key={stat.label} className="bg-[#0a1628] border border-white/10 rounded-2xl px-5 py-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{stat.label}</p>
                <p className={`text-4xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-black text-white text-sm">Registered Teams <span className="text-slate-500 font-normal">({teams.length})</span></h2>
            <button onClick={() => setShowAddTeam(v => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors">
              <Plus size={12} /> Register Team
            </button>
          </div>

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

          {teamsLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>
            : teams.length === 0
            ? <p className="text-center text-slate-600 text-sm py-10">No teams yet</p>
            : teams.map(team => {
                const st = { active: 'bg-green-500/20 text-green-400 border-green-500/30', eliminated: 'bg-red-500/20 text-red-400 border-red-500/30', winner: 'bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30' }[team.status]
                return (
                  <div key={team.id} className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#f5a623]/20 border border-[#f5a623]/30 flex items-center justify-center text-[#f5a623] font-black text-lg shrink-0">
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-white text-sm">{team.name}</p>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st}`}>
                            {team.status.charAt(0).toUpperCase() + team.status.slice(1)}
                          </span>
                        </div>
                        {team.school && <p className="text-xs text-slate-500 mt-0.5 truncate">{team.school}</p>}
                      </div>
                      <button onClick={() => deleteTeam(team.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => updateTeamStatus(team.id, team.status === 'active' ? 'eliminated' : 'active')}
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
            <div>
              <h2 className="font-black text-white text-sm">Questions</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {regularQs.length} regular · {sprintQs.length} sprint problems
              </p>
            </div>
            <button onClick={() => setShowAddQ(v => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors">
              <Plus size={12} /> Add
            </button>
          </div>

          {showAddQ && (
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-[#f5a623]">New Question</p>
              {/* Type toggle */}
              <div className="grid grid-cols-2 gap-2">
                {(['regular', 'sprint'] as const).map(t => (
                  <button key={t} onClick={() => setNewQType(t)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      newQType === t ? 'border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623]' : 'border-white/10 text-slate-400 hover:text-white'
                    }`}>
                    {t === 'regular' ? <><Zap size={11} className="inline mr-1" />Regular Question</> : <><Lightbulb size={11} className="inline mr-1" />Sprint Problem</>}
                  </button>
                ))}
              </div>

              <textarea placeholder={newQType === 'sprint' ? 'Problem Statement *' : 'Question *'}
                value={newQ} onChange={e => setNewQ(e.target.value)} rows={3}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />

              {newQType === 'regular' && (
                <input placeholder="Answer (admin-only)" value={newA} onChange={e => setNewA(e.target.value)}
                  className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              )}

              {newQType === 'sprint' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400 font-semibold">Steps in correct order (up to 5):</p>
                  {newSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-4 shrink-0">{idx + 1}.</span>
                      <input placeholder={`Step ${idx + 1}${idx < 2 ? ' *' : ' (optional)'}`}
                        value={step} onChange={e => { const ns = [...newSteps]; ns[idx] = e.target.value; setNewSteps(ns) }}
                        className="flex-1 bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                    </div>
                  ))}
                </div>
              )}

              <input placeholder="Category" value={newCat} onChange={e => setNewCat(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <div className="flex gap-2">
                <button onClick={addQuestion} disabled={qSaving || !newQ.trim()}
                  className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                  {qSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save'}
                </button>
                <button onClick={() => { setShowAddQ(false); setNewQ(''); setNewA(''); setNewCat('General'); setNewSteps(['','','','','']) }}
                  className="px-4 py-2.5 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Regular Questions */}
          {regularQs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Zap size={10} /> Regular Questions ({regularQs.length}) — for Rapid Fire &amp; Buzzer
              </p>
              <div className="space-y-2">
                {regularQs.map((q, idx) => (
                  <div key={q.id} className="bg-[#0a1628] border border-white/10 rounded-xl p-3 flex items-start gap-2">
                    <span className="text-[10px] text-slate-600 font-bold mt-0.5 shrink-0">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium leading-relaxed">{q.question}</p>
                      {q.answer && <p className="text-xs text-[#f5a623]/70 mt-1">✓ {q.answer}</p>}
                      <span className="text-[10px] text-slate-600">{q.category}</span>
                    </div>
                    <button onClick={() => deleteQuestion(q.id)} className="p-1 text-slate-600 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sprint Problems */}
          {sprintQs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Lightbulb size={10} /> Sprint Problems ({sprintQs.length}) — for Innovation Sprint
              </p>
              <div className="space-y-2">
                {sprintQs.map((q, idx) => (
                  <div key={q.id} className="bg-[#0a1628] border border-[#f5a623]/20 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-slate-600 font-bold mt-0.5 shrink-0">#{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{q.question}</p>
                        {q.steps && q.steps.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {q.steps.map((step, si) => (
                              <p key={si} className="text-xs text-[#f5a623]/70">Step {si + 1}: {step}</p>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteQuestion(q.id)} className="p-1 text-slate-600 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {qsLoading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>}
          {!qsLoading && questions.length === 0 && (
            <p className="text-center text-slate-600 text-sm py-10">No questions yet — add above</p>
          )}
        </>}

        {/* ════════════════ POOLS ════════════════ */}
        {activeTab === 'pools' && <>
          {managingPool ? (<>
            {/* ── Pool editor ── */}
            <div className="flex items-center gap-3">
              <button onClick={() => { setManagingPool(null); setManagingPoolIds(new Set()) }}
                className="px-3 py-1.5 bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs border border-white/10 transition-colors">
                ← Back
              </button>
              <div>
                <p className="font-black text-white text-sm">{managingPool.name}</p>
                <p className="text-[10px] text-slate-500">
                  {managingPool.type === 'rapid_fire' ? '⚡ Rapid Fire' : managingPool.type === 'buzzer' ? '🔔 Buzzer Round' : '💡 Innovation Sprint'}
                  {' · '}{managingPool.question_ids.length}{managingPool.type !== 'sprint' ? '/10' : ''} {managingPool.type === 'sprint' ? 'problems' : 'questions'}
                </p>
              </div>
            </div>

            {/* ── RF / Buzzer: bulk question entry ── */}
            {(managingPool.type === 'rapid_fire' || managingPool.type === 'buzzer') && (
              <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-bold text-[#f5a623]">Add Questions (10 per pool)</p>
                  <button onClick={() => setBulkQs(prev => [...prev, { q: '', a: '' }])}
                    className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors">
                    <Plus size={10} /> Add row
                  </button>
                </div>
                {/* Column headers */}
                <div className="grid gap-1.5" style={{ gridTemplateColumns: '1fr 0.6fr auto' }}>
                  <p className="text-[10px] text-slate-600 pl-1">Question</p>
                  <p className="text-[10px] text-slate-600 pl-1">Answer (admin only)</p>
                  <span />
                </div>
                <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
                  {bulkQs.map((row, i) => (
                    <div key={i} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: '1fr 0.6fr auto' }}>
                      <input value={row.q} onChange={e => setBulkQs(prev => prev.map((r, j) => j === i ? { ...r, q: e.target.value } : r))}
                        placeholder={`Q${i + 1}`}
                        className="bg-[#060f1f] border border-white/20 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#f5a623] w-full" />
                      <input value={row.a} onChange={e => setBulkQs(prev => prev.map((r, j) => j === i ? { ...r, a: e.target.value } : r))}
                        placeholder="Answer"
                        className="bg-[#060f1f] border border-white/20 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#f5a623] w-full" />
                      <button onClick={() => setBulkQs(prev => prev.filter((_, j) => j !== i))}
                        className="p-1.5 text-slate-700 hover:text-red-400 transition-colors shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addBulkQuestionsToPool}
                  disabled={bulkSaving || bulkQs.filter(r => r.q.trim()).length === 0}
                  className="w-full py-2.5 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors mt-1">
                  {bulkSaving
                    ? <Loader2 size={14} className="animate-spin mx-auto" />
                    : `Add ${bulkQs.filter(r => r.q.trim()).length} Question${bulkQs.filter(r => r.q.trim()).length !== 1 ? 's' : ''} to Pool`}
                </button>
              </div>
            )}

            {/* ── Sprint: inline problem entry ── */}
            {managingPool.type === 'sprint' && (
              <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-[#f5a623]">Add Sprint Problem (5 steps)</p>
                <textarea value={sprintStmt} onChange={e => setSprintStmt(e.target.value)}
                  placeholder="Problem statement *" rows={3}
                  className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Steps in correct order (up to 5):</p>
                  {sprintSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-4 shrink-0">{i + 1}.</span>
                      <input value={step} onChange={e => setSprintSteps(prev => prev.map((s, j) => j === i ? e.target.value : s))}
                        placeholder={`Step ${i + 1}${i < 2 ? ' *' : ' (optional)'}`}
                        className="flex-1 bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                    </div>
                  ))}
                </div>
                <button onClick={addSprintProblemToPool}
                  disabled={sprintProbSaving || !sprintStmt.trim() || sprintSteps.filter(s => s.trim()).length < 2}
                  className="w-full py-2.5 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors">
                  {sprintProbSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Add Problem to Pool'}
                </button>
              </div>
            )}

            {/* ── Questions already in this pool ── */}
            {managingPool.question_ids.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {managingPool.type === 'sprint' ? 'Problems' : 'Questions'} in this pool ({managingPool.question_ids.length}{managingPool.type !== 'sprint' ? '/10' : ''})
                </p>
                {questions
                  .filter(q => managingPool.question_ids.includes(q.id))
                  .map((q, idx) => (
                    <div key={q.id} className="flex items-start gap-2 bg-[#0a1628] border border-white/10 rounded-xl px-3 py-2.5">
                      <span className="text-[10px] text-slate-600 font-bold mt-0.5 shrink-0 w-5 text-center">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white leading-snug">{q.question}</p>
                        {q.answer && <p className="text-[10px] text-[#f5a623]/60 mt-0.5">✓ {q.answer}</p>}
                        {q.steps && q.steps.length > 0 && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{q.steps.length} steps</p>
                        )}
                        <span className="text-[10px] text-slate-600">{q.category}</span>
                      </div>
                      <button onClick={() => removeFromPool(q.id)}
                        className="p-1 text-slate-600 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                }
              </div>
            )}

            {managingPool.question_ids.length === 0 && (
              <p className="text-center text-slate-600 text-sm py-6">
                No questions yet — use the form above to add {managingPool.type === 'sprint' ? 'sprint problems' : 'questions'}
              </p>
            )}
          </>) : (<>
            {/* ── Three round-type sections ── */}
            <h2 className="font-black text-white text-sm">Question Banks</h2>
            {poolsLoading
              ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>
              : (
                <div className="space-y-4">
                  {(([
                    ['rapid_fire', '⚡', 'Rapid Fire',        '10 questions per pool · create as many pools as needed', 'border-[#f5a623]/25', 'text-[#f5a623]', 'bg-[#f5a623]/5'],
                    ['buzzer',     '🔔', 'Buzzer Round',      '10 questions per pool · create as many pools as needed', 'border-blue-500/25',  'text-blue-400',  'bg-blue-500/5' ],
                    ['sprint',     '💡', 'Innovation Sprint', '5-step problems per pool · create as many pools as needed', 'border-purple-500/25','text-purple-400','bg-purple-500/5'],
                  ] as [PoolType, string, string, string, string, string, string][]).map(([type, icon, title, hint, borderCls, textCls, bgCls]) => {
                    const sectionPools = pools.filter(p => p.type === type)
                    const isAdding = showAddPool === type
                    return (
                      <div key={type} className={`border ${borderCls} ${bgCls} rounded-2xl p-4 space-y-3`}>
                        {/* Section header */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`text-xs font-black ${textCls}`}>{icon} {title}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {hint}
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                              {sectionPools.length} pool{sectionPools.length !== 1 ? 's' : ''} created
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              if (isAdding) { setShowAddPool(null); setNewPoolName('') }
                              else {
                                setShowAddPool(type)
                                setNewPoolName(`Pool ${sectionPools.length + 1}`)
                              }
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black transition-colors shrink-0 ${
                              isAdding ? 'bg-white/10 text-slate-400 border border-white/10' : 'bg-[#f5a623] text-[#0a1628] hover:bg-[#e0941a]'
                            }`}>
                            {isAdding ? 'Cancel' : <><Plus size={10} />New Pool</>}
                          </button>
                        </div>

                        {/* Inline create form */}
                        {isAdding && (
                          <div className="flex gap-2">
                            <input placeholder="Pool name *" value={newPoolName}
                              onChange={e => setNewPoolName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && createPool(type)}
                              className="flex-1 bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                            <button onClick={() => createPool(type)} disabled={poolSaving || !newPoolName.trim()}
                              className="px-4 py-2 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors whitespace-nowrap">
                              {poolSaving ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
                            </button>
                          </div>
                        )}

                        {/* Pools in this section */}
                        {sectionPools.length > 0 && (
                          <div className="space-y-2">
                            {sectionPools.map((pool) => {
                              const qCount = pool.question_ids.length
                              const isReady = type === 'sprint' ? qCount >= IS_PROB_COUNT : qCount >= (type === 'rapid_fire' ? RF_Q_COUNT : BZ_Q_COUNT)
                              return (
                                <div key={pool.id} className="flex items-center gap-2 bg-[#060f1f]/60 border border-white/10 rounded-xl px-3 py-2.5">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{pool.name}</p>
                                    <p className={`text-[10px] mt-0.5 ${isReady ? 'text-green-400' : 'text-slate-500'}`}>
                                      {type === 'sprint'
                                        ? `${qCount} problem${qCount !== 1 ? 's' : ''}${isReady ? ' ✓' : ''}`
                                        : `${qCount}/10 questions${isReady ? ' ✓' : ''}`
                                      }
                                    </p>
                                  </div>
                                  <button onClick={() => openManagePool(pool)}
                                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold text-slate-300 transition-colors shrink-0">
                                    Edit →
                                  </button>
                                  <button onClick={() => deletePool(pool.id)}
                                    className="p-1 text-slate-600 hover:text-red-400 transition-colors shrink-0">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {sectionPools.length === 0 && !isAdding && (
                          <p className="text-center text-slate-700 text-xs py-1">No pools yet — create one above</p>
                        )}
                      </div>
                    )
                  }))}
                </div>
              )
            }
          </>)}
        </>}

        {/* ════════════════ MATCHES ════════════════ */}
        {activeTab === 'matches' && <>

          {matchActive && s && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Match In Progress</p>
                <p className="text-sm text-white mt-0.5">{s.team_a_name} vs {s.team_b_name}</p>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">{round.replace(/_/g, ' ')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActiveTab('live')}
                  className="px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-xl text-xs font-bold text-green-400 hover:bg-green-500/30 transition-colors">
                  Live Control
                </button>
                <button onClick={endMatchEarly}
                  className="px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/30 transition-colors">
                  End
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-white text-sm">Saved Matches</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{savedMatches.length} matches — launch when ready</p>
            </div>
            <button onClick={() => setShowAddMatch(v => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors">
              <Plus size={12} /> New Match
            </button>
          </div>

          {pools.length === 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-start gap-2">
              <span className="text-yellow-400 shrink-0 mt-0.5">⚠️</span>
              <div>
                <p className="text-xs font-bold text-yellow-400">No question banks yet</p>
                <p className="text-xs text-yellow-600 mt-0.5">Create question banks first (Question Banks tab), then build matches.</p>
              </div>
            </div>
          )}

          {showAddMatch && (
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-[#f5a623]">New Match</p>
              <input placeholder="Match name (e.g. Semifinal A)" value={newMatchName}
                onChange={e => setNewMatchName(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Team A name" value={newMatchTeamA} onChange={e => setNewMatchTeamA(e.target.value)}
                  className="bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                <input placeholder="Team B name" value={newMatchTeamB} onChange={e => setNewMatchTeamB(e.target.value)}
                  className="bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              </div>
              {([
                ['⚡ Rapid Fire Pool', newMatchRFPool, setNewMatchRFPool, 'rapid_fire'],
                ['🔔 Buzzer Pool',     newMatchBZPool, setNewMatchBZPool, 'buzzer'],
                ['💡 Sprint Pool',     newMatchISPool, setNewMatchISPool, 'sprint'],
              ] as [string, string, (v: string) => void, PoolType][]).map(([label, val, setter, type]) => (
                <div key={type}>
                  <label className="text-xs text-slate-400 block mb-1">{label}</label>
                  <div className="relative">
                    <select value={val} onChange={e => setter(e.target.value)}
                      className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] appearance-none">
                      <option value="">— Select Pool —</option>
                      {pools.filter(p => p.type === type).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.question_ids.length} questions)</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={createSavedMatch}
                  disabled={matchSaving || !newMatchName.trim() || !newMatchTeamA.trim() || !newMatchTeamB.trim() || !newMatchRFPool || !newMatchBZPool || !newMatchISPool}
                  className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                  {matchSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Match'}
                </button>
                <button onClick={() => { setShowAddMatch(false); setNewMatchName(''); setNewMatchTeamA(''); setNewMatchTeamB(''); setNewMatchRFPool(''); setNewMatchBZPool(''); setNewMatchISPool('') }}
                  className="px-4 py-2.5 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {matchesLoading
            ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>
            : savedMatches.length === 0
            ? (
              <div className="text-center py-12 space-y-2">
                <div className="text-4xl">🏆</div>
                <p className="text-slate-400 text-sm">No matches yet</p>
                <p className="text-slate-600 text-xs">Create a match and launch it when ready</p>
              </div>
            ) : [...savedMatches].reverse().map(match => {
              const rfPool = pools.find(p => p.id === match.rf_pool_id)
              const bzPool = pools.find(p => p.id === match.bz_pool_id)
              const isPool = pools.find(p => p.id === match.is_pool_id)
              const rfQCount = rfPool ? questions.filter(q => rfPool.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).length : 0
              const bzQCount = bzPool ? questions.filter(q => bzPool.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).length : 0
              const isQCount = isPool ? questions.filter(q => isPool.question_ids.includes(q.id) && q.type === 'sprint').length : 0
              const canLaunch = !!match.rf_pool_id && !!match.bz_pool_id && !!match.is_pool_id
                && rfQCount >= RF_Q_COUNT && bzQCount >= BZ_Q_COUNT && isQCount >= IS_PROB_COUNT
              const isLive = match.status === 'live'
              return (
                <div key={match.id} className={`bg-[#0a1628] border rounded-2xl p-4 ${
                  isLive ? 'border-green-500/40 ring-1 ring-green-500/20' : 'border-white/10'
                }`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-white text-sm">{match.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isLive ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                          match.status === 'completed' ? 'text-slate-500 border-slate-600/30 bg-white/5' :
                          'text-[#f5a623] border-[#f5a623]/30 bg-[#f5a623]/10'
                        }`}>
                          {isLive ? '● LIVE' : match.status === 'completed' ? 'Completed' : 'Draft'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {match.team_a_name} <span className="text-slate-600">vs</span> {match.team_b_name}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${rfPool ? 'bg-[#f5a623]/10 text-[#f5a623]/80' : 'bg-red-500/10 text-red-400'}`}>
                          ⚡ {rfPool ? rfPool.name : 'No pool'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${bzPool ? 'bg-blue-500/10 text-blue-400/80' : 'bg-red-500/10 text-red-400'}`}>
                          🔔 {bzPool ? bzPool.name : 'No pool'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${isPool ? 'bg-purple-500/10 text-purple-400/80' : 'bg-red-500/10 text-red-400'}`}>
                          💡 {isPool ? isPool.name : 'No pool'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => deleteSavedMatch(match.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {match.status === 'draft' && !canLaunch && (
                    <p className="text-[10px] text-red-400/70 mt-2">
                      ⚠ Pools need: RF≥{RF_Q_COUNT} ({rfQCount}), BZ≥{BZ_Q_COUNT} ({bzQCount}), IS≥{IS_PROB_COUNT} ({isQCount})
                    </p>
                  )}
                  {match.status === 'draft' && (
                    <button onClick={() => launchSavedMatch(match)} disabled={!canLaunch || matchSaving}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-3 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors">
                      {matchSaving ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                      🚀 Launch Match
                    </button>
                  )}
                  {isLive && (
                    <button onClick={() => setActiveTab('live')}
                      className="mt-3 w-full py-2.5 bg-green-500/20 border border-green-500/30 text-green-400 font-bold rounded-xl text-xs hover:bg-green-500/30 transition-colors">
                      → Go to Live Control
                    </button>
                  )}
                </div>
              )
            })
          }
        </>}

        {/* ════════════════ LIVE CONTROL ════════════════ */}
        {activeTab === 'live' && <>

          {round === 'idle' && (
            <div className="text-center py-16 space-y-4">
              <div className="text-6xl">📡</div>
              <p className="text-white font-bold text-lg">No match in progress</p>
              <p className="text-slate-400 text-sm">Go to Matches to launch one</p>
              <button onClick={() => setActiveTab('matches')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm hover:bg-[#e0941a] transition-colors">
                <Rocket size={14} /> Go to Matches
              </button>
            </div>
          )}

          {round !== 'idle' && s && <>

            {/* ══ RAPID FIRE ══ */}
            {round === 'rapid_fire' && <>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-xl">
                <Zap size={16} className="text-[#f5a623]" />
                <span className="text-sm font-black text-[#f5a623]">Rapid Fire Round</span>
                <span className="ml-auto text-xs text-slate-400">
                  {s.rf_phase === 'idle' && 'Ready to start'}
                  {s.rf_phase === 'a_playing' && `${s.team_a_name} playing`}
                  {s.rf_phase === 'break' && 'Break'}
                  {s.rf_phase === 'b_playing' && `${s.team_b_name} playing`}
                  {s.rf_phase === 'done' && 'Complete'}
                </span>
              </div>

              <ScoreBar label="Rapid Fire Scores" />

              {/* idle → start A */}
              {s.rf_phase === 'idle' && (
                <button onClick={startRFTeamA} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-5 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-base transition-colors disabled:opacity-50">
                  <Timer size={20} /> Start {s.team_a_name}&apos;s Turn (60s)
                </button>
              )}

              {/* A playing */}
              {s.rf_phase === 'a_playing' && <>
                <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : 'border-green-400/40 bg-green-500/10'}`}>
                  <p className="text-xs font-bold text-green-400 uppercase tracking-widest">{s.team_a_name} — Time Remaining</p>
                  <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-green-400'}`}>{fmtTime(timerMs)}</p>
                  <p className="text-xs text-slate-500 mt-1">Q {Math.min(s.rf_q_index + 1, RF_Q_COUNT)} of {RF_Q_COUNT}{s.rf_q_index >= RF_Q_COUNT ? ' ♻' : ''} · {s.rf_correct_a} correct</p>
                </div>

                {currentRFQ && (
                  <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-500 font-bold">Q{s.rf_q_index + 1} · {currentRFQ.category}</span>
                    </div>
                    <p className="text-base font-semibold text-white">{currentRFQ.question}</p>
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider">Answer (admin only)</p>
                      <p className="text-sm font-bold text-[#f5a623] mt-0.5">{currentRFQ.answer}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => rfAction('correct')} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                    <Check size={16} /> Correct
                  </button>
                  <button onClick={() => rfAction('wrong')} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm disabled:opacity-50 border border-red-500/30 transition-colors">
                    <X size={16} /> Wrong
                  </button>
                  <button onClick={() => rfAction('skip')} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm disabled:opacity-50 border border-white/10 transition-colors">
                    <SkipForward size={16} /> Skip
                  </button>
                </div>

                <button onClick={endRFEarly} disabled={saving}
                  className="w-full py-2.5 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl text-xs border border-white/10 transition-colors">
                  ⏹ End {s.team_a_name}&apos;s Turn Early
                </button>
              </>}

              {/* Break between A and B */}
              {s.rf_phase === 'break' && (
                <div className="space-y-3">
                  <div className="bg-[#0a1628] border border-green-500/30 rounded-2xl p-5 text-center">
                    <p className="text-4xl font-black text-green-400">{s.rf_correct_a} / {RF_Q_COUNT}</p>
                    <p className="text-sm text-green-400 font-semibold mt-1">{s.team_a_name} — {s.rf_score_a} pts</p>
                    <p className="text-xs text-slate-500 mt-2">Team A&apos;s turn complete</p>
                  </div>
                  <button onClick={startRFTeamB} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-5 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-base transition-colors disabled:opacity-50">
                    <Timer size={20} /> Start {s.team_b_name}&apos;s Turn (60s)
                  </button>
                </div>
              )}

              {/* B playing */}
              {s.rf_phase === 'b_playing' && <>
                <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : 'border-purple-400/40 bg-purple-500/10'}`}>
                  <p className="text-xs font-bold text-purple-400 uppercase tracking-widest">{s.team_b_name} — Time Remaining</p>
                  <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-purple-400'}`}>{fmtTime(timerMs)}</p>
                  <p className="text-xs text-slate-500 mt-1">Q {Math.min(s.rf_q_index + 1, RF_Q_COUNT)} of {RF_Q_COUNT}{s.rf_q_index >= RF_Q_COUNT ? ' ♻' : ''} · {s.rf_correct_b} correct</p>
                </div>

                {currentRFQ && (
                  <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-slate-500 font-bold">Q{s.rf_q_index + 1} · {currentRFQ.category}</span>
                    </div>
                    <p className="text-base font-semibold text-white">{currentRFQ.question}</p>
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider">Answer (admin only)</p>
                      <p className="text-sm font-bold text-[#f5a623] mt-0.5">{currentRFQ.answer}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => rfAction('correct')} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                    <Check size={16} /> Correct
                  </button>
                  <button onClick={() => rfAction('wrong')} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm disabled:opacity-50 border border-red-500/30 transition-colors">
                    <X size={16} /> Wrong
                  </button>
                  <button onClick={() => rfAction('skip')} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm disabled:opacity-50 border border-white/10 transition-colors">
                    <SkipForward size={16} /> Skip
                  </button>
                </div>

                <button onClick={endRFEarly} disabled={saving}
                  className="w-full py-2.5 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl text-xs border border-white/10 transition-colors">
                  ⏹ End {s.team_b_name}&apos;s Turn Early
                </button>
              </>}

              {/* RF Done */}
              {s.rf_phase === 'done' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0a1628] border border-green-500/30 rounded-2xl p-4 text-center">
                      <p className="text-xs font-bold text-green-400 truncate">{s.team_a_name}</p>
                      <p className="text-3xl font-black text-green-400 mt-1">{s.rf_score_a}</p>
                      <p className="text-xs text-slate-500 mt-1">{s.rf_correct_a} correct</p>
                    </div>
                    <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
                      <p className="text-xs font-bold text-purple-400 truncate">{s.team_b_name}</p>
                      <p className="text-3xl font-black text-purple-400 mt-1">{s.rf_score_b}</p>
                      <p className="text-xs text-slate-500 mt-1">{s.rf_correct_b} correct</p>
                    </div>
                  </div>
                  <button onClick={proceedToBuzzer} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-base hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                    <Bell size={20} /> Proceed to Buzzer Round <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>}

            {/* ══ BUZZER ══ */}
            {round === 'buzzer' && <>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <Bell size={16} className="text-blue-400" />
                <span className="text-sm font-black text-blue-400">Buzzer Round</span>
                <span className="ml-auto text-xs text-slate-400">Q {s.bz_q_index + 1} of {BZ_Q_COUNT}</span>
              </div>

              <ScoreBar label="Buzzer Scores" />

              {/* idle → show question */}
              {s.bz_phase === 'idle' && (
                <button onClick={showBZQuestion} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl text-base transition-colors disabled:opacity-50">
                  <Bell size={20} /> Show Question {s.bz_q_index + 1}
                </button>
              )}

              {/* Question display */}
              {(s.bz_phase === 'showing' || s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b' || s.bz_phase === 'second_chance' || s.bz_phase === 'revealed') && currentBZQ && (
                <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                  <span className="text-[10px] text-slate-500 font-bold">{currentBZQ.category}</span>
                  <p className="text-base font-semibold text-white mt-1">{currentBZQ.question}</p>
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-[10px] text-slate-600 uppercase tracking-wider">Answer (admin only)</p>
                    <p className="text-sm font-bold text-[#f5a623] mt-0.5">{currentBZQ.answer}</p>
                  </div>
                </div>
              )}

              {/* showing → waiting for buzz */}
              {s.bz_phase === 'showing' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-3 rounded-xl border border-[#f5a623]/20 bg-[#f5a623]/5 px-5 py-4">
                    <Bell size={18} className="text-[#f5a623] animate-pulse" />
                    <span className="text-[#f5a623]/70 font-semibold text-sm">Waiting for a buzz…</span>
                  </div>
                  <button onClick={bzSkip} disabled={saving}
                    className="w-full flex items-center justify-center gap-1.5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                    <SkipForward size={15} /> Skip Question
                  </button>
                </div>
              )}

              {/* buzzed_a or buzzed_b */}
              {(s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b') && (
                <div className="space-y-2">
                  <div className={`rounded-2xl px-5 py-4 text-center font-black text-xl border-2 animate-pulse ${
                    s.bz_phase === 'buzzed_a' ? 'border-green-400 bg-green-500/20 text-green-300' : 'border-purple-400 bg-purple-500/20 text-purple-300'
                  }`}>
                    🔔 {s.bz_phase === 'buzzed_a' ? s.team_a_name : s.team_b_name} BUZZED IN!
                  </div>
                  <div className={`rounded-xl px-4 py-3 text-center border ${timerSecs <= 5 && timerSecs > 0 ? 'border-red-400 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
                    <p className="text-xs text-slate-400 font-bold">Time to answer</p>
                    <p className={`text-4xl font-black ${timerSecs <= 5 ? 'text-red-400' : 'text-white'}`}>{timerSecs}s</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={bzCorrect} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                      <Check size={16} /> Correct (+{BZ_CORRECT_PTS})
                    </button>
                    <button onClick={bzWrong} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm disabled:opacity-50 border border-red-500/30 transition-colors">
                      <X size={16} /> Wrong (−{BZ_PENALTY_PTS})
                    </button>
                  </div>
                </div>
              )}

              {/* second chance */}
              {s.bz_phase === 'second_chance' && (
                <div className="space-y-2">
                  <div className={`rounded-2xl px-5 py-4 text-center border-2 ${
                    s.bz_second_chance_team === 'a' ? 'border-green-400/60 bg-green-500/10 text-green-300' : 'border-purple-400/60 bg-purple-500/10 text-purple-300'
                  }`}>
                    <p className="text-sm font-black">Second Chance!</p>
                    <p className="text-base font-semibold mt-1">
                      {s.bz_second_chance_team === 'a' ? s.team_a_name : s.team_b_name} — no penalty
                    </p>
                  </div>
                  <div className="rounded-xl px-4 py-2 text-center bg-white/5 border border-white/10">
                    <p className="text-4xl font-black text-white">{timerSecs}s</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={bzCorrect} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                      <Check size={16} /> Correct (+{BZ_CORRECT_PTS})
                    </button>
                    <button onClick={bzWrong} disabled={saving}
                      className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                      <X size={16} /> Wrong / Timeout
                    </button>
                  </div>
                </div>
              )}

              {/* revealed */}
              {s.bz_phase === 'revealed' && (
                <div className="space-y-2">
                  <div className={`rounded-xl px-4 py-3 text-center font-bold text-sm border ${
                    s.bz_last_result === 'correct_a' ? 'bg-green-500/20 border-green-500/40 text-green-300' :
                    s.bz_last_result === 'correct_b' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' :
                    s.bz_last_result === 'penalty_a' ? 'bg-red-500/20 border-red-500/40 text-red-300' :
                    s.bz_last_result === 'penalty_b' ? 'bg-red-500/20 border-red-500/40 text-red-300' :
                    'bg-slate-700/30 border-slate-600/30 text-slate-400'
                  }`}>
                    {s.bz_last_result === 'correct_a' && `✅ ${s.team_a_name} — +${BZ_CORRECT_PTS} pts`}
                    {s.bz_last_result === 'correct_b' && `✅ ${s.team_b_name} — +${BZ_CORRECT_PTS} pts`}
                    {s.bz_last_result === 'skip' && '⏭ No one answered — no points'}
                    {(s.bz_last_result === 'penalty_a' || s.bz_last_result === 'penalty_b') && `❌ Penalty applied — skip`}
                  </div>
                  <button onClick={nextBZQuestion} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {s.bz_q_index + 1 >= BZ_Q_COUNT ? 'End Buzzer Round' : `Next Question (${s.bz_q_index + 2}/${BZ_Q_COUNT})`}
                  </button>
                </div>
              )}

              {/* buzzer done */}
              {s.bz_phase === 'done' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0a1628] border border-green-500/30 rounded-2xl p-4 text-center">
                      <p className="text-xs font-bold text-green-400 truncate">{s.team_a_name}</p>
                      <p className="text-3xl font-black text-green-400 mt-1">{s.bz_score_a}</p>
                    </div>
                    <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl p-4 text-center">
                      <p className="text-xs font-bold text-purple-400 truncate">{s.team_b_name}</p>
                      <p className="text-3xl font-black text-purple-400 mt-1">{s.bz_score_b}</p>
                    </div>
                  </div>
                  <button onClick={proceedToIS} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-base hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                    <Lightbulb size={20} /> Proceed to Innovation Sprint <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>}

            {/* ══ INNOVATION SPRINT ══ */}
            {round === 'innovation_sprint' && <>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-xl">
                <Lightbulb size={16} className="text-[#f5a623]" />
                <span className="text-sm font-black text-[#f5a623]">Innovation Sprint</span>
                <span className="ml-auto text-xs text-slate-400">Problem {s.is_problem_index + 1} of {IS_PROB_COUNT}</span>
              </div>

              <ScoreBar label="Innovation Sprint Scores" />

              {/* Problem display (always shown when we have a problem) */}
              {currentISP && (
                <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4">
                  <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-wider mb-2">Problem Statement</p>
                  <p className="text-sm text-white font-medium">{currentISP.statement}</p>
                  {currentISP.steps.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Correct Step Order (admin only)</p>
                      {currentISP.steps.map((step, i) => (
                        <div key={i} className="flex gap-2 py-1 border-b border-white/5 last:border-0">
                          <span className="text-[10px] text-[#f5a623] font-bold w-4 shrink-0">{i + 1}.</span>
                          <p className="text-xs text-slate-300">{step}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* idle → start timer */}
              {s.is_phase === 'idle' && (
                <button onClick={startISTimer} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-5 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-base hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                  <Timer size={20} /> Start Timer (60s)
                </button>
              )}

              {/* working → timer running */}
              {s.is_phase === 'working' && (
                <div className="space-y-3">
                  <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : 'border-[#f5a623]/40 bg-[#f5a623]/5'}`}>
                    <p className="text-xs font-bold text-[#f5a623] uppercase tracking-widest">Teams Arranging Steps</p>
                    <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-[#f5a623]'}`}>{fmtTime(timerMs)}</p>
                  </div>
                  <button onClick={collectISAnswers} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-sm disabled:opacity-50 transition-colors">
                    <RefreshCw size={16} /> Stop Timer &amp; Collect Answers
                  </button>
                </div>
              )}

              {/* collecting */}
              {s.is_phase === 'collecting' && (
                <div className="space-y-3">
                  {loadingAnswers ? (
                    <div className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-6">
                      <Loader2 className="animate-spin text-[#f5a623]" size={20} />
                      <span className="text-slate-300 font-semibold">Collecting team answers…</span>
                    </div>
                  ) : isAnswers ? (
                    <div className="space-y-2">
                      <div className="bg-[#0a1628] border border-green-500/30 rounded-xl p-3">
                        <p className="text-xs font-bold text-green-400 mb-2">{s.team_a_name}</p>
                        {isAnswers.a ? isAnswers.a.map((step, i) => (
                          <p key={i} className="text-xs text-slate-300 py-0.5">{i + 1}. {step}</p>
                        )) : <p className="text-xs text-slate-600 italic">No answer submitted</p>}
                      </div>
                      <div className="bg-[#0a1628] border border-purple-500/30 rounded-xl p-3">
                        <p className="text-xs font-bold text-purple-400 mb-2">{s.team_b_name}</p>
                        {isAnswers.b ? isAnswers.b.map((step, i) => (
                          <p key={i} className="text-xs text-slate-300 py-0.5">{i + 1}. {step}</p>
                        )) : <p className="text-xs text-slate-600 italic">No answer submitted</p>}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-2">
                    <button onClick={loadAnswersNow} disabled={loadingAnswers}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 disabled:opacity-50 transition-colors">
                      <RefreshCw size={14} /> Reload Answers
                    </button>
                    <button onClick={gradeAndReveal} disabled={saving || !isAnswers}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                      <Trophy size={14} /> Grade &amp; Reveal
                    </button>
                  </div>
                </div>
              )}

              {/* revealed */}
              {s.is_phase === 'revealed' && (
                <div className="space-y-3">
                  {currentISP && (s.is_step_results_a || s.is_step_results_b) && (
                    <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grading Results</p>
                      {(['a', 'b'] as const).map(team => {
                        const answer = team === 'a' ? (isAnswers?.a ?? s.is_team_a_answer) : (isAnswers?.b ?? s.is_team_b_answer)
                        const stepResults = team === 'a' ? s.is_step_results_a : s.is_step_results_b
                        const name = team === 'a' ? s.team_a_name : s.team_b_name
                        const score = team === 'a' ? s.is_score_a : s.is_score_b
                        const color = team === 'a' ? 'text-green-400' : 'text-purple-400'
                        return (
                          <div key={team} className={`rounded-xl p-3 border ${team === 'a' ? 'border-green-500/30' : 'border-purple-500/30'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className={`text-xs font-bold ${color}`}>{name}</p>
                              <p className={`text-lg font-black ${color}`}>{score} pts total</p>
                            </div>
                            {answer && stepResults && currentISP.steps.map((correctStep, i) => {
                              const teamStep = answer[i] ?? ''
                              const ok = stepResults[i]
                              return (
                                <div key={i} className={`flex items-start gap-2 py-1 border-b border-white/5 last:border-0`}>
                                  <span className={`text-[10px] font-black mt-0.5 ${ok ? 'text-green-400' : 'text-red-400'}`}>{ok ? '✓' : '✗'}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-slate-400">{teamStep || '(no answer)'}</p>
                                    {!ok && <p className="text-[10px] text-[#f5a623]/60">Should be: {correctStep}</p>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <button onClick={nextISProblem} disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-base hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {s.is_problem_index + 1 >= IS_PROB_COUNT ? 'Finish Innovation Sprint' : `Next Problem (${s.is_problem_index + 2}/${IS_PROB_COUNT})`}
                  </button>
                </div>
              )}

              {/* done */}
              {s.is_phase === 'done' && (
                <button onClick={finishMatch} disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-5 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-lg hover:bg-[#e0941a] disabled:opacity-50 transition-colors shadow-lg shadow-[#f5a623]/20">
                  🏆 Finish Match &amp; Show Final Scores
                </button>
              )}
            </>}

            {/* ══ FINISHED ══ */}
            {round === 'finished' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-5xl mb-2">🏆</div>
                  <h2 className="text-xl font-black text-white">Match Complete!</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['a', 'b'] as const).map(team => {
                    const name = team === 'a' ? s.team_a_name : s.team_b_name
                    const rf = team === 'a' ? s.rf_score_a : s.rf_score_b
                    const bz = team === 'a' ? s.bz_score_a : s.bz_score_b
                    const is = team === 'a' ? s.is_score_a : s.is_score_b
                    const total = rf + bz + is
                    const color = team === 'a' ? { border: 'border-green-500/40', text: 'text-green-400', sub: 'text-green-700' } : { border: 'border-purple-500/40', text: 'text-purple-400', sub: 'text-purple-700' }
                    const isWinner = total >= (team === 'a' ? totalB : totalA)
                    return (
                      <div key={team} className={`bg-[#0a1628] border ${color.border} rounded-2xl p-4 ${isWinner && total > (team === 'a' ? totalB : totalA) ? 'ring-2 ring-[#f5a623]/50' : ''}`}>
                        {isWinner && total > (team === 'a' ? totalB : totalA) && <p className="text-[10px] text-[#f5a623] font-black text-center mb-1">🏆 WINNER</p>}
                        <p className={`text-xs font-bold ${color.text} text-center truncate`}>{name}</p>
                        <p className={`text-4xl font-black ${color.text} text-center mt-1`}>{total}</p>
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Rapid Fire</span><span className={color.text}>{rf}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Buzzer</span><span className={color.text}>{bz}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-500">Innovation</span><span className={color.text}>{is}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button onClick={() => applyState({ ...s, round: 'idle' })}
                  className="w-full py-3 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl text-sm border border-white/10 transition-colors">
                  Reset Match
                </button>
              </div>
            )}

            {/* End match early (shown during active rounds) */}
            {matchActive && (
              <button onClick={endMatchEarly}
                className="w-full py-2.5 bg-white/5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-xs border border-white/5 transition-colors mt-2">
                End Match Early
              </button>
            )}
          </>}
        </>}

      </div>
    </div>
  )
}
