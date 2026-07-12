'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import EmergencyTab from './EmergencyTab'
import {
  Trophy, Users, HelpCircle, Rocket, Radio,
  Plus, Trash2, Check, X, SkipForward,
  Bell, Zap, Lightbulb, Loader2, ChevronDown,
  ChevronUp, Timer, ArrowRight, RefreshCw, Layers, Pencil,
  Sparkles, Copy, ExternalLink,
} from 'lucide-react'
import {
  FSCState, BZPhase, MCPhase, AVPhase,
  FSCQuestion, ISProblem,
  FSC_CHANNEL,
  makeDefaultState, safeForViewers,
  getMatchState, saveMatchState, getISAnswers,
  getBuzzPending, clearBuzzPending,
  RF_Q_COUNT, RF_TIME_MS, RF_CORRECT_PTS,
  BZ_Q_COUNT, BZ_CORRECT_PTS, BZ_SECOND_CHANCE_PTS, BZ_PENALTY_PTS, BZ_TIME_MS,
  IS_PROB_COUNT, IS_TIME_MS, IS_STEP_PTS, IS_BONUS_PTS,
  QuestionPool, SavedMatch, PoolType,
  getPools, savePools, getSavedMatches, saveSavedMatchesList,
  School, getSchools, saveSchools, generateBracketMatches, BRACKET_TEMPLATE,
  MysteryPack, MysteryPuzzle, getMysteryPacks, saveMysteryPacks,
  MC_TIME_MS, MC_CORRECT_PTS, MC_PUZZLE_COUNT,
} from '@/lib/fsc-live'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import { wsSubscribe, wsBroadcast } from '@/lib/ws-sync'
import PointAdjuster from '@/components/point-adjuster'
import AdminRoundIntro from '@/components/round-instructions-admin'
import { ROUND_INFO } from '@/lib/round-info'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tab = 'schools' | 'bracket' | 'mystery' | 'teams' | 'questions' | 'pools' | 'matches' | 'live' | 'grand-final' | 'tie-breaker' | 'simulator'

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
  const [saving] = useState(false)
  const fscRef = useRef<FSCState | null>(null)
  const buzzLockRef = useRef(false)
  const autoEndedRFRef = useRef(false)   // prevents double-firing auto-end
  // Grace window for RF: when the 60s timer hits 0 we hold the phase for a
  // few extra seconds so admin can still grade a last-second answer that
  // came in right at the buzzer.
  const RF_GRACE_MS = 5_000
  const [rfGraceStart, setRfGraceStart] = useState<number | null>(null)
  const rfGraceStartRef = useRef<number | null>(null)
  rfGraceStartRef.current = rfGraceStart
  const [rfGraceMs, setRfGraceMs] = useState(0)
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
  // Inline entry for RF/BZ pools — id present = existing question (update), absent = new (insert)
  const [bulkQs, setBulkQs] = useState<{id?: string; q: string; a: string}[]>(
    () => Array.from({ length: 10 }, () => ({ q: '', a: '' }))
  )
  const [bulkSaving, setBulkSaving] = useState(false)
  // Inline entry for Sprint pools
  const [sprintTitle, setSprintTitle] = useState('')
  const [sprintStmt, setSprintStmt] = useState('')
  const [sprintSteps, setSprintSteps] = useState(['', '', '', '', ''])
  const [sprintProbSaving, setSprintProbSaving] = useState(false)

  // ── Inline question editing (pool view) ───────────────────────────────────
  const [editingQId, setEditingQId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ q: string; a: string; steps: string[] }>({ q: '', a: '', steps: ['', '', '', '', ''] })
  const [editSaving, setEditSaving] = useState(false)

  // ── Saved Matches ──────────────────────────────────────────────────────────
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [showAddMatch, setShowAddMatch] = useState(false)
  // Demo pools hidden from the create-match dropdowns by default so admin
  // can't accidentally seed a real match with rehearsal pools.
  const [showDemo, setShowDemo] = useState(false)
  const isDemo = (name: string) => /\(demo\)|demo pool|demo —/i.test(name || '')
  const [newMatchName, setNewMatchName] = useState('')
  const [newMatchTeamA, setNewMatchTeamA] = useState('')
  const [newMatchTeamB, setNewMatchTeamB] = useState('')
  const [newMatchRFPool, setNewMatchRFPool] = useState('')
  const [newMatchRFPoolB, setNewMatchRFPoolB] = useState('')
  const [newMatchBZPool, setNewMatchBZPool] = useState('')
  const [newMatchISPool, setNewMatchISPool] = useState('')
  const [newMatchISPool2, setNewMatchISPool2] = useState('')
  const [matchSaving, setMatchSaving] = useState(false)

  // ── Schools / Bracket ─────────────────────────────────────────────────────
  const [schools, setSchools] = useState<School[]>([])
  const [schoolsLoading, setSchoolsLoading] = useState(false)
  const [bracketGenerating, setBracketGenerating] = useState(false)
  const [editingSlot, setEditingSlot] = useState<number | null>(null)
  const [editSlotName, setEditSlotName] = useState('')
  const [editSlotNick, setEditSlotNick] = useState('')

  // ── Mystery Packs ──────────────────────────────────────────────────────────
  const [mysteryPacks, setMysteryPacks] = useState<MysteryPack[]>([])
  const [mysteryPacksLoading, setMysteryPacksLoading] = useState(false)
  const [showAddPack, setShowAddPack] = useState(false)
  const [editingPack, setEditingPack] = useState<MysteryPack | null>(null)
  const [packTitle, setPackTitle] = useState('')
  const [packScenario, setPackScenario] = useState('')
  const [packStory, setPackStory] = useState('')
  const [packFinalMsg, setPackFinalMsg] = useState('')
  const [packPuzzles, setPackPuzzles] = useState<Omit<MysteryPuzzle, 'id'>[]>(
    () => Array.from({ length: 10 }, () => ({ clue: '', scrambled: '', answer: '', story: '', image_url: '' }))
  )
  const [packSaving, setPackSaving] = useState(false)

  // ── 3TF / GF Launch ───────────────────────────────────────────────────────
  const [launch3TFPackA, setLaunch3TFPackA] = useState('')
  const [launch3TFPackB, setLaunch3TFPackB] = useState('')
  const [launch3TFPackC, setLaunch3TFPackC] = useState('')
  const [launchAVPoolA,  setLaunchAVPoolA]  = useState('')
  const [launchAVPoolB,  setLaunchAVPoolB]  = useState('')

  // ── Sync ref ───────────────────────────────────────────────────────────────
  useEffect(() => { fscRef.current = fscState }, [fscState])

  // Reset auto-end flag whenever a team's turn begins
  useEffect(() => {
    if (fscState?.rf_phase === 'a_playing' || fscState?.rf_phase === 'b_playing' ||
        fscState?.mc_phase === 'a_playing' || fscState?.mc_phase === 'b_playing' || fscState?.mc_phase === 'c_playing' ||
        fscState?.av_phase === 'a_playing' || fscState?.av_phase === 'b_playing') {
      autoEndedRFRef.current = false
      // Clear any stale grace state from the previous team's turn.
      setRfGraceStart(null)
      setRfGraceMs(0)
    }
  }, [fscState?.rf_phase, fscState?.mc_phase, fscState?.av_phase])

  // ── Auth — service role key bypasses RLS; no login needed ───────────────
  useEffect(() => { setAuthChecked(true) }, [])

  // ── Core: save state + broadcast to all clients ────────────────────────────
  const applyState = useCallback(async (newState: FSCState) => {
    // 1. Update local state immediately (no waiting)
    fscRef.current = newState
    setFscState(newState)
    // 2. Broadcast to viewers instantly — before any DB write
    wsBroadcast(FSC_CHANNEL + ':state', safeForViewers(newState))
    // 2b. Also broadcast raw state (with answers) to moderator screens.
    wsBroadcast(FSC_CHANNEL + ':mod', newState)
    // 3. Persist to DB in background (non-blocking)
    saveMatchState(newState).catch(() => {})
  }, [])
  // Keep ref in sync so the timer interval can call applyState
  useEffect(() => { applyStateRef.current = applyState }, [applyState])

  // ── Resync: tell all viewer pages to reload ────────────────────────────────
  const handleResync = useCallback(() => {
    wsBroadcast(FSC_CHANNEL + ':reload', {})
  }, [])

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadTeams = useCallback(async () => {
    setTeamsLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any).from('fsc_teams').select('*').order('created_at')
    setTeams((data as FSCTeam[]) || [])
    setTeamsLoading(false)
  }, [])

  const loadQuestions = useCallback(async () => {
    setQsLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin as any).from('fsc_questions').select('*').order('created_at').limit(5000)
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
        wsBroadcast(FSC_CHANNEL + ':state', safeForViewers(s))
        wsBroadcast(FSC_CHANNEL + ':mod', s)
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

  const loadSchools = useCallback(async () => {
    setSchoolsLoading(true)
    setSchools(await getSchools())
    setSchoolsLoading(false)
  }, [])

  const loadMysteryPacks = useCallback(async () => {
    setMysteryPacksLoading(true)
    setMysteryPacks(await getMysteryPacks())
    setMysteryPacksLoading(false)
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
      wsBroadcast(FSC_CHANNEL + ':state', safeForViewers(latest))
      wsBroadcast(FSC_CHANNEL + ':mod', latest)
    }, 500)
    return () => clearInterval(id)
  }, [])

  // ── WebSocket: listen for team buzzes ──────────────────────────────────────
  useEffect(() => {
    if (!authChecked) return

    const unsubBuzz = wsSubscribe(FSC_CHANNEL + ':buzz', (payload) => {
      const msg = payload as { team: 'a' | 'b'; q_index: number; time: number }
      const s = fscRef.current
      if (!s || s.round !== 'buzzer' || s.bz_phase !== 'showing') return
      if (buzzLockRef.current) return
      if (msg.q_index !== s.bz_q_index) return
      buzzLockRef.current = true
      clearBuzzPending().catch(() => {})
      const newPhase: BZPhase = msg.team === 'a' ? 'buzzed_a' : 'buzzed_b'
      applyStateRef.current?.({ ...s, bz_phase: newPhase, bz_buzz_start: msg.time })
    })

    loadTeams(); loadQuestions(); loadFSCState(); loadPools(); loadSavedMatches(); loadSchools(); loadMysteryPacks()
    return unsubBuzz
  }, [authChecked, loadTeams, loadQuestions, loadFSCState, loadPools, loadSavedMatches, loadSchools, loadMysteryPacks, applyState])

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const s = fscRef.current
      if (!s) return
      if (s.rf_phase === 'a_playing' || s.rf_phase === 'b_playing') {
        const remaining = Math.max(0, RF_TIME_MS - (Date.now() - (s.rf_timer_start ?? Date.now())))
        setTimerMs(remaining)
        // Timer just hit 0 → open the grace window (do NOT flip the phase yet).
        if (remaining === 0 && rfGraceStartRef.current === null) {
          const now = Date.now()
          setRfGraceStart(now)
          rfGraceStartRef.current = now
        }
        // While in the grace window, keep counting down the grace remaining.
        if (rfGraceStartRef.current !== null) {
          const graceLeft = Math.max(0, RF_GRACE_MS - (Date.now() - rfGraceStartRef.current))
          setRfGraceMs(graceLeft)
          // Only auto-flip when the grace window itself expires.
          if (graceLeft === 0 && !autoEndedRFRef.current) {
            autoEndedRFRef.current = true
            const isA = s.rf_phase === 'a_playing'
            applyStateRef.current?.({ ...s, rf_phase: isA ? 'score_a' : 'score_b' })
            setRfGraceStart(null)
            rfGraceStartRef.current = null
            setRfGraceMs(0)
          }
        }
      } else if ((s.bz_phase === 'buzzed_a' || s.bz_phase === 'buzzed_b' || s.bz_phase === 'second_chance') && s.bz_buzz_start) {
        setTimerMs(Math.max(0, BZ_TIME_MS - (Date.now() - s.bz_buzz_start)))
      } else if (s.is_phase === 'working' && s.is_timer_start) {
        setTimerMs(Math.max(0, IS_TIME_MS - (Date.now() - s.is_timer_start)))
      } else if ((s.mc_phase === 'a_playing' || s.mc_phase === 'b_playing' || s.mc_phase === 'c_playing') && s.mc_timer_start) {
        const remaining = Math.max(0, MC_TIME_MS - (Date.now() - s.mc_timer_start))
        setTimerMs(remaining)
        if (remaining === 0 && !autoEndedRFRef.current) {
          autoEndedRFRef.current = true
          const next: MCPhase = s.mc_phase === 'a_playing' ? 'b_playing' : s.mc_phase === 'b_playing' ? (s.team_c_name ? 'c_playing' : 'done') : 'done'
          applyStateRef.current?.({ ...s, mc_phase: next, mc_timer_start: Date.now(), mc_q_index: 0, mc_revealed: false })
        }
      } else if ((s.av_phase === 'a_playing' || s.av_phase === 'b_playing') && s.av_timer_start) {
        const remaining = Math.max(0, MC_TIME_MS - (Date.now() - s.av_timer_start))
        setTimerMs(remaining)
        if (remaining === 0 && !autoEndedRFRef.current) {
          autoEndedRFRef.current = true
          const next: AVPhase = s.av_phase === 'a_playing' ? 'break' : 'done'
          applyStateRef.current?.({ ...s, av_phase: next })
        }
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
      statement: q.answer?.trim() ? q.answer : q.question,
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

  const openManagePool = (pool: QuestionPool, allQuestions: DBQuestion[]) => {
    setManagingPool(pool)
    setManagingPoolIds(new Set(pool.question_ids))
    setEditingQId(null)
    if (pool.type === 'rapid_fire' || pool.type === 'buzzer') {
      const existing = pool.question_ids
        .map(id => allQuestions.find(q => q.id === id))
        .filter(Boolean) as DBQuestion[]
      const rows: {id?: string; q: string; a: string}[] = existing.map(q => ({ id: q.id, q: q.question, a: q.answer ?? '' }))
      // Pad to at least 10 empty rows after existing
      while (rows.length < 10) rows.push({ q: '', a: '' })
      setBulkQs(rows)
    } else {
      setBulkQs(Array.from({ length: 10 }, () => ({ q: '', a: '' })))
    }
    setSprintTitle(''); setSprintStmt(''); setSprintSteps(['', '', '', '', ''])
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

  /** Save RF/BZ pool questions — updates existing rows, inserts new ones */
  const saveBulkQuestionsToPool = async () => {
    if (!managingPool) return
    setBulkSaving(true)

    const toUpdate = bulkQs.filter(r => r.id && r.q.trim())
    const toInsert = bulkQs.filter(r => !r.id && r.q.trim())

    // Update existing questions
    for (const r of toUpdate) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('fsc_questions')
        .update({ question: r.q.trim(), answer: r.a.trim() })
        .eq('id', r.id)
    }

    // Insert new questions
    let newIds: string[] = []
    if (toInsert.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('fsc_questions')
        .insert(toInsert.map(r => ({
          question: r.q.trim(), answer: r.a.trim(),
          category: 'General', type: 'regular', steps: null,
        })))
        .select('id')
      if (error) { alert('Error saving questions'); setBulkSaving(false); return }
      newIds = (data as { id: string }[]).map(d => d.id)
    }

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
    // Refresh grid: reload existing + keep empty rows
    const refreshed = updatedPool.question_ids
      .map(id => questions.find(q => q.id === id) ?? null)
      .filter(Boolean) as DBQuestion[]
    const rows: {id?: string; q: string; a: string}[] = refreshed.map(q => ({ id: q.id, q: q.question, a: q.answer ?? '' }))
    while (rows.length < 10) rows.push({ q: '', a: '' })
    setBulkQs(rows)
    setBulkSaving(false)
  }

  /** Insert a sprint problem into fsc_questions AND add to pool */
  const addSprintProblemToPool = async () => {
    if (!managingPool) return
    if (!sprintTitle.trim()) { alert('Please enter a problem title.'); return }
    if (!sprintStmt.trim()) { alert('Please enter the full problem statement.'); return }
    const filledSteps = sprintSteps.filter(s => s.trim())
    if (filledSteps.length < 2) { alert('Add at least 2 steps (up to 5).'); return }
    setSprintProbSaving(true)
    // Store title in `question`, full statement in `answer`, steps in `steps`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('fsc_questions')
      .insert({
        question: sprintTitle.trim(),
        answer: sprintStmt.trim(),
        category: 'Sprint', type: 'sprint', steps: filledSteps,
      })
      .select('id')
      .single()
    if (error) { alert(`Error saving problem: ${error.message}`); setSprintProbSaving(false); return }
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
    setSprintTitle(''); setSprintStmt(''); setSprintSteps(['', '', '', '', ''])
    setSprintProbSaving(false)
  }

  /** Delete a question from fsc_questions AND remove it from the pool */
  const deleteFromPoolAndDB = async (qId: string) => {
    if (!managingPool) return
    if (!confirm('Delete this question permanently?')) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('fsc_questions').delete().eq('id', qId)
    const updatedPool: QuestionPool = {
      ...managingPool,
      question_ids: managingPool.question_ids.filter(id => id !== qId),
    }
    const updatedPools = pools.map(p => p.id === managingPool.id ? updatedPool : p)
    setManagingPool(updatedPool)
    setManagingPoolIds(new Set(updatedPool.question_ids))
    setPools(updatedPools)
    await savePools(updatedPools)
    setBulkQs(prev => prev.filter(r => r.id !== qId))
    await loadQuestions()
  }

  const startEditQ = (q: DBQuestion) => {
    setEditingQId(q.id)
    setEditDraft({
      q: q.question,
      a: q.answer ?? '',
      steps: q.steps ? [...q.steps, ...Array(5).fill('')].slice(0, 5) : ['', '', '', '', ''],
    })
  }

  const saveEditQ = async (q: DBQuestion) => {
    if (!editDraft.q.trim()) return
    setEditSaving(true)
    const updates: Record<string, unknown> = { question: editDraft.q.trim() }
    if (q.type === 'sprint') {
      const filledSteps = editDraft.steps.filter(s => s.trim())
      if (filledSteps.length < 2) { alert('Add at least 2 steps'); setEditSaving(false); return }
      updates.answer = editDraft.a.trim()
      updates.steps = filledSteps
    } else {
      updates.answer = editDraft.a.trim()
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('fsc_questions').update(updates).eq('id', q.id)
    if (error) { alert('Save failed: ' + error.message); setEditSaving(false); return }
    await loadQuestions()
    setEditingQId(null)
    setEditSaving(false)
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
    if (!newMatchRFPool || !newMatchRFPoolB || !newMatchBZPool || !newMatchISPool || !newMatchISPool2) {
      alert('Please select pools for every slot (including both RF pools and both IS pools).'); return
    }
    if (newMatchRFPool === newMatchRFPoolB) {
      alert('Team A and Team B must have different RF pools.'); return
    }
    if (newMatchISPool === newMatchISPool2) {
      alert('Please select two different pools for Innovation Sprint Problem 1 and Problem 2.'); return
    }
    setMatchSaving(true)
    const newMatch: SavedMatch = {
      id: genId(), name: newMatchName.trim(),
      team_a_name: newMatchTeamA.trim(), team_b_name: newMatchTeamB.trim(),
      rf_pool_id: newMatchRFPool, rf_pool_id_b: newMatchRFPoolB,
      bz_pool_id: newMatchBZPool,
      is_pool_id: newMatchISPool, is_pool_id_2: newMatchISPool2,
      status: 'draft', created_at: new Date().toISOString(),
    }
    const updated = [...savedMatches, newMatch]
    setSavedMatches(updated)
    await saveSavedMatchesList(updated)
    setNewMatchName(''); setNewMatchTeamA(''); setNewMatchTeamB('')
    setNewMatchRFPool(''); setNewMatchRFPoolB(''); setNewMatchBZPool(''); setNewMatchISPool(''); setNewMatchISPool2('')
    setShowAddMatch(false); setMatchSaving(false)
  }

  const deleteSavedMatch = async (id: string) => {
    if (!confirm('Delete this match?')) return
    const updated = savedMatches.filter(m => m.id !== id)
    setSavedMatches(updated)
    await saveSavedMatchesList(updated)
  }

  const launchSavedMatch = async (match: SavedMatch) => {
    // 3-Team Final: launch Mystery Chain
    if (match.stage === '3team') {
      if (!launch3TFPackA || !launch3TFPackB || (match.team_c_name && !launch3TFPackC)) {
        alert('Please select a Mystery Pack for each team.'); return
      }
      const packA = mysteryPacks.find(p => p.id === launch3TFPackA)
      const packB = mysteryPacks.find(p => p.id === launch3TFPackB)
      const packC = mysteryPacks.find(p => p.id === launch3TFPackC)
      if (!packA || !packB) { alert('Pack not found.'); return }
      setMatchSaving(true)
      const toMZ = (p: MysteryPack) => p.puzzles.map(pz => ({ ...pz }))
      await applyState({
        ...makeDefaultState(match.team_a_name, match.team_b_name, match.team_c_name),
        round: 'mystery_chain',
        carried_score_a: match.carried_score_a ?? 0,
        carried_score_b: match.carried_score_b ?? 0,
        carried_score_c: match.carried_score_c ?? 0,
        mc_scenario_title: packA.scenario_title,
        mc_opening_story: packA.opening_story,
        mc_puzzles_a: toMZ(packA),
        mc_puzzles_b: toMZ(packB),
        mc_puzzles_c: packC ? toMZ(packC) : [],
        mc_phase: 'idle',
      })
      const updatedMatches = savedMatches.map(m =>
        m.id === match.id ? { ...m, status: 'live' as const } :
        m.status === 'live' ? { ...m, status: 'completed' as const } : m
      )
      setSavedMatches(updatedMatches); await saveSavedMatchesList(updatedMatches)
      setMatchSaving(false); setActiveTab('live'); return
    }

    // Grand Final: launch Audio Visual
    if (match.stage === 'grand_final') {
      if (!launchAVPoolA || !launchAVPoolB) { alert('Please select AV question pools for both teams.'); return }
      const poolA = pools.find(p => p.id === launchAVPoolA)
      const poolB = pools.find(p => p.id === launchAVPoolB)
      const toQ = (q: typeof regularQs[0]): FSCQuestion => ({ id: q.id, question: q.question, answer: q.answer ?? '', category: q.category })
      const avQsA = poolA ? questions.filter(q => poolA.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).sort(() => Math.random() - 0.5).slice(0, 10).map(toQ) : regularQs.sort(() => Math.random() - 0.5).slice(0, 10).map(toQ)
      const avQsB = poolB ? questions.filter(q => poolB.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).sort(() => Math.random() - 0.5).slice(0, 10).map(toQ) : regularQs.sort(() => Math.random() - 0.5).slice(0, 10).map(toQ)
      if (avQsA.length < 10 || avQsB.length < 10) { alert('Each AV pool needs at least 10 questions.'); return }
      setMatchSaving(true)
      await applyState({
        ...makeDefaultState(match.team_a_name, match.team_b_name),
        round: 'audio_visual',
        carried_score_a: match.carried_score_a ?? 0,
        carried_score_b: match.carried_score_b ?? 0,
        av_questions_a: avQsA,
        av_questions_b: avQsB,
        av_phase: 'idle',
      })
      const updatedMatches = savedMatches.map(m =>
        m.id === match.id ? { ...m, status: 'live' as const } :
        m.status === 'live' ? { ...m, status: 'completed' as const } : m
      )
      setSavedMatches(updatedMatches); await saveSavedMatchesList(updatedMatches)
      setMatchSaving(false); setActiveTab('live'); return
    }

    const rfPoolA = pools.find(p => p.id === match.rf_pool_id)
    const rfPoolB = pools.find(p => p.id === match.rf_pool_id_b)
    const bzPool  = pools.find(p => p.id === match.bz_pool_id)
    const isPool1 = pools.find(p => p.id === match.is_pool_id)
    const isPool2 = pools.find(p => p.id === match.is_pool_id_2)

    const rfPoolQsA = rfPoolA
      ? questions.filter(q => rfPoolA.question_ids.includes(q.id) && (!q.type || q.type === 'regular'))
      : regularQs
    const rfPoolQsB = rfPoolB
      ? questions.filter(q => rfPoolB.question_ids.includes(q.id) && (!q.type || q.type === 'regular'))
      : regularQs
    const bzPoolQs = bzPool
      ? questions.filter(q => bzPool.question_ids.includes(q.id) && (!q.type || q.type === 'regular'))
      : regularQs
    const isPoolQs = [
      ...(isPool1 ? questions.filter(q => isPool1.question_ids.includes(q.id) && q.type === 'sprint') : []),
      ...(isPool2 ? questions.filter(q => isPool2.question_ids.includes(q.id) && q.type === 'sprint') : []),
    ]

    if (rfPoolQsA.length < RF_Q_COUNT) {
      alert(`Team A RF pool needs at least ${RF_Q_COUNT} questions (has ${rfPoolQsA.length}).`); return
    }
    if (rfPoolQsB.length < RF_Q_COUNT) {
      alert(`Team B RF pool needs at least ${RF_Q_COUNT} questions (has ${rfPoolQsB.length}).`); return
    }
    if (bzPoolQs.length < BZ_Q_COUNT) {
      alert(`Buzzer pool needs at least ${BZ_Q_COUNT} questions (has ${bzPoolQs.length}).`); return
    }
    if (isPoolQs.length < IS_PROB_COUNT) {
      alert(`Select two IS pools with at least 1 problem each (have ${isPoolQs.length} total).`); return
    }

    setMatchSaving(true)
    const toQ = (q: typeof regularQs[0]): FSCQuestion => ({
      id: q.id, question: q.question, answer: q.answer ?? '', category: q.category,
    })
    // Play questions in pool order (not shuffled) so the quiz master's paper
    // master list matches what appears on screen. The 5 solution steps inside
    // each IS problem are STILL shuffled (that's the puzzle for the teams).
    const rfQsA: FSCQuestion[] = rfPoolQsA.slice(0, RF_Q_COUNT).map(toQ)
    const rfQsB: FSCQuestion[] = rfPoolQsB.slice(0, RF_Q_COUNT).map(toQ)
    const bzQs: FSCQuestion[]  = bzPoolQs.slice(0, BZ_Q_COUNT).map(toQ)
    const isProbs: ISProblem[] = isPoolQs.slice(0, IS_PROB_COUNT).map(q => ({
      id: q.id,
      statement: q.answer?.trim() ? q.answer : q.question,
      steps: q.steps ?? [],
      steps_shuffled: [...(q.steps ?? [])].sort(() => Math.random() - 0.5),
    }))

    buzzLockRef.current = false
    setIsAnswers(null); setIsGrades(null)
    await applyState({
      ...makeDefaultState(match.team_a_name, match.team_b_name),
      round: 'rapid_fire', rf_questions: rfQsA, rf_questions_b: rfQsB, bz_questions: bzQs, is_problems: isProbs,
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
  // idle → announce_a → a_playing → score_a → announce_b → b_playing → score_b → compare
  const announceRFTeamA = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, rf_phase: 'announce_a' })
  }
  const startRFTeamA = () => {
    const s = fscRef.current; if (!s) return
    autoEndedRFRef.current = false
    applyState({ ...s, rf_phase: 'a_playing', rf_q_index: 0, rf_timer_start: Date.now(), rf_correct_a: 0 })
  }
  const announceRFTeamB = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, rf_phase: 'announce_b' })
  }
  const startRFTeamB = () => {
    const s = fscRef.current; if (!s) return
    autoEndedRFRef.current = false
    applyState({ ...s, rf_phase: 'b_playing', rf_q_index: 0, rf_timer_start: Date.now(), rf_correct_b: 0 })
  }
  const showRFCompare = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, rf_phase: 'compare' })
  }
  const rfAction = (result: 'correct' | 'wrong' | 'skip') => {
    const s = fscRef.current; if (!s) return
    const isA = s.rf_phase === 'a_playing'
    const correct = result === 'correct'
    const newCorrectA = (isA && correct) ? s.rf_correct_a + 1 : s.rf_correct_a
    const newCorrectB = (!isA && correct) ? s.rf_correct_b + 1 : s.rf_correct_b
    // Use each team's own question list; wrong/skip → recycle to end
    const currentQs = isA ? [...s.rf_questions] : [...(s.rf_questions_b ?? [])]
    if (result !== 'correct') currentQs.push(currentQs[s.rf_q_index])
    const nextIdx = s.rf_q_index + 1
    const done = nextIdx >= currentQs.length
    // Cap score at RF_Q_COUNT × RF_CORRECT_PTS = 100 max
    const newState: FSCState = {
      ...s,
      rf_questions:   isA ? currentQs : s.rf_questions,
      rf_questions_b: isA ? s.rf_questions_b : currentQs,
      rf_correct_a: newCorrectA,
      rf_correct_b: newCorrectB,
      rf_q_index: nextIdx,
      rf_score_a: isA  ? Math.min(newCorrectA, RF_Q_COUNT) * RF_CORRECT_PTS : s.rf_score_a,
      rf_score_b: !isA ? Math.min(newCorrectB, RF_Q_COUNT) * RF_CORRECT_PTS : s.rf_score_b,
    }
    if (done) {
      applyState({ ...newState, rf_phase: isA ? 'score_a' : 'score_b' })
    } else {
      applyState(newState)
    }
  }
  const endRFEarly = () => {
    const s = fscRef.current; if (!s) return
    // Score is already current from live updates — just flip the phase
    const isA = s.rf_phase === 'a_playing'
    // Clear the grace window if the admin explicitly ends the turn.
    setRfGraceStart(null); setRfGraceMs(0); autoEndedRFRef.current = true
    applyState({ ...s, rf_phase: isA ? 'score_a' : 'score_b' })
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
      bz_score_a: team === 'a' ? s.bz_score_a + (s.bz_phase === 'second_chance' ? BZ_SECOND_CHANCE_PTS : BZ_CORRECT_PTS) : s.bz_score_a,
      bz_score_b: team === 'b' ? s.bz_score_b + (s.bz_phase === 'second_chance' ? BZ_SECOND_CHANCE_PTS : BZ_CORRECT_PTS) : s.bz_score_b,
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
  // Two-step start: admin marks 'ready' after the moderator finishes reading
  // the problem, then clicks 'Start Timer' when teams are set.
  const markISReady = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, is_phase: 'ready' })
  }
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
    // Overwrite the current problem index in the per-problem arrays so grading
    // twice on the same problem doesn't double-record.
    const problemScoresA = [...(s.is_problem_scores_a ?? [])]
    const problemScoresB = [...(s.is_problem_scores_b ?? [])]
    problemScoresA[s.is_problem_index] = gradeA
    problemScoresB[s.is_problem_index] = gradeB
    // New order: reveal students' answers FIRST, then the correct solution.
    await applyState({
      ...s,
      is_phase: 'revealed',
      is_score_a: s.is_score_a + gradeA,
      is_score_b: s.is_score_b + gradeB,
      is_problem_scores_a: problemScoresA,
      is_problem_scores_b: problemScoresB,
      is_team_a_answer: isAnswers.a,
      is_team_b_answer: isAnswers.b,
      is_step_results_a: stepResultsA,
      is_step_results_b: stepResultsB,
    })
  }
  const showTeamResults = () => {
    // Called from the 'revealed' screen — flip to the correct-solution reveal.
    const s = fscRef.current; if (!s) return
    applyState({ ...s, is_phase: 'solution' })
  }
  const nextISProblem = () => {
    const s = fscRef.current; if (!s) return
    const next = s.is_problem_index + 1
    setIsAnswers(null); setIsGrades(null)
    // After the last problem, go to the dedicated side-by-side comparison
    // screen. After that, admin advances to done.
    if (next >= IS_PROB_COUNT) applyState({ ...s, is_phase: 'compare', is_step_results_a: null, is_step_results_b: null })
    else applyState({ ...s, is_phase: 'idle', is_problem_index: next, is_step_results_a: null, is_step_results_b: null })
  }
  const showISDone = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, is_phase: 'done' })
  }
  const finishMatch = async () => {
    if (!confirm('Finish the match and show final scores?')) return
    const s = fscRef.current; if (!s) return
    applyState({ ...s, round: 'finished' })
    const totalA = s.rf_score_a + s.bz_score_a + s.is_score_a
    const totalB = s.rf_score_b + s.bz_score_b + s.is_score_b
    const winner = totalA > totalB ? s.team_a_name : totalB > totalA ? s.team_b_name : 'Draw'
    const loser  = winner === s.team_a_name ? s.team_b_name : s.team_a_name
    const loserScore = winner === s.team_a_name ? totalB : totalA

    let matches = savedMatches.map(m =>
      m.status === 'live' ? {
        ...m,
        status: 'completed' as const,
        final_score_a: totalA, final_score_b: totalB,
        rf_score_a: s.rf_score_a, rf_score_b: s.rf_score_b,
        bz_score_a: s.bz_score_a, bz_score_b: s.bz_score_b,
        is_score_a: s.is_score_a, is_score_b: s.is_score_b,
        winner,
      } : m
    )

    // Auto-propagate winner to next bracket match
    const liveMatch = savedMatches.find(m => m.status === 'live')
    if (liveMatch?.feeds_into && liveMatch?.feeds_into_slot) {
      const { feeds_into, feeds_into_slot } = liveMatch
      matches = matches.map(m => {
        if (m.match_code !== feeds_into) return m
        if (feeds_into_slot === 'a') return { ...m, team_a_name: winner }
        if (feeds_into_slot === 'b') return { ...m, team_b_name: winner }
        return m
      })

      // For SF matches: also check if both SFs done to determine Best Loser for 3TF
      if (liveMatch.stage === 'sf') {
        const otherSF = matches.find(m => m.stage === 'sf' && m.match_code !== liveMatch.match_code && m.status === 'completed')
        if (otherSF) {
          const otherLoser = otherSF.winner === otherSF.team_a_name ? otherSF.team_b_name : otherSF.team_a_name
          const otherLoserScore = otherSF.winner === otherSF.team_a_name ? (otherSF.final_score_b ?? 0) : (otherSF.final_score_a ?? 0)
          const bestLoser = loserScore >= otherLoserScore ? loser : otherLoser
          // Carry SF winner scores into 3TF
          const sf1 = liveMatch.match_code === 'SF1' ? { ...liveMatch, final_score_a: totalA, final_score_b: totalB, winner } : otherSF
          const sf2 = liveMatch.match_code === 'SF2' ? { ...liveMatch, final_score_a: totalA, final_score_b: totalB, winner } : otherSF
          const sf1WinnerScore = sf1.winner === sf1.team_a_name ? (sf1.final_score_a ?? 0) : (sf1.final_score_b ?? 0)
          const sf2WinnerScore = sf2.winner === sf2.team_a_name ? (sf2.final_score_a ?? 0) : (sf2.final_score_b ?? 0)
          matches = matches.map(m => m.match_code === '3TF'
            ? { ...m, team_c_name: bestLoser, carried_score_a: sf1WinnerScore, carried_score_b: sf2WinnerScore, carried_score_c: Math.max(loserScore, otherLoserScore) }
            : m
          )
        }
      }

      // For 3TF: carry top-2 scores into GF
      if (liveMatch.stage === '3team') {
        const mc_a = liveMatch.mc_score_a ?? 0
        const mc_b = liveMatch.mc_score_b ?? 0
        const mc_c = liveMatch.mc_score_c ?? 0
        const totA = (liveMatch.carried_score_a ?? 0) + mc_a
        const totB = (liveMatch.carried_score_b ?? 0) + mc_b
        const totC = (liveMatch.carried_score_c ?? 0) + mc_c
        const sorted = [
          { name: s.team_a_name, total: totA },
          { name: s.team_b_name, total: totB },
          { name: liveMatch.team_c_name ?? 'TBD', total: totC },
        ].sort((a, b) => b.total - a.total)
        matches = matches.map(m => m.match_code === 'GF'
          ? { ...m, team_a_name: sorted[0].name, team_b_name: sorted[1].name, carried_score_a: sorted[0].total, carried_score_b: sorted[1].total }
          : m
        )
      }
    }

    setSavedMatches(matches)
    await saveSavedMatchesList(matches)
  }
  const endMatchEarly = async () => {
    if (!confirm('End the match?')) return
    const s = fscRef.current; if (!s) return
    applyState({ ...s, round: 'idle' })
  }

  // ── Mystery Chain actions ──────────────────────────────────────────────────
  const mcAction = (result: 'correct' | 'wrong' | 'skip') => {
    const s = fscRef.current; if (!s) return
    const isA = s.mc_phase === 'a_playing'
    const isB = s.mc_phase === 'b_playing'
    const isC = s.mc_phase === 'c_playing'
    const correct = result === 'correct'
    const puzzles = isA ? [...s.mc_puzzles_a] : isB ? [...s.mc_puzzles_b] : [...s.mc_puzzles_c]
    if (result !== 'correct') puzzles.push(puzzles[s.mc_q_index]) // recycle
    const nextIdx = s.mc_q_index + 1
    const newCorrectA = (isA && correct) ? s.mc_correct_a + 1 : s.mc_correct_a
    const newCorrectB = (isB && correct) ? s.mc_correct_b + 1 : s.mc_correct_b
    const newCorrectC = (isC && correct) ? s.mc_correct_c + 1 : s.mc_correct_c
    applyState({
      ...s,
      mc_puzzles_a: isA ? puzzles : s.mc_puzzles_a,
      mc_puzzles_b: isB ? puzzles : s.mc_puzzles_b,
      mc_puzzles_c: isC ? puzzles : s.mc_puzzles_c,
      mc_q_index: nextIdx,
      mc_correct_a: newCorrectA,
      mc_correct_b: newCorrectB,
      mc_correct_c: newCorrectC,
      mc_score_a: Math.min(newCorrectA, MC_PUZZLE_COUNT) * MC_CORRECT_PTS,
      mc_score_b: Math.min(newCorrectB, MC_PUZZLE_COUNT) * MC_CORRECT_PTS,
      mc_score_c: Math.min(newCorrectC, MC_PUZZLE_COUNT) * MC_CORRECT_PTS,
      mc_revealed: false,
    })
  }

  const mcReveal = () => {
    const s = fscRef.current; if (!s) return
    applyState({ ...s, mc_revealed: true })
  }

  const mcNextTeam = () => {
    const s = fscRef.current; if (!s) return
    const next: MCPhase = s.mc_phase === 'a_playing' ? 'b_playing' : s.mc_phase === 'b_playing' ? (s.team_c_name ? 'c_playing' : 'done') : 'done'
    autoEndedRFRef.current = false
    applyState({ ...s, mc_phase: next, mc_q_index: 0, mc_timer_start: Date.now(), mc_revealed: false })
  }

  // ── Audio Visual actions ───────────────────────────────────────────────────
  const avAction = (result: 'correct' | 'wrong' | 'skip') => {
    const s = fscRef.current; if (!s) return
    const isA = s.av_phase === 'a_playing'
    const correct = result === 'correct'
    const questions = isA ? [...s.av_questions_a] : [...s.av_questions_b]
    if (result !== 'correct') questions.push(questions[s.av_q_index])
    const nextIdx = s.av_q_index + 1
    const newCorrectA = (isA && correct) ? s.av_correct_a + 1 : s.av_correct_a
    const newCorrectB = (!isA && correct) ? s.av_correct_b + 1 : s.av_correct_b
    applyState({
      ...s,
      av_questions_a: isA ? questions : s.av_questions_a,
      av_questions_b: isA ? s.av_questions_b : questions,
      av_q_index: nextIdx,
      av_correct_a: newCorrectA,
      av_correct_b: newCorrectB,
      av_score_a: Math.min(newCorrectA, 10) * RF_CORRECT_PTS,
      av_score_b: Math.min(newCorrectB, 10) * RF_CORRECT_PTS,
    })
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

  // Pick the correct team's question list for display
  const currentRFQ = s
    ? (s.rf_phase === 'b_playing'
        ? (s.rf_questions_b ?? s.rf_questions)?.[s.rf_q_index ?? 0]
        : s.rf_questions?.[s.rf_q_index ?? 0]) ?? null
    : null
  const currentBZQ = s?.bz_questions?.[s?.bz_q_index ?? 0] ?? null
  const currentISP = s?.is_problems?.[s?.is_problem_index ?? 0] ?? null

  const timerSecs = Math.ceil(timerMs / 1000)
  const timerWarn = timerSecs <= 10 && timerSecs > 0

  const TABS = [
    { key: 'schools'   as Tab, label: 'Schools',       Icon: Trophy     },
    { key: 'bracket'   as Tab, label: 'Bracket',       Icon: ArrowRight },
    { key: 'mystery'   as Tab, label: 'Mystery Packs', Icon: Lightbulb  },
    { key: 'teams'     as Tab, label: 'Teams',         Icon: Users      },
    { key: 'questions' as Tab, label: 'Questions',     Icon: HelpCircle },
    { key: 'pools'     as Tab, label: 'Question Banks',Icon: Layers     },
    { key: 'matches'   as Tab, label: 'Matches',       Icon: Rocket     },
    { key: 'live'      as Tab, label: 'Live Control',  Icon: Radio      },
    { key: 'grand-final' as Tab, label: 'Grand Final',   Icon: Sparkles   },
    { key: 'tie-breaker' as Tab, label: 'Tie Breaker',   Icon: Bell       },
    { key: 'simulator' as Tab, label: 'Emergency',     Icon: Zap        },
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

        {/* ════════════════ SCHOOLS ════════════════ */}
        {activeTab === 'schools' && <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-white text-sm">Schools ({schools.length}/16)</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Add all 16 participating schools to their bracket slots</p>
            </div>
          </div>

          {schoolsLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div> : (
            <div className="space-y-2">
              {Array.from({ length: 16 }, (_, i) => i + 1).map(slot => {
                const school = schools.find(s => s.slot === slot)
                const isEditing = editingSlot === slot
                return (
                  <div key={slot} className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                    {isEditing ? (
                      <div className="space-y-2">
                        <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-widest">Slot {slot}</p>
                        <input
                          placeholder="Full school name *"
                          value={editSlotName}
                          onChange={e => setEditSlotName(e.target.value)}
                          className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                        />
                        <input
                          placeholder="Nickname / short name (optional)"
                          value={editSlotNick}
                          onChange={e => setEditSlotNick(e.target.value)}
                          className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                        />
                        <div className="flex gap-2">
                          <button
                            disabled={!editSlotName.trim()}
                            onClick={async () => {
                              const updated = schools.filter(s => s.slot !== slot)
                              updated.push({ id: `slot_${slot}`, name: editSlotName.trim(), nickname: editSlotNick.trim() || undefined, slot })
                              updated.sort((a, b) => a.slot - b.slot)
                              setSchools(updated)
                              await saveSchools(updated)
                              setEditingSlot(null)
                            }}
                            className="flex-1 py-2 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                            Save
                          </button>
                          <button onClick={() => setEditingSlot(null)} className="px-4 py-2 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f5a623]/20 border border-[#f5a623]/30 flex items-center justify-center text-[#f5a623] font-black text-xs shrink-0">{slot}</div>
                        <div className="flex-1 min-w-0">
                          {school ? (
                            <>
                              <p className="font-bold text-white text-sm truncate">{school.name}</p>
                              {school.nickname && <p className="text-[11px] text-slate-400">aka &quot;{school.nickname}&quot;</p>}
                            </>
                          ) : (
                            <p className="text-slate-500 text-sm italic">Empty — click Edit to add</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditingSlot(slot); setEditSlotName(school?.name ?? ''); setEditSlotNick(school?.nickname ?? '') }}
                            className="p-1.5 text-slate-400 hover:text-[#f5a623] transition-colors">
                            <Pencil size={13} />
                          </button>
                          {school && (
                            <button
                              onClick={async () => {
                                const updated = schools.filter(s => s.slot !== slot)
                                setSchools(updated)
                                await saveSchools(updated)
                              }}
                              className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>}

        {/* ════════════════ BRACKET ════════════════ */}
        {activeTab === 'bracket' && <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-white text-sm">Tournament Bracket</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{savedMatches.filter(m => m.match_code).length} / 16 bracket matches</p>
            </div>
            <button
              disabled={schools.length < 16 || bracketGenerating}
              onClick={async () => {
                if (!confirm('Generate bracket? This will replace any existing bracket matches.')) return
                setBracketGenerating(true)
                const bracketMatches = generateBracketMatches(schools)
                const nonBracket = savedMatches.filter(m => !m.match_code)
                const all = [...nonBracket, ...bracketMatches]
                setSavedMatches(all)
                await saveSavedMatchesList(all)
                setBracketGenerating(false)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors disabled:opacity-40">
              {bracketGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {schools.length < 16 ? `Add ${16 - schools.length} more schools` : 'Generate Bracket'}
            </button>
          </div>

          {[
            { stage: 'r16',   label: 'Round of 16',        codes: ['M1','M2','M3','M4','M5','M6','M7','M8'] },
            { stage: 'qf',    label: 'Quarter Finals',      codes: ['QF1','QF2','QF3','QF4'] },
            { stage: 'sf',    label: 'Semi Finals',         codes: ['SF1','SF2'] },
            { stage: '3team', label: '3-Team Final',        codes: ['3TF'] },
            { stage: 'final', label: 'Grand Final',         codes: ['GF'] },
          ].map(({ stage, label, codes }) => {
            const stageMatches = codes.map(code => savedMatches.find(m => m.match_code === code)).filter(Boolean) as SavedMatch[]
            if (stageMatches.length === 0) return null
            return (
              <div key={stage} className="space-y-2">
                <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-widest">{label}</p>
                {stageMatches.map(match => {
                  const statusColor = match.status === 'completed' ? 'border-green-500/40 bg-green-500/5' : match.status === 'live' ? 'border-[#f5a623]/40 bg-[#f5a623]/5' : 'border-white/10'
                  const isTBD = match.team_a_name === 'TBD' || match.team_b_name === 'TBD'
                  return (
                    <div key={match.id} className={`bg-[#0a1628] border rounded-2xl p-4 ${statusColor}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold">{match.match_code}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${match.status === 'completed' ? 'bg-green-500/20 text-green-400' : match.status === 'live' ? 'bg-[#f5a623]/20 text-[#f5a623]' : 'bg-white/5 text-slate-500'}`}>
                              {match.status === 'completed' ? '✓ Done' : match.status === 'live' ? '● Live' : 'Draft'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-white mt-1">
                            {match.team_a_name} <span className="text-slate-500 font-normal">vs</span> {match.team_b_name}
                            {match.team_c_name && <span className="text-slate-500 font-normal"> vs {match.team_c_name}</span>}
                          </p>
                          {match.status === 'completed' && match.winner && (
                            <p className="text-[11px] text-[#f5a623] mt-0.5">🏆 {match.winner} — {match.final_score_a} vs {match.final_score_b}</p>
                          )}
                          {isTBD && match.status === 'draft' && (
                            <p className="text-[10px] text-slate-600 mt-0.5 italic">Waiting for previous round results</p>
                          )}
                        </div>
                        {!isTBD && match.status !== 'live' && match.status !== 'completed' && (
                          <button
                            onClick={async () => {
                              const updated = savedMatches.map(m => m.id === match.id ? { ...m, status: 'live' as const } : m.status === 'live' ? { ...m, status: 'draft' as const } : m)
                              setSavedMatches(updated)
                              await saveSavedMatchesList(updated)
                              setLaunchTeamA(match.team_a_name)
                              setLaunchTeamB(match.team_b_name)
                              setActiveTab('live')
                            }}
                            className="px-3 py-1.5 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors whitespace-nowrap">
                            ▶ Play
                          </button>
                        )}
                        {match.status === 'live' && (
                          <button onClick={() => setActiveTab('live')} className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-black hover:bg-green-500 transition-colors whitespace-nowrap">
                            ● Control
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {savedMatches.filter(m => m.match_code).length === 0 && (
            <div className="text-center py-12 text-slate-600">
              <Trophy size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No bracket yet.</p>
              <p className="text-xs mt-1">Add all 16 schools then click Generate Bracket.</p>
            </div>
          )}
        </>}

        {/* ════════════════ MYSTERY PACKS ════════════════ */}
        {activeTab === 'mystery' && <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-white text-sm">Mystery Packs ({mysteryPacks.length})</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Create scenarios for the 3-Team Final Mystery Chain round</p>
            </div>
            <button onClick={() => { setShowAddPack(true); setEditingPack(null); setPackTitle(''); setPackScenario(''); setPackStory(''); setPackFinalMsg(''); setPackPuzzles(Array.from({ length: 10 }, () => ({ clue: '', scrambled: '', answer: '', story: '', image_url: '' }))) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#f5a623] text-[#0a1628] rounded-xl text-xs font-black hover:bg-[#e0941a] transition-colors">
              <Plus size={12} /> New Pack
            </button>
          </div>

          {(showAddPack || editingPack) && (
            <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-[#f5a623]">{editingPack ? 'Edit Pack' : 'New Mystery Pack'}</p>
              <input placeholder="Pack name (e.g. Pack A)" value={packTitle} onChange={e => setPackTitle(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <input placeholder="Scenario title (e.g. THE SILENT WARNING)" value={packScenario} onChange={e => setPackScenario(e.target.value)}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
              <textarea placeholder="Opening story (read before puzzles start)..." value={packStory} onChange={e => setPackStory(e.target.value)} rows={3}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />
              <textarea placeholder="Final message (shown after all 10 puzzles)..." value={packFinalMsg} onChange={e => setPackFinalMsg(e.target.value)} rows={2}
                className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />

              <p className="text-[11px] text-slate-400 font-semibold pt-1">10 Puzzles</p>
              {packPuzzles.map((pz, i) => (
                <div key={i} className="bg-[#060f1f] border border-white/10 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] text-[#f5a623] font-bold">Puzzle {i + 1}</p>
                  <input placeholder="Clue" value={pz.clue} onChange={e => { const p = [...packPuzzles]; p[i] = { ...p[i], clue: e.target.value }; setPackPuzzles(p) }}
                    className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623]" />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Scrambled word" value={pz.scrambled} onChange={e => { const p = [...packPuzzles]; p[i] = { ...p[i], scrambled: e.target.value.toUpperCase() }; setPackPuzzles(p) }}
                      className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623] uppercase" />
                    <input placeholder="Answer" value={pz.answer} onChange={e => { const p = [...packPuzzles]; p[i] = { ...p[i], answer: e.target.value.toUpperCase() }; setPackPuzzles(p) }}
                      className="bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623] uppercase" />
                  </div>
                  <input placeholder="Story line (revealed after answer)" value={pz.story} onChange={e => { const p = [...packPuzzles]; p[i] = { ...p[i], story: e.target.value }; setPackPuzzles(p) }}
                    className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623]" />
                  <input placeholder="Image URL (optional)" value={pz.image_url ?? ''} onChange={e => { const p = [...packPuzzles]; p[i] = { ...p[i], image_url: e.target.value }; setPackPuzzles(p) }}
                    className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623]" />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button disabled={packSaving || !packTitle.trim() || !packScenario.trim()} onClick={async () => {
                  setPackSaving(true)
                  const pack: MysteryPack = {
                    id: editingPack?.id ?? `pack_${Date.now()}`,
                    name: packTitle.trim(),
                    scenario_title: packScenario.trim(),
                    opening_story: packStory.trim(),
                    final_message: packFinalMsg.trim(),
                    puzzles: packPuzzles.filter(p => p.clue || p.answer).map((p, i) => ({ ...p, id: `pz_${i}` })),
                    created_at: editingPack?.created_at ?? new Date().toISOString(),
                  }
                  const updated = editingPack ? mysteryPacks.map(p => p.id === editingPack.id ? pack : p) : [...mysteryPacks, pack]
                  setMysteryPacks(updated); await saveMysteryPacks(updated)
                  setPackSaving(false); setShowAddPack(false); setEditingPack(null)
                }} className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                  {packSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Pack'}
                </button>
                <button onClick={() => { setShowAddPack(false); setEditingPack(null) }} className="px-4 py-2.5 bg-white/10 text-white rounded-xl text-sm hover:bg-white/20 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {mysteryPacksLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-500" /></div>
            : mysteryPacks.length === 0 ? <p className="text-center text-slate-600 text-sm py-10">No mystery packs yet</p>
            : mysteryPacks.map(pack => (
              <div key={pack.id} className="bg-[#0a1628] border border-white/10 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-black text-white text-sm">{pack.name}</p>
                    <p className="text-[11px] text-[#f5a623] mt-0.5">{pack.scenario_title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{pack.puzzles.length} puzzles</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingPack(pack); setShowAddPack(false); setPackTitle(pack.name); setPackScenario(pack.scenario_title); setPackStory(pack.opening_story); setPackFinalMsg(pack.final_message); setPackPuzzles(pack.puzzles.map(p => ({ clue: p.clue, scrambled: p.scrambled, answer: p.answer, story: p.story, image_url: p.image_url }))); }}
                      className="p-1.5 text-slate-400 hover:text-[#f5a623] transition-colors"><Pencil size={13} /></button>
                    <button onClick={async () => { const updated = mysteryPacks.filter(p => p.id !== pack.id); setMysteryPacks(updated); await saveMysteryPacks(updated) }}
                      className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))
          }
        </>}

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
                  <p className="text-xs font-bold text-[#f5a623]">Questions ({managingPool.question_ids.length} saved)</p>
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
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
                  {bulkQs.map((row, i) => (
                    <div key={row.id ?? `new-${i}`} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: 'auto 1fr 0.6fr auto' }}>
                      <span className="text-[10px] text-slate-600 font-bold w-5 text-center shrink-0">{i + 1}</span>
                      <input value={row.q} onChange={e => setBulkQs(prev => prev.map((r, j) => j === i ? { ...r, q: e.target.value } : r))}
                        placeholder={`Q${i + 1}`}
                        className={`border rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none w-full ${
                          row.id ? 'bg-[#060f1f] border-[#f5a623]/20 focus:border-[#f5a623]' : 'bg-[#060f1f] border-white/20 focus:border-[#f5a623]'
                        }`} />
                      <input value={row.a} onChange={e => setBulkQs(prev => prev.map((r, j) => j === i ? { ...r, a: e.target.value } : r))}
                        placeholder="Answer"
                        className="bg-[#060f1f] border border-white/20 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#f5a623] w-full" />
                      {row.id
                        ? <button onClick={() => deleteFromPoolAndDB(row.id!)}
                            className="p-1.5 text-slate-700 hover:text-red-400 transition-colors shrink-0" title="Delete question">
                            <Trash2 size={12} />
                          </button>
                        : <button onClick={() => setBulkQs(prev => prev.filter((_, j) => j !== i))}
                            className="p-1.5 text-slate-700 hover:text-red-400 transition-colors shrink-0" title="Remove row">
                            <X size={12} />
                          </button>
                      }
                    </div>
                  ))}
                </div>
                <button onClick={saveBulkQuestionsToPool}
                  disabled={bulkSaving || bulkQs.filter(r => r.q.trim()).length === 0}
                  className="w-full py-2.5 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors mt-1">
                  {bulkSaving
                    ? <Loader2 size={14} className="animate-spin mx-auto" />
                    : 'Save All Changes'}
                </button>
              </div>
            )}

            {/* ── Sprint: inline problem entry ── */}
            {managingPool.type === 'sprint' && (
              <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-[#f5a623]">Add Sprint Problem</p>

                {/* Title */}
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold block mb-1">Title *</label>
                  <input value={sprintTitle} onChange={e => setSprintTitle(e.target.value)}
                    placeholder="Short title (e.g. School Safety Challenge)"
                    className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                </div>

                {/* Full problem statement */}
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold block mb-1">Full Problem Statement *</label>
                  <textarea value={sprintStmt} onChange={e => setSprintStmt(e.target.value)}
                    placeholder="Write the full problem description that teams will read…" rows={4}
                    className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />
                </div>

                {/* Steps */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-400 font-semibold">Steps in correct order (min 2, max 5):</p>
                  {sprintSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-slate-600 w-4 shrink-0">{i + 1}.</span>
                      <input value={step} onChange={e => setSprintSteps(prev => prev.map((s, j) => j === i ? e.target.value : s))}
                        placeholder={`Step ${i + 1}${i < 2 ? ' *' : ' (optional)'}`}
                        className="flex-1 bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]" />
                    </div>
                  ))}
                  {sprintSteps.filter(s => s.trim()).length < 2 && (
                    <p className="text-[10px] text-slate-600 italic">Add at least 2 steps to enable the button</p>
                  )}
                </div>

                <button onClick={addSprintProblemToPool}
                  disabled={sprintProbSaving || !sprintTitle.trim() || !sprintStmt.trim() || sprintSteps.filter(s => s.trim()).length < 2}
                  className="w-full py-2.5 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors">
                  {sprintProbSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Add Problem to Pool'}
                </button>
              </div>
            )}

            {/* Sprint problems list — kept separate with inline edit for sprint pools */}
            {managingPool.type === 'sprint' && managingPool.question_ids.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Problems in this pool ({managingPool.question_ids.length})
                </p>
                {questions
                  .filter(q => managingPool.question_ids.includes(q.id))
                  .map((q, idx) => {
                    const isEditing = editingQId === q.id
                    return (
                      <div key={q.id} className="bg-[#0a1628] border border-white/10 rounded-xl px-3 py-2.5">
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea value={editDraft.q} onChange={e => setEditDraft(d => ({ ...d, q: e.target.value }))}
                              rows={2} placeholder="Title *"
                              className="w-full bg-[#060f1f] border border-[#f5a623]/40 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />
                            <textarea value={editDraft.a} onChange={e => setEditDraft(d => ({ ...d, a: e.target.value }))}
                              rows={3} placeholder="Full problem statement *"
                              className="w-full bg-[#060f1f] border border-white/20 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none" />
                            <div className="space-y-1">
                              <p className="text-[10px] text-slate-400 font-semibold">Steps in correct order:</p>
                              {editDraft.steps.map((step, si) => (
                                <div key={si} className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-600 w-4 shrink-0">{si + 1}.</span>
                                  <input value={step}
                                    onChange={e => setEditDraft(d => ({ ...d, steps: d.steps.map((s, j) => j === si ? e.target.value : s) }))}
                                    placeholder={`Step ${si + 1}${si < 2 ? ' *' : ' (optional)'}`}
                                    className="flex-1 bg-[#060f1f] border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5a623]" />
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => saveEditQ(q)} disabled={editSaving || !editDraft.q.trim()}
                                className="flex items-center gap-1 px-3 py-1.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg text-xs hover:bg-[#e0941a] disabled:opacity-40 transition-colors">
                                {editSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                              </button>
                              <button onClick={() => setEditingQId(null)}
                                className="px-3 py-1.5 bg-white/10 text-slate-300 rounded-lg text-xs hover:bg-white/20 transition-colors">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] text-slate-600 font-bold mt-0.5 shrink-0 w-5 text-center">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white leading-snug">{q.question}</p>
                              {q.answer && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{q.answer}</p>}
                              {q.steps && q.steps.length > 0 && <p className="text-[10px] text-purple-400/60 mt-0.5">{q.steps.length} steps</p>}
                            </div>
                            <button onClick={() => startEditQ(q)} className="p-1 text-slate-600 hover:text-[#f5a623] transition-colors shrink-0 mt-0.5"><Pencil size={12} /></button>
                            <button onClick={() => removeFromPool(q.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}

            {managingPool.type === 'sprint' && managingPool.question_ids.length === 0 && (
              <p className="text-center text-slate-600 text-sm py-6">No problems yet — use the form above to add sprint problems</p>
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
                                  <button onClick={() => openManagePool(pool, questions)}
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
                {(['a', 'b'] as const).map(side => {
                  const val = side === 'a' ? newMatchTeamA : newMatchTeamB
                  const other = side === 'a' ? newMatchTeamB : newMatchTeamA
                  const setter = side === 'a' ? setNewMatchTeamA : setNewMatchTeamB
                  return (
                    <div key={side} className="relative">
                      <select value={val} onChange={e => setter(e.target.value)}
                        className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] appearance-none">
                        <option value="">— Team {side.toUpperCase()} —</option>
                        {teams
                          .filter(t => t.name !== other)
                          .map(t => (
                            <option key={t.id} value={t.name}>{t.name}{t.school ? ` (${t.school})` : ''}</option>
                          ))
                        }
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  )
                })}
              </div>
              <label className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/30 px-2.5 py-1.5 cursor-pointer select-none w-fit">
                <input type="checkbox" checked={showDemo} onChange={e => setShowDemo(e.target.checked)}
                  className="w-3.5 h-3.5 accent-purple-500" />
                <span className="text-[10px] text-purple-200 font-bold uppercase tracking-widest">🔧 Show demo pools</span>
              </label>
              {([
                ['⚡ RF Pool — Team A',        newMatchRFPool,   setNewMatchRFPool,   'rapid_fire', newMatchRFPoolB],
                ['⚡ RF Pool — Team B',        newMatchRFPoolB,  setNewMatchRFPoolB,  'rapid_fire', newMatchRFPool],
                ['🔔 Buzzer Pool',             newMatchBZPool,   setNewMatchBZPool,   'buzzer',     null],
                ['💡 Sprint Pool — Problem 1', newMatchISPool,   setNewMatchISPool,   'sprint',     newMatchISPool2],
                ['💡 Sprint Pool — Problem 2', newMatchISPool2,  setNewMatchISPool2,  'sprint',     newMatchISPool],
              ] as [string, string, (v: string) => void, PoolType, string | null][]).map(([label, val, setter, type, exclude]) => (
                <div key={label}>
                  <label className="text-xs text-slate-400 block mb-1">{label}</label>
                  <div className="relative">
                    <select value={val} onChange={e => setter(e.target.value)}
                      className="w-full bg-[#060f1f] border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623] appearance-none">
                      <option value="">— Select Pool —</option>
                      {(() => {
                        const usedPoolIds = new Set(savedMatches.flatMap(m => [m.rf_pool_id, m.rf_pool_id_b, m.bz_pool_id, m.is_pool_id, m.is_pool_id_2].filter(Boolean)))
                        return pools.filter(p => p.type === type && p.id !== (exclude ?? '') && (showDemo || !isDemo(p.name))).map(p => {
                          const used = usedPoolIds.has(p.id)
                          return (
                            <option key={p.id} value={p.id} disabled={used}>
                              {used ? '✗ ' : ''}{p.name} ({p.question_ids.length} {type === 'sprint' ? 'problem' : 'question'}{p.question_ids.length !== 1 ? 's' : ''}){used ? ' — already used' : ''}
                            </option>
                          )
                        })
                      })()}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={createSavedMatch}
                  disabled={matchSaving || !newMatchName.trim() || !newMatchTeamA.trim() || !newMatchTeamB.trim() || !newMatchRFPool || !newMatchRFPoolB || !newMatchBZPool || !newMatchISPool || !newMatchISPool2}
                  className="flex-1 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-sm disabled:opacity-40 hover:bg-[#e0941a] transition-colors">
                  {matchSaving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Match'}
                </button>
                <button onClick={() => { setShowAddMatch(false); setNewMatchName(''); setNewMatchTeamA(''); setNewMatchTeamB(''); setNewMatchRFPool(''); setNewMatchRFPoolB(''); setNewMatchBZPool(''); setNewMatchISPool(''); setNewMatchISPool2('') }}
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
              const rfPoolA = pools.find(p => p.id === match.rf_pool_id)
              const rfPoolB = pools.find(p => p.id === match.rf_pool_id_b)
              const bzPool  = pools.find(p => p.id === match.bz_pool_id)
              const isPool1 = pools.find(p => p.id === match.is_pool_id)
              const isPool2 = pools.find(p => p.id === match.is_pool_id_2)
              const rfACount = rfPoolA ? questions.filter(q => rfPoolA.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).length : 0
              const rfBCount = rfPoolB ? questions.filter(q => rfPoolB.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).length : 0
              const bzQCount = bzPool ? questions.filter(q => bzPool.question_ids.includes(q.id) && (!q.type || q.type === 'regular')).length : 0
              const isQCount = (isPool1 ? questions.filter(q => isPool1.question_ids.includes(q.id) && q.type === 'sprint').length : 0)
                             + (isPool2 ? questions.filter(q => isPool2.question_ids.includes(q.id) && q.type === 'sprint').length : 0)
              const is3TF = match.stage === '3team'
              const isGF  = match.stage === 'grand_final'
              const canLaunch = is3TF
                ? (!!launch3TFPackA && !!launch3TFPackB && (!match.team_c_name || !!launch3TFPackC))
                : isGF
                ? (!!launchAVPoolA && !!launchAVPoolB)
                : !!match.rf_pool_id && !!match.rf_pool_id_b && !!match.bz_pool_id && !!match.is_pool_id && !!match.is_pool_id_2
                  && rfACount >= RF_Q_COUNT && rfBCount >= RF_Q_COUNT && bzQCount >= BZ_Q_COUNT && isQCount >= IS_PROB_COUNT
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
                      {match.status === 'completed' && match.final_score_a !== undefined && (
                        <div className="mt-1.5 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-green-400">{match.team_a_name}: {match.final_score_a}</span>
                            <span className="text-slate-600 text-xs">—</span>
                            <span className="text-xs font-black text-purple-400">{match.team_b_name}: {match.final_score_b}</span>
                            {match.winner && <span className="text-[10px] bg-[#f5a623]/15 text-[#f5a623] px-2 py-0.5 rounded-full font-bold">🏆 {match.winner}</span>}
                          </div>
                          {/* Per-round breakdown (RF · BZ · IS) when we have it */}
                          {(match.rf_score_a !== undefined || match.bz_score_a !== undefined || match.is_score_a !== undefined) && (
                            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-1 text-center text-[9px]">
                              <span></span>
                              <span className="text-[#f5a623]/70 font-black uppercase tracking-widest">RF</span>
                              <span className="text-blue-300/70 font-black uppercase tracking-widest">Buzzer</span>
                              <span className="text-cyan-300/70 font-black uppercase tracking-widest">Sprint</span>
                              <span className="text-yellow-300/80 font-black uppercase tracking-widest">Total</span>
                              <span className="text-green-400 text-[10px] font-black text-right truncate">{match.team_a_name}</span>
                              <span className="rounded-md bg-[#f5a623]/10 border border-[#f5a623]/25 py-0.5 text-white font-black tabular-nums">{match.rf_score_a ?? 0}</span>
                              <span className="rounded-md bg-blue-500/10 border border-blue-500/25 py-0.5 text-white font-black tabular-nums">{match.bz_score_a ?? 0}</span>
                              <span className="rounded-md bg-cyan-500/10 border border-cyan-500/25 py-0.5 text-white font-black tabular-nums">{match.is_score_a ?? 0}</span>
                              <span className="rounded-md bg-yellow-500/15 border border-yellow-500/40 py-0.5 text-white font-black tabular-nums">{match.final_score_a ?? 0}</span>
                              <span className="text-purple-400 text-[10px] font-black text-right truncate">{match.team_b_name}</span>
                              <span className="rounded-md bg-[#f5a623]/10 border border-[#f5a623]/25 py-0.5 text-white font-black tabular-nums">{match.rf_score_b ?? 0}</span>
                              <span className="rounded-md bg-blue-500/10 border border-blue-500/25 py-0.5 text-white font-black tabular-nums">{match.bz_score_b ?? 0}</span>
                              <span className="rounded-md bg-cyan-500/10 border border-cyan-500/25 py-0.5 text-white font-black tabular-nums">{match.is_score_b ?? 0}</span>
                              <span className="rounded-md bg-yellow-500/15 border border-yellow-500/40 py-0.5 text-white font-black tabular-nums">{match.final_score_b ?? 0}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${rfPoolA ? 'bg-[#f5a623]/10 text-[#f5a623]/80' : 'bg-red-500/10 text-red-400'}`}>
                          ⚡ A: {rfPoolA ? rfPoolA.name : 'No pool'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${rfPoolB ? 'bg-[#f5a623]/10 text-[#f5a623]/80' : 'bg-red-500/10 text-red-400'}`}>
                          ⚡ B: {rfPoolB ? rfPoolB.name : 'No pool'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${bzPool ? 'bg-blue-500/10 text-blue-400/80' : 'bg-red-500/10 text-red-400'}`}>
                          🔔 {bzPool ? bzPool.name : 'No pool'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${isPool1 ? 'bg-purple-500/10 text-purple-400/80' : 'bg-red-500/10 text-red-400'}`}>
                          💡 P1: {isPool1 ? isPool1.name : 'No pool'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${isPool2 ? 'bg-purple-500/10 text-purple-400/80' : 'bg-red-500/10 text-red-400'}`}>
                          💡 P2: {isPool2 ? isPool2.name : 'No pool'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => deleteSavedMatch(match.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {match.status === 'draft' && !canLaunch && !is3TF && !isGF && (
                    <p className="text-[10px] text-red-400/70 mt-2">
                      ⚠ Pools need: RF-A≥{RF_Q_COUNT} ({rfACount}), RF-B≥{RF_Q_COUNT} ({rfBCount}), BZ≥{BZ_Q_COUNT} ({bzQCount}), IS≥{IS_PROB_COUNT} ({isQCount})
                    </p>
                  )}

                  {/* 3-Team Final: mystery pack selectors */}
                  {match.status === 'draft' && is3TF && (
                    <div className="mt-3 space-y-2 bg-purple-900/20 border border-purple-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-purple-400 font-bold uppercase">Select Mystery Packs</p>
                      {([
                        { label: match.team_a_name, val: launch3TFPackA, set: setLaunch3TFPackA },
                        { label: match.team_b_name, val: launch3TFPackB, set: setLaunch3TFPackB },
                        ...(match.team_c_name ? [{ label: match.team_c_name, val: launch3TFPackC, set: setLaunch3TFPackC }] : []),
                      ] as { label: string; val: string; set: (v: string) => void }[]).map(t => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 w-20 truncate shrink-0">{t.label}</span>
                          <select value={t.val} onChange={e => t.set(e.target.value)}
                            className="flex-1 bg-[#060f1f] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400">
                            <option value="">— Select pack —</option>
                            {mysteryPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      ))}
                      {match.carried_score_a !== undefined && (
                        <p className="text-[10px] text-slate-500">Carried: {match.team_a_name} {match.carried_score_a} · {match.team_b_name} {match.carried_score_b}{match.team_c_name ? ` · ${match.team_c_name} ${match.carried_score_c}` : ''}</p>
                      )}
                    </div>
                  )}

                  {/* Grand Final: AV pool selectors */}
                  {match.status === 'draft' && isGF && (
                    <div className="mt-3 space-y-2 bg-blue-900/20 border border-blue-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-blue-400 font-bold uppercase">Select AV Question Pools</p>
                      {([
                        { label: match.team_a_name, val: launchAVPoolA, set: setLaunchAVPoolA },
                        { label: match.team_b_name, val: launchAVPoolB, set: setLaunchAVPoolB },
                      ] as { label: string; val: string; set: (v: string) => void }[]).map(t => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 w-20 truncate shrink-0">{t.label}</span>
                          <select value={t.val} onChange={e => t.set(e.target.value)}
                            className="flex-1 bg-[#060f1f] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-400">
                            <option value="">— Select pool —</option>
                            {pools.filter(p => showDemo || !isDemo(p.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      ))}
                      {match.carried_score_a !== undefined && (
                        <p className="text-[10px] text-slate-500">Carried: {match.team_a_name} {match.carried_score_a} · {match.team_b_name} {match.carried_score_b}</p>
                      )}
                    </div>
                  )}

                  {match.status === 'draft' && (
                    <button onClick={() => launchSavedMatch(match)} disabled={!canLaunch || matchSaving}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-3 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-sm hover:bg-[#e0941a] disabled:opacity-40 transition-colors">
                      {matchSaving ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
                      {is3TF ? '🔮 Launch Mystery Chain' : isGF ? '🎬 Launch Grand Final' : '🚀 Launch Match'}
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
                  {s.rf_phase === 'announce_a' && `Announcing ${s.team_a_name}`}
                  {s.rf_phase === 'a_playing' && `${s.team_a_name} playing`}
                  {s.rf_phase === 'score_a' && `${s.team_a_name} score`}
                  {s.rf_phase === 'announce_b' && `Announcing ${s.team_b_name}`}
                  {s.rf_phase === 'b_playing' && `${s.team_b_name} playing`}
                  {s.rf_phase === 'score_b' && `${s.team_b_name} score`}
                  {s.rf_phase === 'compare' && 'Head-to-Head'}
                  {s.rf_phase === 'done' && 'Complete'}
                </span>
              </div>

              <ScoreBar label="Rapid Fire Scores" />

              {/* idle → show instructions + move to announce A */}
              {s.rf_phase === 'idle' && (
                <>
                  <AdminRoundIntro info={ROUND_INFO.rapid_fire} />
                  <button onClick={announceRFTeamA}
                    className="w-full flex items-center justify-center gap-2 py-5 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-base transition-colors disabled:opacity-50">
                    <ArrowRight size={20} /> Announce {s.team_a_name}
                  </button>
                </>
              )}

              {/* Announce Team A — projector shows "Up Next · TEAM A" */}
              {s.rf_phase === 'announce_a' && (
                <div className="bg-gradient-to-br from-green-500/10 to-[#0a1628] border border-green-500/40 rounded-2xl p-5 space-y-4 text-center">
                  <p className="text-green-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next on the Projector</p>
                  <p className="text-white text-2xl font-black">{s.team_a_name}</p>
                  <p className="text-slate-400 text-xs">60-second Rapid Fire · 10 questions</p>
                  <button onClick={startRFTeamA}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-green-600 hover:bg-green-500 text-white font-black rounded-xl text-base transition-colors">
                    <Timer size={20} /> Start {s.team_a_name}&apos;s 60 seconds
                  </button>
                </div>
              )}

              {/* A playing */}
              {s.rf_phase === 'a_playing' && <>
                <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : 'border-green-400/40 bg-green-500/10'}`}>
                  <p className="text-xs font-bold text-green-400 uppercase tracking-widest">{s.team_a_name} — Time Remaining</p>
                  <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-green-400'}`}>{fmtTime(timerMs)}</p>
                  <p className="text-xs text-slate-500 mt-1">Q {Math.min(s.rf_q_index + 1, RF_Q_COUNT)} of {RF_Q_COUNT}{s.rf_q_index >= RF_Q_COUNT ? ' ♻' : ''} · {s.rf_correct_a} correct</p>
                </div>

                {rfGraceStart !== null && (
                  <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-500/15 p-3 text-center animate-pulse">
                    <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.3em]">⏰ Grace Window — Grade Last Answer</p>
                    <p className="text-white text-2xl font-black mt-0.5 tabular-nums">{(rfGraceMs / 1000).toFixed(1)}s</p>
                    <p className="text-amber-200/70 text-[10px] mt-0.5">Correct / Wrong / Skip still counts</p>
                  </div>
                )}

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
                  <button onClick={() => rfAction('correct')}
                    className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                    <Check size={16} /> Correct
                  </button>
                  <button onClick={() => rfAction('wrong')}
                    className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm disabled:opacity-50 border border-red-500/30 transition-colors">
                    <X size={16} /> Wrong
                  </button>
                  <button onClick={() => rfAction('skip')}
                    className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm disabled:opacity-50 border border-white/10 transition-colors">
                    <SkipForward size={16} /> Skip
                  </button>
                </div>

                <button onClick={endRFEarly}
                  className="w-full py-2.5 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl text-xs border border-white/10 transition-colors">
                  ⏹ End {s.team_a_name}&apos;s Turn Early
                </button>
              </>}

              {/* Score reveal — Team A */}
              {s.rf_phase === 'score_a' && (
                <div className="space-y-3">
                  <div className="bg-gradient-to-br from-green-500/15 to-[#0a1628] border-2 border-green-500/50 rounded-2xl p-5 text-center space-y-2">
                    <p className="text-green-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.team_a_name} — Rapid Fire Score</p>
                    <p className="text-white text-6xl font-black">{s.rf_score_a}</p>
                    <p className="text-slate-400 text-xs">{s.rf_correct_a} correct in 60 seconds</p>
                  </div>
                  <button onClick={announceRFTeamB}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-base transition-colors">
                    <ArrowRight size={16} /> Announce {s.team_b_name}
                  </button>
                </div>
              )}

              {/* Announce Team B */}
              {s.rf_phase === 'announce_b' && (
                <div className="bg-gradient-to-br from-purple-500/10 to-[#0a1628] border border-purple-500/40 rounded-2xl p-5 space-y-4 text-center">
                  <p className="text-purple-300 text-[10px] font-bold uppercase tracking-[0.3em]">Up Next on the Projector</p>
                  <p className="text-white text-2xl font-black">{s.team_b_name}</p>
                  <p className="text-slate-400 text-xs">60-second Rapid Fire · 10 questions</p>
                  <button onClick={startRFTeamB}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-base transition-colors">
                    <Timer size={20} /> Start {s.team_b_name}&apos;s 60 seconds
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

                {rfGraceStart !== null && (
                  <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-500/15 p-3 text-center animate-pulse">
                    <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.3em]">⏰ Grace Window — Grade Last Answer</p>
                    <p className="text-white text-2xl font-black mt-0.5 tabular-nums">{(rfGraceMs / 1000).toFixed(1)}s</p>
                    <p className="text-amber-200/70 text-[10px] mt-0.5">Correct / Wrong / Skip still counts</p>
                  </div>
                )}

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
                  <button onClick={() => rfAction('correct')}
                    className="flex items-center justify-center gap-1.5 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                    <Check size={16} /> Correct
                  </button>
                  <button onClick={() => rfAction('wrong')}
                    className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm disabled:opacity-50 border border-red-500/30 transition-colors">
                    <X size={16} /> Wrong
                  </button>
                  <button onClick={() => rfAction('skip')}
                    className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm disabled:opacity-50 border border-white/10 transition-colors">
                    <SkipForward size={16} /> Skip
                  </button>
                </div>

                <button onClick={endRFEarly}
                  className="w-full py-2.5 bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl text-xs border border-white/10 transition-colors">
                  ⏹ End {s.team_b_name}&apos;s Turn Early
                </button>
              </>}

              {/* Score reveal — Team B */}
              {s.rf_phase === 'score_b' && (
                <div className="space-y-3">
                  <div className="bg-gradient-to-br from-purple-500/15 to-[#0a1628] border-2 border-purple-500/50 rounded-2xl p-5 text-center space-y-2">
                    <p className="text-purple-300 text-[10px] font-bold uppercase tracking-[0.3em]">{s.team_b_name} — Rapid Fire Score</p>
                    <p className="text-white text-6xl font-black">{s.rf_score_b}</p>
                    <p className="text-slate-400 text-xs">{s.rf_correct_b} correct in 60 seconds</p>
                  </div>
                  <button onClick={showRFCompare}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-base hover:bg-[#e0941a] transition-colors">
                    <ArrowRight size={16} /> Show Head-to-Head
                  </button>
                </div>
              )}

              {/* Compare — RF head-to-head */}
              {s.rf_phase === 'compare' && (() => {
                const aWins = s.rf_score_a > s.rf_score_b
                const bWins = s.rf_score_b > s.rf_score_a
                return (
                  <div className="space-y-3">
                    <div className="bg-gradient-to-br from-[#f5a623]/15 to-[#0a1628] border-2 border-[#f5a623]/50 rounded-2xl p-4 space-y-3">
                      <p className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest text-center">Rapid Fire · Head-to-Head</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`rounded-xl p-3 text-center border ${aWins ? 'bg-green-500/20 border-green-500' : 'bg-white/5 border-white/10'}`}>
                          {aWins && <p className="text-green-300 text-2xl leading-none mb-0.5">🏆</p>}
                          <p className="text-green-300 text-[10px] font-bold uppercase tracking-widest truncate">{s.team_a_name}</p>
                          <p className="text-white text-3xl font-black">{s.rf_score_a}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{s.rf_correct_a} correct</p>
                        </div>
                        <div className={`rounded-xl p-3 text-center border ${bWins ? 'bg-purple-500/20 border-purple-500' : 'bg-white/5 border-white/10'}`}>
                          {bWins && <p className="text-purple-300 text-2xl leading-none mb-0.5">🏆</p>}
                          <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest truncate">{s.team_b_name}</p>
                          <p className="text-white text-3xl font-black">{s.rf_score_b}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{s.rf_correct_b} correct</p>
                        </div>
                      </div>
                      <p className="text-white text-sm font-black text-center">
                        {aWins ? `${s.team_a_name} leads after Rapid Fire`
                          : bWins ? `${s.team_b_name} leads after Rapid Fire`
                          : `🤝 Level at ${s.rf_score_a}`}
                      </p>
                    </div>
                    <PointAdjuster
                      teams={[
                        { label: s.team_a_name, score: s.rf_score_a, colour: '#22c55e', onAdjust: d => applyState({ ...s, rf_score_a: Math.max(0, s.rf_score_a + d) }) },
                        { label: s.team_b_name, score: s.rf_score_b, colour: '#a855f7', onAdjust: d => applyState({ ...s, rf_score_b: Math.max(0, s.rf_score_b + d) }) },
                      ]}
                      note="Adjust before moving on."
                    />
                    <button onClick={() => applyState({ ...s, rf_phase: 'done' })}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-base hover:bg-[#e0941a] transition-colors">
                      <ArrowRight size={16} /> Continue to Buzzer
                    </button>
                  </div>
                )
              })()}

              {/* RF Done — buzzer handoff */}
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
                  <PointAdjuster
                    teams={[
                      { label: s.team_a_name, score: s.rf_score_a, colour: '#22c55e', onAdjust: d => applyState({ ...s, rf_score_a: Math.max(0, s.rf_score_a + d) }) },
                      { label: s.team_b_name, score: s.rf_score_b, colour: '#a855f7', onAdjust: d => applyState({ ...s, rf_score_b: Math.max(0, s.rf_score_b + d) }) },
                    ]}
                    note="Adjusts the Rapid Fire total for this round only."
                  />
                  <button onClick={proceedToBuzzer}
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

              {/* idle → show question (first idle also shows instructions) */}
              {s.bz_phase === 'idle' && (
                <>
                  {s.bz_q_index === 0 && s.bz_score_a === 0 && s.bz_score_b === 0 && (
                    <AdminRoundIntro info={ROUND_INFO.buzzer} />
                  )}
                  <button onClick={showBZQuestion}
                    className="w-full flex items-center justify-center gap-2 py-5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl text-base transition-colors disabled:opacity-50">
                    <Bell size={20} /> Show Question {s.bz_q_index + 1}
                  </button>
                </>
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
                  <button onClick={bzSkip}
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
                    <button onClick={bzCorrect}
                      className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                      <Check size={16} /> Correct (+{BZ_CORRECT_PTS})
                    </button>
                    <button onClick={bzWrong}
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
                    <button onClick={bzCorrect}
                      className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 transition-colors">
                      <Check size={16} /> Correct (+{s.bz_phase === 'second_chance' ? BZ_SECOND_CHANCE_PTS : BZ_CORRECT_PTS})
                    </button>
                    <button onClick={bzWrong}
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
                  <button onClick={nextBZQuestion}
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
                  <PointAdjuster
                    teams={[
                      { label: s.team_a_name, score: s.bz_score_a, colour: '#22c55e', onAdjust: d => applyState({ ...s, bz_score_a: Math.max(0, s.bz_score_a + d) }) },
                      { label: s.team_b_name, score: s.bz_score_b, colour: '#a855f7', onAdjust: d => applyState({ ...s, bz_score_b: Math.max(0, s.bz_score_b + d) }) },
                    ]}
                    note="Adjusts the Buzzer total for this round only."
                  />
                  <button onClick={proceedToIS}
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

              {/* idle — two-step intro on Problem 1 (instructions → problem
                  statement), single step on Problem 2+ (problem statement only). */}
              {s.is_phase === 'idle' && (() => {
                const firstProblem = s.is_problem_index === 0 && s.is_score_a === 0 && s.is_score_b === 0
                const showingInstructions = firstProblem && !s.is_intro_done
                return (
                  <>
                    {firstProblem && !s.is_intro_done && (
                      <AdminRoundIntro info={ROUND_INFO.innovation_sprint} />
                    )}
                    {showingInstructions ? (
                      <>
                        <div className="rounded-xl border border-[#f5a623]/30 bg-[#f5a623]/5 p-3 text-center space-y-1">
                          <p className="text-[#f5a623] text-[10px] font-black uppercase tracking-widest">Step 1</p>
                          <p className="text-white text-xs">Read the rules to the room. When you&apos;re done, reveal the problem so the moderator can read it.</p>
                        </div>
                        <button onClick={() => applyState({ ...s, is_intro_done: true })}
                          className="w-full flex items-center justify-center gap-2 py-5 bg-white/10 hover:bg-white/20 border border-[#f5a623]/40 text-[#f5a623] font-black rounded-2xl text-base transition-colors">
                          <ArrowRight size={20} /> Instructions Read — Reveal Problem
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl border border-[#f5a623]/30 bg-[#f5a623]/5 p-3 text-center space-y-1">
                          <p className="text-[#f5a623] text-[10px] font-black uppercase tracking-widest">{firstProblem ? 'Step 2' : 'Step 1'}</p>
                          <p className="text-white text-xs">Wait for the moderator to finish reading the problem, then click below.</p>
                        </div>
                        <button onClick={markISReady}
                          className="w-full flex items-center justify-center gap-2 py-5 bg-white/10 hover:bg-white/20 border border-[#f5a623]/40 text-[#f5a623] font-black rounded-2xl text-base transition-colors">
                          ✓ Moderator Done — Mark Ready
                        </button>
                      </>
                    )}
                  </>
                )
              })()}

              {/* ready → admin explicitly kicks off the 60s timer */}
              {s.is_phase === 'ready' && (() => {
                const firstProblem = s.is_problem_index === 0 && s.is_score_a === 0 && s.is_score_b === 0
                return (
                <>
                  <div className="rounded-xl border-2 border-[#f5a623]/60 bg-[#f5a623]/10 p-4 text-center space-y-1 animate-pulse">
                    <p className="text-[#f5a623] text-[10px] font-black uppercase tracking-widest">{firstProblem ? 'Step 3' : 'Step 2'} — Teams Ready</p>
                    <p className="text-white text-sm font-bold">READY on the projector. Start the 60-second timer when teams are set.</p>
                  </div>
                  <button onClick={startISTimer}
                    className="w-full flex items-center justify-center gap-2 py-5 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-base hover:bg-[#e0941a] transition-colors">
                    <Timer size={20} /> Start 60-second Timer
                  </button>
                  <button onClick={() => applyState({ ...s, is_phase: 'idle' })}
                    className="w-full py-2 bg-transparent hover:bg-white/5 text-slate-400 rounded-lg text-[11px]">
                    ← Not ready yet
                  </button>
                </>
                )
              })()}

              {/* working → timer running */}
              {s.is_phase === 'working' && (
                <div className="space-y-3">
                  <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : 'border-[#f5a623]/40 bg-[#f5a623]/5'}`}>
                    <p className="text-xs font-bold text-[#f5a623] uppercase tracking-widest">Teams Arranging Steps</p>
                    <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : 'text-[#f5a623]'}`}>{fmtTime(timerMs)}</p>
                  </div>
                  <button onClick={collectISAnswers}
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

              {/* solution — show the correct answer before team-by-team comparison */}
              {s.is_phase === 'solution' && currentISP && (
                <div className="space-y-3">
                  <div className="bg-gradient-to-br from-[#f5a623]/10 to-[#0a1628] border border-[#f5a623]/40 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest">Correct Solution</p>
                    <p className="text-sm font-bold text-white leading-snug">{currentISP.statement}</p>
                    <ol className="space-y-1.5">
                      {currentISP.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-[#f5a623] text-[#0a1628] text-xs font-black flex items-center justify-center">{i + 1}</span>
                          <p className="text-xs text-white/90 leading-snug">{step}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <button onClick={nextISProblem}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-base hover:bg-[#e0941a] disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {s.is_problem_index + 1 >= IS_PROB_COUNT ? 'Finish Innovation Sprint' : `Next Problem (${s.is_problem_index + 2}/${IS_PROB_COUNT})`}
                  </button>
                </div>
              )}

              {/* revealed — per-problem results (shown FIRST, solution comes after) */}
              {s.is_phase === 'revealed' && (
                <div className="space-y-3">
                  {currentISP && (s.is_step_results_a || s.is_step_results_b) && (
                    <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest">Problem {s.is_problem_index + 1} of {IS_PROB_COUNT} — Score</p>
                        <p className="text-[10px] text-slate-500">Cumulative shown on H2H at end</p>
                      </div>
                      {(['a', 'b'] as const).map(team => {
                        const answer = team === 'a' ? (isAnswers?.a ?? s.is_team_a_answer) : (isAnswers?.b ?? s.is_team_b_answer)
                        const stepResults = team === 'a' ? s.is_step_results_a : s.is_step_results_b
                        const name = team === 'a' ? s.team_a_name : s.team_b_name
                        const problemScore = team === 'a'
                          ? (s.is_problem_scores_a?.[s.is_problem_index] ?? 0)
                          : (s.is_problem_scores_b?.[s.is_problem_index] ?? 0)
                        const color = team === 'a' ? 'text-green-400' : 'text-purple-400'
                        return (
                          <div key={team} className={`rounded-xl p-3 border ${team === 'a' ? 'border-green-500/30' : 'border-purple-500/30'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className={`text-xs font-bold ${color}`}>{name}</p>
                              <p className={`text-lg font-black ${color}`}>{problemScore} pts</p>
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
                  <button onClick={showTeamResults}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl text-base hover:bg-[#e0941a] transition-colors">
                    <ArrowRight size={16} /> Next — Show Correct Solution
                  </button>
                </div>
              )}

              {/* compare — side-by-side of both problems + IS totals */}
              {s.is_phase === 'compare' && (
                <div className="space-y-3">
                  <div className="bg-[#0a1628] border border-[#f5a623]/40 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-bold text-[#f5a623] uppercase tracking-widest">Innovation Sprint · Final Compare</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/5 border border-white/10 py-2">
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Problem</p>
                      </div>
                      <div className="rounded-lg bg-green-500/10 border border-green-500/30 py-2">
                        <p className="text-[9px] text-green-400 font-bold uppercase tracking-widest truncate">{s.team_a_name}</p>
                      </div>
                      <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 py-2">
                        <p className="text-[9px] text-purple-400 font-bold uppercase tracking-widest truncate">{s.team_b_name}</p>
                      </div>
                      {Array.from({ length: IS_PROB_COUNT }).map((_, i) => {
                        const a = s.is_problem_scores_a?.[i] ?? 0
                        const b = s.is_problem_scores_b?.[i] ?? 0
                        return (
                          <div key={i} className="contents">
                            <div className="rounded-lg bg-white/5 py-2 text-xs font-bold text-white">Problem {i + 1}</div>
                            <div className={`rounded-lg py-2 text-lg font-black ${a >= b ? 'bg-green-500/15 text-green-300' : 'bg-white/5 text-slate-400'}`}>{a}</div>
                            <div className={`rounded-lg py-2 text-lg font-black ${b >= a ? 'bg-purple-500/15 text-purple-300' : 'bg-white/5 text-slate-400'}`}>{b}</div>
                          </div>
                        )
                      })}
                      <div className="rounded-lg bg-[#f5a623]/15 border border-[#f5a623]/40 py-2 text-xs font-black text-[#f5a623]">Total</div>
                      <div className={`rounded-lg py-2 text-xl font-black ${s.is_score_a >= s.is_score_b ? 'bg-green-500/25 text-green-300 ring-1 ring-green-400/40' : 'bg-white/5 text-slate-400'}`}>{s.is_score_a}</div>
                      <div className={`rounded-lg py-2 text-xl font-black ${s.is_score_b >= s.is_score_a ? 'bg-purple-500/25 text-purple-300 ring-1 ring-purple-400/40' : 'bg-white/5 text-slate-400'}`}>{s.is_score_b}</div>
                    </div>
                    <p className="text-center text-white text-sm font-black pt-1">
                      {s.is_score_a > s.is_score_b ? `🏆 ${s.team_a_name} wins the Innovation Sprint`
                        : s.is_score_b > s.is_score_a ? `🏆 ${s.team_b_name} wins the Innovation Sprint`
                        : `🤝 Tied at ${s.is_score_a}`}
                    </p>
                  </div>
                  <PointAdjuster
                    teams={[
                      { label: s.team_a_name, score: s.is_score_a, colour: '#22c55e', onAdjust: d => applyState({ ...s, is_score_a: Math.max(0, s.is_score_a + d) }) },
                      { label: s.team_b_name, score: s.is_score_b, colour: '#a855f7', onAdjust: d => applyState({ ...s, is_score_b: Math.max(0, s.is_score_b + d) }) },
                    ]}
                    note="Adjust before moving on."
                  />
                  <button onClick={showISDone}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#f5a623] text-[#0a1628] font-black rounded-xl text-base hover:bg-[#e0941a] transition-colors">
                    <ArrowRight size={16} /> Continue to Finish Match
                  </button>
                </div>
              )}

              {/* done */}
              {s.is_phase === 'done' && (
                <div className="space-y-3">
                  <PointAdjuster
                    teams={[
                      { label: s.team_a_name, score: s.is_score_a, colour: '#22c55e', onAdjust: d => applyState({ ...s, is_score_a: Math.max(0, s.is_score_a + d) }) },
                      { label: s.team_b_name, score: s.is_score_b, colour: '#a855f7', onAdjust: d => applyState({ ...s, is_score_b: Math.max(0, s.is_score_b + d) }) },
                    ]}
                    note="Adjusts the Innovation Sprint total. Grand-final total updates automatically."
                  />
                  <button onClick={finishMatch}
                    className="w-full flex items-center justify-center gap-2 py-5 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-lg hover:bg-[#e0941a] disabled:opacity-50 transition-colors shadow-lg shadow-[#f5a623]/20">
                    🏆 Finish Match &amp; Show Final Scores
                  </button>
                </div>
              )}
            </>}

            {/* ══ MYSTERY CHAIN (3-Team Final) ══ */}
            {round === 'mystery_chain' && <>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <Lightbulb size={16} className="text-purple-400" />
                <span className="text-sm font-black text-purple-400">Mystery Chain</span>
                <span className="ml-auto text-xs text-slate-400">
                  {s.mc_phase === 'idle' && 'Ready'}
                  {s.mc_phase === 'story' && 'Reading story...'}
                  {s.mc_phase === 'a_playing' && `${s.team_a_name} playing`}
                  {s.mc_phase === 'b_playing' && `${s.team_b_name} playing`}
                  {s.mc_phase === 'c_playing' && `${s.team_c_name} playing`}
                  {s.mc_phase === 'done' && 'Complete'}
                </span>
              </div>

              {/* Carried scores */}
              {(s.carried_score_a !== undefined || s.carried_score_b !== undefined) && (
                <div className="bg-[#0a1628] border border-white/10 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Carried Scores from Semi Final</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { name: s.team_a_name, carried: s.carried_score_a ?? 0, mc: s.mc_score_a, color: 'text-green-400' },
                      { name: s.team_b_name, carried: s.carried_score_b ?? 0, mc: s.mc_score_b, color: 'text-purple-400' },
                      ...(s.team_c_name ? [{ name: s.team_c_name, carried: s.carried_score_c ?? 0, mc: s.mc_score_c, color: 'text-blue-400' }] : []),
                    ].map(t => (
                      <div key={t.name}>
                        <p className={`text-xs font-bold ${t.color} truncate`}>{t.name}</p>
                        <p className="text-[10px] text-slate-500">SF: {t.carried} + MC: {t.mc}</p>
                        <p className={`text-lg font-black ${t.color}`}>{t.carried + t.mc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Story display */}
              {s.mc_phase === 'idle' && (
                <div className="bg-[#0a1628] border border-purple-500/20 rounded-2xl p-4 space-y-3">
                  <p className="text-[11px] text-purple-400 font-bold uppercase tracking-widest">{s.mc_scenario_title}</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{s.mc_opening_story}</p>
                  <button onClick={() => applyState({ ...s, mc_phase: 'story' })}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl text-sm transition-colors">
                    📖 Read Story — Then Start Team A
                  </button>
                </div>
              )}

              {s.mc_phase === 'story' && (
                <button onClick={() => { autoEndedRFRef.current = false; applyState({ ...s, mc_phase: 'a_playing', mc_q_index: 0, mc_timer_start: Date.now(), mc_revealed: false }) }}
                  className="w-full py-5 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-base transition-colors">
                  <Timer size={20} className="inline mr-2" /> Start {s.team_a_name}&apos;s Turn (60s)
                </button>
              )}

              {(s.mc_phase === 'a_playing' || s.mc_phase === 'b_playing' || s.mc_phase === 'c_playing') && (() => {
                const isA = s.mc_phase === 'a_playing', isB = s.mc_phase === 'b_playing'
                const teamName = isA ? s.team_a_name : isB ? s.team_b_name : (s.team_c_name ?? 'Team C')
                const puzzles = isA ? s.mc_puzzles_a : isB ? s.mc_puzzles_b : s.mc_puzzles_c
                const correct = isA ? s.mc_correct_a : isB ? s.mc_correct_b : s.mc_correct_c
                const currentPuzzle = puzzles[s.mc_q_index]
                const color = isA ? 'green' : isB ? 'purple' : 'blue'
                return (
                  <>
                    <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : `border-${color}-400/40 bg-${color}-500/10`}`}>
                      <p className={`text-xs font-bold text-${color}-400 uppercase tracking-widest`}>{teamName} — Time Remaining</p>
                      <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : `text-${color}-400`}`}>{fmtTime(timerMs)}</p>
                      <p className="text-xs text-slate-500 mt-1">Puzzle {Math.min(s.mc_q_index + 1, MC_PUZZLE_COUNT)} · {correct} correct</p>
                    </div>

                    {currentPuzzle && (
                      <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-2">
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Clue</p>
                        <p className="text-base font-bold text-white">{currentPuzzle.clue}</p>
                        <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Scrambled</p>
                          <p className="text-3xl font-black text-purple-300 tracking-[0.3em] mt-1">{currentPuzzle.scrambled}</p>
                        </div>
                        {s.mc_revealed && (
                          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3">
                            <p className="text-[10px] text-green-400 font-bold uppercase">Answer: <span className="text-green-300 text-sm tracking-widest">{currentPuzzle.answer}</span></p>
                            <p className="text-xs text-slate-300 mt-1 italic">{currentPuzzle.story}</p>
                          </div>
                        )}
                        {!s.mc_revealed && (
                          <button onClick={mcReveal} className="w-full py-2 bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl text-sm transition-colors">
                            Reveal Answer
                          </button>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => mcAction('correct')} className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm transition-colors">
                        <Check size={16} /> Correct
                      </button>
                      <button onClick={() => mcAction('wrong')} className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm border border-red-500/30 transition-colors">
                        <X size={16} /> Wrong
                      </button>
                      <button onClick={() => mcAction('skip')} className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 transition-colors">
                        <SkipForward size={16} /> Skip
                      </button>
                    </div>

                    <button onClick={mcNextTeam} className={`w-full py-3 bg-${color}-600/40 hover:bg-${color}-600/60 text-${color}-300 font-bold rounded-xl text-sm border border-${color}-500/30 transition-colors`}>
                      ⏭ End {teamName}&apos;s Turn Early → Next Team
                    </button>
                  </>
                )
              })()}


              {s.mc_phase === 'done' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-widest text-center">Mystery Chain Complete — Final Totals</p>
                  {[
                    { name: s.team_a_name, carried: s.carried_score_a ?? 0, mc: s.mc_score_a, color: 'text-green-400' },
                    { name: s.team_b_name, carried: s.carried_score_b ?? 0, mc: s.mc_score_b, color: 'text-purple-400' },
                    ...(s.team_c_name ? [{ name: s.team_c_name, carried: s.carried_score_c ?? 0, mc: s.mc_score_c, color: 'text-blue-400' }] : []),
                  ].sort((a, b) => (b.carried + b.mc) - (a.carried + a.mc)).map((t, i) => (
                    <div key={t.name} className={`bg-[#0a1628] border ${i === 0 ? 'border-[#f5a623]/40' : i === 2 ? 'border-red-500/20' : 'border-white/10'} rounded-2xl p-4 flex items-center gap-3`}>
                      <p className={`text-2xl font-black ${i === 0 ? 'text-[#f5a623]' : i === 2 ? 'text-red-400' : 'text-slate-400'}`}>#{i + 1}</p>
                      <div className="flex-1">
                        <p className={`font-black text-sm ${t.color}`}>{t.name}</p>
                        <p className="text-[10px] text-slate-500">SF {t.carried} + MC {t.mc} = {t.carried + t.mc}</p>
                      </div>
                      {i === 2 && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded-full font-bold">2nd Runner Up</span>}
                    </div>
                  ))}
                  <button onClick={finishMatch}
                    className="w-full py-5 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-lg hover:bg-[#e0941a] transition-colors shadow-lg shadow-[#f5a623]/20">
                    🏆 Confirm Results &amp; Advance to Grand Final
                  </button>
                </div>
              )}
            </>}

            {/* ══ AUDIO VISUAL (Grand Final) ══ */}
            {round === 'audio_visual' && <>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <Radio size={16} className="text-blue-400" />
                <span className="text-sm font-black text-blue-400">Audio Visual Round — Grand Final</span>
                <span className="ml-auto text-xs text-slate-400">
                  {s.av_phase === 'idle' && 'Ready'}
                  {s.av_phase === 'a_playing' && `${s.team_a_name} playing`}
                  {s.av_phase === 'break' && 'Break — Team B next'}
                  {s.av_phase === 'b_playing' && `${s.team_b_name} playing`}
                  {s.av_phase === 'done' && 'Complete'}
                </span>
              </div>

              {(s.carried_score_a !== undefined || s.carried_score_b !== undefined) && (
                <div className="bg-[#0a1628] border border-white/10 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Carried Scores</p>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    {[
                      { name: s.team_a_name, carried: s.carried_score_a ?? 0, av: s.av_score_a, color: 'text-green-400' },
                      { name: s.team_b_name, carried: s.carried_score_b ?? 0, av: s.av_score_b, color: 'text-purple-400' },
                    ].map(t => (
                      <div key={t.name}>
                        <p className={`text-xs font-bold ${t.color} truncate`}>{t.name}</p>
                        <p className="text-[10px] text-slate-500">Prev: {t.carried} + AV: {t.av}</p>
                        <p className={`text-lg font-black ${t.color}`}>{t.carried + t.av}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {s.av_phase === 'idle' && (
                <button onClick={() => { autoEndedRFRef.current = false; applyState({ ...s, av_phase: 'a_playing', av_q_index: 0, av_timer_start: Date.now() }) }}
                  className="w-full py-5 bg-green-600 hover:bg-green-500 text-white font-black rounded-2xl text-base transition-colors">
                  <Timer size={20} className="inline mr-2" /> Start {s.team_a_name}&apos;s Turn (60s)
                </button>
              )}

              {(s.av_phase === 'a_playing' || s.av_phase === 'b_playing') && (() => {
                const isA = s.av_phase === 'a_playing'
                const teamName = isA ? s.team_a_name : s.team_b_name
                const questions = isA ? s.av_questions_a : s.av_questions_b
                const correct = isA ? s.av_correct_a : s.av_correct_b
                const currentQ = questions[s.av_q_index]
                const color = isA ? 'green' : 'purple'
                return (
                  <>
                    <div className={`rounded-2xl p-4 text-center border-2 ${timerWarn && timerSecs > 0 ? 'border-red-400 bg-red-500/10 animate-pulse' : timerSecs === 0 ? 'border-red-600 bg-red-900/20' : `border-${color}-400/40 bg-${color}-500/10`}`}>
                      <p className={`text-xs font-bold text-${color}-400 uppercase tracking-widest`}>{teamName} — Time Remaining</p>
                      <p className={`text-6xl font-black mt-1 ${timerWarn || timerSecs === 0 ? 'text-red-400' : `text-${color}-400`}`}>{fmtTime(timerMs)}</p>
                      <p className="text-xs text-slate-500 mt-1">Q {Math.min(s.av_q_index + 1, 10)} of 10 · {correct} correct</p>
                    </div>
                    {currentQ && (
                      <div className="bg-[#0a1628] border border-white/10 rounded-2xl p-4 space-y-2">
                        <p className="text-base font-bold text-white">{currentQ.question}</p>
                        <p className="text-[11px] text-slate-500">Answer: <span className="text-green-400 font-bold">{currentQ.answer}</span></p>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => avAction('correct')} className="flex items-center justify-center gap-1.5 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-sm transition-colors">
                        <Check size={16} /> Correct
                      </button>
                      <button onClick={() => avAction('wrong')} className="flex items-center justify-center gap-1.5 py-4 bg-red-600/60 hover:bg-red-600/80 text-white font-bold rounded-xl text-sm border border-red-500/30 transition-colors">
                        <X size={16} /> Wrong
                      </button>
                      <button onClick={() => avAction('skip')} className="flex items-center justify-center gap-1.5 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-sm border border-white/10 transition-colors">
                        <SkipForward size={16} /> Skip
                      </button>
                    </div>
                  </>
                )
              })()}

              {s.av_phase === 'break' && (
                <button onClick={() => { autoEndedRFRef.current = false; applyState({ ...s, av_phase: 'b_playing', av_q_index: 0, av_timer_start: Date.now() }) }}
                  className="w-full py-5 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-2xl text-base transition-colors">
                  <Timer size={20} className="inline mr-2" /> Start {s.team_b_name}&apos;s Turn (60s)
                </button>
              )}

              {s.av_phase === 'done' && (
                <div className="space-y-3">
                  <p className="text-[10px] text-[#f5a623] font-bold uppercase tracking-widest text-center">Grand Final Complete — Champion &amp; Runner Up</p>
                  {[
                    { name: s.team_a_name, carried: s.carried_score_a ?? 0, av: s.av_score_a, color: 'text-green-400' },
                    { name: s.team_b_name, carried: s.carried_score_b ?? 0, av: s.av_score_b, color: 'text-purple-400' },
                  ].sort((a, b) => (b.carried + b.av) - (a.carried + a.av)).map((t, i) => (
                    <div key={t.name} className={`bg-[#0a1628] border ${i === 0 ? 'border-[#f5a623]/40' : 'border-white/10'} rounded-2xl p-4 flex items-center gap-3`}>
                      <p className={`text-2xl font-black ${i === 0 ? 'text-[#f5a623]' : 'text-slate-400'}`}>{i === 0 ? '🏆' : '🥈'}</p>
                      <div className="flex-1">
                        <p className={`font-black text-sm ${t.color}`}>{t.name}</p>
                        <p className="text-[10px] text-slate-500">Previous {t.carried} + AV {t.av} = {t.carried + t.av}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${i === 0 ? 'bg-[#f5a623]/20 text-[#f5a623]' : 'bg-white/10 text-slate-400'}`}>
                        {i === 0 ? 'Champion' : '1st Runner Up'}
                      </span>
                    </div>
                  ))}
                  <button onClick={finishMatch}
                    className="w-full py-5 bg-[#f5a623] text-[#0a1628] font-black rounded-2xl text-lg hover:bg-[#e0941a] transition-colors shadow-lg shadow-[#f5a623]/20">
                    🏆 Save Final Results
                  </button>
                </div>
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

        {/* ════════════════ GRAND FINAL — Mystery Chain + AV Round ════════════════ */}
        {activeTab === 'grand-final' && <GrandFinalTab />}

        {/* ════════════════ TIE BREAKER — standalone buzzer round ════════════════ */}
        {activeTab === 'tie-breaker' && <TieBreakerTab />}

        {/* ════════════════ SIMULATOR ════════════════ */}
        {activeTab === 'simulator' && <EmergencyTab />}

      </div>
    </div>
  )
}

// ── Grand Final tab ───────────────────────────────────────────────────────────
// Launch pad for the standalone Mystery Chain (3-team) and Audio Visual Round
// (top-2 grand final). Setup, scoring, and audience displays all live at their
// own URLs — this tab just makes it easy to open each screen.
function GrandFinalTab() {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const copy = (path: string) => {
    if (!origin) return
    navigator.clipboard.writeText(origin + path)
    setCopied(path)
    setTimeout(() => setCopied(null), 1600)
  }

  const Row = ({ path, label, desc, emoji }: { path: string; label: string; desc: string; emoji: string }) => (
    <div className="flex items-center gap-3 bg-[#0a1628] border border-white/10 rounded-2xl px-4 py-3">
      <span className="text-2xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white font-black text-sm">{label}</p>
        <p className="text-slate-400 text-[11px] leading-snug">{desc}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <a href={path} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-colors">
          <ExternalLink size={11} /> Open
        </a>
        <button onClick={() => copy(path)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-colors">
          {copied === path ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div>
        <h2 className="font-black text-white text-sm">Grand Final Stages</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Two linked rounds. Configure the whole flow inside Mystery Chain admin — the top 2 teams and the AV Round questions
          all carry forward automatically when the host advances.
        </p>
      </div>

      {/* Stage 1 — Mystery Chain */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔐</span>
          <div>
            <p className="text-white font-black text-sm">Stage 1 — Mystery Chain</p>
            <p className="text-slate-500 text-[11px]">3 teams pick a mystery pack each · 60 s per team · top 2 advance</p>
          </div>
        </div>
        <Row path="/mystery-chain/admin"    label="Host / Admin"       desc="Set teams + AV Round upfront, run the game, advance top 2 to AV" emoji="🎛️" />
        <Row path="/mystery-chain/audience" label="Audience Projector" desc="Big-screen animated scene, story narration, live scores"          emoji="📺" />
        <Row path="/mystery-chain/team-a"   label="Team A Screen"      desc="Same live scene as the audience, mirrored on Team A's device"     emoji="🅰️" />
        <Row path="/mystery-chain/team-b"   label="Team B Screen"      desc="Same live scene as the audience, mirrored on Team B's device"     emoji="🅱️" />
        <Row path="/mystery-chain/team-c"   label="Team C Screen"      desc="Same live scene as the audience, mirrored on Team C's device"     emoji="🅲" />
      </section>

      {/* Stage 2 — Audio Visual Round */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📺</span>
          <div>
            <p className="text-white font-black text-sm">Stage 2 — Audio Visual Round</p>
            <p className="text-slate-500 text-[11px]">2 min video · 60 s per team · +10 per correct · MC scores carry forward</p>
          </div>
        </div>
        <Row path="/audio-visual/admin"    label="Host / Admin"       desc="Auto-hydrates from Mystery Chain — one click starts the video"      emoji="🎛️" />
        <Row path="/audio-visual/audience" label="Audience Projector" desc="Full-screen video then per-team Q&A with countdown timer"           emoji="📺" />
      </section>

      <div className="bg-[#f5a623]/5 border border-[#f5a623]/20 rounded-2xl p-3">
        <p className="text-[#f5a623] text-[11px] font-bold uppercase tracking-widest mb-1">Tip · Same audience URL</p>
        <p className="text-slate-300 text-[11px] leading-snug">
          The audience projector at <code className="text-white font-mono">/mystery-chain/audience</code> automatically swaps
          to the AV video when the host clicks &quot;Advance Top 2&quot; — you don&apos;t need to touch that screen between rounds.
        </p>
      </div>
    </>
  )
}

// ── Tie Breaker tab ───────────────────────────────────────────────────────────
// Launch pad for the standalone buzzer-style tie-breaker round. Any time two
// teams end on the same score at any stage of the competition, the host can
// jump straight to this to resolve it.
function TieBreakerTab() {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const copy = (path: string) => {
    if (!origin) return
    navigator.clipboard.writeText(origin + path)
    setCopied(path)
    setTimeout(() => setCopied(null), 1600)
  }

  const Row = ({ path, label, desc, emoji }: { path: string; label: string; desc: string; emoji: string }) => (
    <div className="flex items-center gap-3 bg-[#0a1628] border border-white/10 rounded-2xl px-4 py-3">
      <span className="text-2xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white font-black text-sm">{label}</p>
        <p className="text-slate-400 text-[11px] leading-snug">{desc}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <a href={path} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-colors">
          <ExternalLink size={11} /> Open
        </a>
        <button onClick={() => copy(path)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold text-white transition-colors">
          {copied === path ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div>
        <h2 className="font-black text-white text-sm">Tie Breaker · Rapid Fire</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Rapid fire. Each team gets <b className="text-white">30 seconds</b> to answer as many
          questions as they can from an editable pool of <b className="text-white">20</b>.
          Correct = <b className="text-white">+1 pt</b>, no negative marks. Wrong or skipped
          questions cycle to the back so teams can retry within their 30 seconds. Highest score wins.
        </p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔔</span>
          <div>
            <p className="text-white font-black text-sm">Standalone Tie-Breaker</p>
            <p className="text-slate-500 text-[11px]">Any two teams · any stage of the competition</p>
          </div>
        </div>
        <Row path="/tie-breaker/admin"    label="Host / Admin"       desc="Set teams and pool, run the 30-second rapid fire, mark correct / wrong / skip" emoji="🎛️" />
        <Row path="/tie-breaker/audience" label="Audience Projector" desc="Big-screen rapid-fire display — circular timer, current question, live scores" emoji="📺" />
      </section>

      <div className="bg-pink-500/5 border border-pink-500/20 rounded-2xl p-3">
        <p className="text-pink-300 text-[11px] font-bold uppercase tracking-widest mb-1">How it works</p>
        <ul className="text-slate-300 text-[11px] leading-relaxed list-disc list-inside space-y-0.5">
          <li>Host sets team names + edits the 20-question pool as needed.</li>
          <li>Team A gets 30 seconds — host marks each answer Correct / Wrong / Skip.</li>
          <li>Team B then gets its own fresh 30 seconds on the same pool.</li>
          <li>Highest score wins. If still tied, run another rapid-fire round.</li>
        </ul>
      </div>
    </>
  )
}
