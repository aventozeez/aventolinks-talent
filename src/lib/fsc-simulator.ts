import { supabase } from './supabase'

export const SIM_CHANNEL   = 'fsc-simulator'
export const SIM_ID        = 'sim_state'
export const SIM_TIMER_MS  = 3 * 60 * 1000   // 3 minutes

export type SimPhase = 'idle' | 'briefing' | 'working' | 'revealed'

export type SimFacility = {
  id: string
  name: string
  demand_kw: number
  priority: number   // max points for full power
  critical: boolean
  icon: string
}

export type SimTransformer = {
  id: string
  name: string
  capacity_kw: number
}

export type SimScenario = {
  id: string
  name: string
  difficulty: 'Basic' | 'Medium' | 'Hard'
  description: string
  context: string
  available_kw: number
  transformers: SimTransformer[]
  facilities: SimFacility[]
}

export type SimAllocation = {
  facility_id: string
  allocated_kw: number
  transformer_id?: string
}

export type FacilityScore = {
  facility_id: string
  points: number
  ratio: number
  full_bonus: number
}

export type SimScoreBreakdown = {
  facility_scores: FacilityScore[]
  overload_penalty: number
  transformer_penalties: number
  efficiency_bonus: number
  total: number
}

export type SimState = {
  phase: SimPhase
  scenario_id: string
  timer_start: number | null
  team_a_allocation: SimAllocation[] | null
  team_a_submitted: boolean
  team_b_allocation: SimAllocation[] | null
  team_b_submitted: boolean
  score_a: SimScoreBreakdown | null
  score_b: SimScoreBreakdown | null
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

export const SCENARIOS: SimScenario[] = [
  {
    id: 'storm_basic',
    name: 'Storm Response',
    difficulty: 'Basic',
    description: 'A severe storm has knocked out the main substation. Restore power to the community with limited generation.',
    context: 'Total demand: 150 kW · Available: 100 kW · No transformers',
    available_kw: 100,
    transformers: [],
    facilities: [
      { id: 'hospital',    name: 'Hospital',       demand_kw: 35, priority: 40, critical: true,  icon: '🏥' },
      { id: 'water',       name: 'Water Station',  demand_kw: 25, priority: 30, critical: true,  icon: '💧' },
      { id: 'school',      name: 'School',         demand_kw: 20, priority: 20, critical: false, icon: '🏫' },
      { id: 'market',      name: 'Market',         demand_kw: 30, priority: 10, critical: false, icon: '🏪' },
      { id: 'residential', name: 'Residential',    demand_kw: 40, priority:  5, critical: false, icon: '🏘️' },
    ],
  },
  {
    id: 'flood_medium',
    name: 'Flood Recovery',
    difficulty: 'Medium',
    description: 'Widespread flooding has wiped out multiple substations. Life-critical services need power first — but you only have 120 kW against 190 kW of demand.',
    context: 'Total demand: 190 kW · Available: 120 kW · No transformers',
    available_kw: 120,
    transformers: [],
    facilities: [
      { id: 'hospital',    name: 'Hospital',          demand_kw: 40, priority: 40, critical: true,  icon: '🏥' },
      { id: 'fire',        name: 'Fire Station',       demand_kw: 15, priority: 35, critical: true,  icon: '🚒' },
      { id: 'water',       name: 'Water Treatment',    demand_kw: 30, priority: 30, critical: true,  icon: '💧' },
      { id: 'telecom',     name: 'Telecom Tower',      demand_kw: 10, priority: 25, critical: true,  icon: '📡' },
      { id: 'school',      name: 'School (Shelter)',   demand_kw: 25, priority: 20, critical: false, icon: '🏫' },
      { id: 'market',      name: 'Food Market',        demand_kw: 20, priority: 15, critical: false, icon: '🏪' },
      { id: 'residential', name: 'Residential Area',   demand_kw: 50, priority:  5, critical: false, icon: '🏘️' },
    ],
  },
  {
    id: 'grid_attack',
    name: 'Grid Attack',
    difficulty: 'Hard',
    description: 'A cyberattack has crippled the main grid. Two backup transformers are operational — but overloading either triggers a cascade failure. Assign facilities carefully.',
    context: 'Total demand: 150 kW · Available: 90 kW · 2 Transformers (55 kW + 45 kW)',
    available_kw: 90,
    transformers: [
      { id: 'tx_a', name: 'Transformer A', capacity_kw: 55 },
      { id: 'tx_b', name: 'Transformer B', capacity_kw: 45 },
    ],
    facilities: [
      { id: 'hospital',    name: 'Hospital',       demand_kw: 35, priority: 40, critical: true,  icon: '🏥' },
      { id: 'data_center', name: 'Data Center',    demand_kw: 30, priority: 30, critical: true,  icon: '🖥️' },
      { id: 'water',       name: 'Water Plant',    demand_kw: 20, priority: 28, critical: true,  icon: '💧' },
      { id: 'police',      name: 'Police HQ',      demand_kw: 15, priority: 25, critical: true,  icon: '🚔' },
      { id: 'school',      name: 'School',         demand_kw: 20, priority: 15, critical: false, icon: '🏫' },
      { id: 'residential', name: 'Residential',    demand_kw: 30, priority:  5, critical: false, icon: '🏘️' },
    ],
  },
]

// ── Scoring ───────────────────────────────────────────────────────────────────

export function calculateScore(
  scenario: SimScenario,
  allocation: SimAllocation[],
): SimScoreBreakdown {
  const totalAllocated = allocation.reduce((s, a) => s + a.allocated_kw, 0)

  const facilityScores: FacilityScore[] = scenario.facilities.map(f => {
    const alloc = allocation.find(a => a.facility_id === f.id)?.allocated_kw ?? 0
    const ratio  = f.demand_kw > 0 ? Math.min(1, alloc / f.demand_kw) : 0
    const base   = Math.round(ratio * f.priority)
    const bonus  = ratio >= 1 ? 5 : 0
    return { facility_id: f.id, points: base + bonus, ratio, full_bonus: bonus }
  })

  const overloadPenalty = totalAllocated > scenario.available_kw ? 20 : 0

  const transformerPenalties = scenario.transformers.reduce((pen, tx) => {
    const load = allocation
      .filter(a => a.transformer_id === tx.id)
      .reduce((s, a) => s + a.allocated_kw, 0)
    return pen + (load > tx.capacity_kw ? 10 : 0)
  }, 0)

  const waste = scenario.available_kw - totalAllocated
  const efficiencyBonus =
    totalAllocated <= scenario.available_kw && waste >= 0 && waste <= 5 ? 10 : 0

  const raw = facilityScores.reduce((s, f) => s + f.points, 0)
    - overloadPenalty - transformerPenalties + efficiencyBonus

  return {
    facility_scores: facilityScores,
    overload_penalty: overloadPenalty,
    transformer_penalties: transformerPenalties,
    efficiency_bonus: efficiencyBonus,
    total: Math.max(0, raw),
  }
}

export function maxPossibleScore(scenario: SimScenario): number {
  // Theoretical max (all facilities fully powered + bonuses) — not achievable in most scenarios
  return scenario.facilities.reduce((s, f) => s + f.priority + 5, 0) + 10
}

export function makeDefaultAllocation(scenario: SimScenario): SimAllocation[] {
  return scenario.facilities.map(f => ({
    facility_id: f.id,
    allocated_kw: 0,
    transformer_id: scenario.transformers[0]?.id,
  }))
}

export const makeDefaultSimState = (): SimState => ({
  phase: 'idle',
  scenario_id: SCENARIOS[0].id,
  timer_start: null,
  team_a_allocation: null,
  team_a_submitted: false,
  team_b_allocation: null,
  team_b_submitted: false,
  score_a: null,
  score_b: null,
})

// ── DB ────────────────────────────────────────────────────────────────────────

export async function getSimState(): Promise<SimState | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('fsc_match_state').select('data').eq('id', SIM_ID).maybeSingle()
  return (data?.data as SimState) ?? null
}

export async function saveSimState(state: SimState): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('fsc_match_state')
    .upsert({ id: SIM_ID, data: state, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

// ── Subscribe (viewer pages) ──────────────────────────────────────────────────

export function subscribeToSim(cb: (s: SimState) => void): { unsubscribe: () => void } {
  let lastSig = ''
  let destroyed = false

  const deliver = (s: SimState) => {
    if (destroyed) return
    const sig = JSON.stringify([s.phase, s.scenario_id, s.team_a_submitted, s.team_b_submitted, s.score_a?.total, s.score_b?.total, s.team_a_allocation, s.team_b_allocation])
    if (sig === lastSig) return
    lastSig = sig
    cb(s)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = (supabase.channel(SIM_CHANNEL) as any)
    .on('broadcast', { event: 'sim_state' }, (msg: { payload: SimState }) => deliver(msg.payload))
    .subscribe()

  const fetchAndDeliver = async () => {
    if (destroyed) return
    const s = await getSimState()
    if (s && !destroyed) deliver(s)
  }

  fetchAndDeliver()
  const poll = setInterval(fetchAndDeliver, 500)

  return {
    unsubscribe: () => {
      destroyed = true
      supabase.removeChannel(ch)
      clearInterval(poll)
    },
  }
}
