import { supabase } from './supabase'

export const EMRG_CHANNEL     = 'fsc-emergency'
export const EMRG_ID          = 'emrg_state'
export const EMRG_DURATION_MS = 3 * 60 * 1000   // 3-minute round
export const VEHICLE_TRAVEL_MS = 4_500           // how long a vehicle takes to arrive

export type EmergencyPhase = 'idle' | 'briefing' | 'active' | 'revealed'
export type ResourceType   = 'fire_truck' | 'ambulance' | 'police'

// ── Map constants ──────────────────────────────────────────────────────────
export const MAP_W = 560
export const MAP_H = 380

// Road grid coordinates
export const R = { h1: 80, h2: 185, h3: 305, v1: 80, v2: 280, v3: 480, v4: 410 }

// ── Domain types ───────────────────────────────────────────────────────────
export type Deployment = {
  resource_id : string
  incident_id : string
  deployed_at : number   // absolute Date.now() timestamp
}

export type Incident = {
  id       : string
  location : string        // node id
  label    : string
  icon     : string
  required : ResourceType[]
  points   : number        // max base points for THIS incident
}

export type ResourceUnit = {
  id   : string
  type : ResourceType
  base : string   // node id of home base
  icon : string
  label: string
}

export type MapNode = {
  id    : string
  name  : string
  x     : number
  y     : number
  icon  : string
  color : string
}

// ── Scenario data ──────────────────────────────────────────────────────────
export const NODES: MapNode[] = [
  { id: 'police_hq',    name: 'Police HQ',    x: R.v1, y: R.h1, icon: '👮', color: '#1d4ed8' },
  { id: 'fire_station', name: 'Fire Station', x: R.v1, y: R.h3, icon: '🚒', color: '#b91c1c' },
  { id: 'hospital',     name: 'Hospital',     x: R.v3, y: R.h1, icon: '🏥', color: '#15803d' },
  { id: 'fire_site',    name: 'Office Block', x: R.v2, y: R.h2, icon: '🔥', color: '#7f1d1d' },
  { id: 'crash_site',   name: 'Crash Site',   x: R.v4, y: 280,  icon: '💥', color: '#78350f' },
]

export const INCIDENTS: Incident[] = [
  {
    id: 'fire_incident', location: 'fire_site',
    label: 'Building Fire', icon: '🔥',
    required: ['fire_truck', 'ambulance'],
    points: 50,
  },
  {
    id: 'crash_incident', location: 'crash_site',
    label: 'Road Crash', icon: '💥',
    required: ['ambulance', 'police'],
    points: 40,
  },
]

export const RESOURCES: ResourceUnit[] = [
  { id: 'ft1',  type: 'fire_truck', base: 'fire_station', icon: '🚒', label: 'Fire Truck 1' },
  { id: 'ft2',  type: 'fire_truck', base: 'fire_station', icon: '🚒', label: 'Fire Truck 2' },
  { id: 'amb1', type: 'ambulance',  base: 'hospital',     icon: '🚑', label: 'Ambulance 1' },
  { id: 'amb2', type: 'ambulance',  base: 'hospital',     icon: '🚑', label: 'Ambulance 2' },
  { id: 'pol1', type: 'police',     base: 'police_hq',    icon: '🚔', label: 'Police Car 1' },
  { id: 'pol2', type: 'police',     base: 'police_hq',    icon: '🚔', label: 'Police Car 2' },
]

// Road-following waypoints for each base → incident location
export const VEHICLE_PATHS: Record<string, Record<string, [number, number][]>> = {
  fire_station: {
    fire_site:  [[R.v1, R.h3], [R.v1, R.h2], [R.v2, R.h2]],
    crash_site: [[R.v1, R.h3], [R.v4, R.h3], [R.v4, 280]],
  },
  hospital: {
    fire_site:  [[R.v3, R.h1], [R.v3, R.h2], [R.v2, R.h2]],
    crash_site: [[R.v3, R.h1], [R.v3, R.h2], [R.v4, R.h2], [R.v4, 280]],
  },
  police_hq: {
    fire_site:  [[R.v1, R.h1], [R.v1, R.h2], [R.v2, R.h2]],
    crash_site: [[R.v1, R.h1], [R.v2, R.h1], [R.v4, R.h1], [R.v4, 280]],
  },
}

// ── Scoring ────────────────────────────────────────────────────────────────
export type IncidentScore = {
  incident_id : string
  base_pts    : number
  time_bonus  : number
  total       : number
}

export type EmergencyScore = {
  incident_scores : IncidentScore[]
  coverage_bonus  : number
  total           : number
}

export function calculateScore(
  deployments : Deployment[],
  timer_start : number,
): EmergencyScore {
  const incident_scores: IncidentScore[] = []
  let allCovered = true

  for (const inc of INCIDENTS) {
    const deps = deployments.filter(d => d.incident_id === inc.id)
    let base_pts = 0
    let time_bonus = 0
    let incidentCovered = false

    for (const reqType of inc.required) {
      const match = deps.find(d => RESOURCES.find(r => r.id === d.resource_id)?.type === reqType)
      if (match) {
        base_pts += Math.round(inc.points / inc.required.length)
        incidentCovered = true
        const elapsed = match.deployed_at - timer_start
        if      (elapsed < 30_000)  time_bonus += 15
        else if (elapsed < 60_000)  time_bonus += 10
        else if (elapsed < 90_000)  time_bonus += 5
        else if (elapsed < 120_000) time_bonus += 2
      }
    }

    if (!incidentCovered) allCovered = false
    incident_scores.push({ incident_id: inc.id, base_pts, time_bonus, total: base_pts + time_bonus })
  }

  const coverage_bonus = allCovered ? 20 : 0
  const total = incident_scores.reduce((s, i) => s + i.total, 0) + coverage_bonus
  return { incident_scores, coverage_bonus, total }
}

// ── State ──────────────────────────────────────────────────────────────────
export type EmergencyState = {
  phase              : EmergencyPhase
  timer_start        : number | null
  team_a_deployments : Deployment[]
  team_b_deployments : Deployment[]
  team_a_submitted   : boolean
  team_b_submitted   : boolean
  score_a            : EmergencyScore | null
  score_b            : EmergencyScore | null
}

export function defaultEmergencyState(): EmergencyState {
  return {
    phase: 'idle', timer_start: null,
    team_a_deployments: [], team_b_deployments: [],
    team_a_submitted: false, team_b_submitted: false,
    score_a: null, score_b: null,
  }
}

export async function getEmergencyState(): Promise<EmergencyState | null> {
  const { data } = await supabase
    .from('fsc_match_state').select('state').eq('id', EMRG_ID).single()
  return (data?.state as EmergencyState) ?? null
}

export async function saveEmergencyState(s: EmergencyState): Promise<void> {
  await supabase.from('fsc_match_state').upsert({ id: EMRG_ID, state: s }, { onConflict: 'id' })
}

export function subscribeToEmergency(cb: (s: EmergencyState) => void): { unsubscribe: () => void } {
  let alive = true
  let lastJson = ''

  const poll = async () => {
    const s = await getEmergencyState()
    const effective = s ?? defaultEmergencyState()   // always fire, even when no DB row yet
    const j = JSON.stringify(effective)
    if (j !== lastJson) { lastJson = j; if (alive) cb(effective) }
  }

  poll()
  const iv = setInterval(poll, 600)

  const ch = supabase.channel(EMRG_CHANNEL)
  ch.on('broadcast', { event: 'emrg_state' }, ({ payload }) => {
    if (alive) cb(payload as EmergencyState)
  }).subscribe()

  return {
    unsubscribe: () => { alive = false; clearInterval(iv); supabase.removeChannel(ch) },
  }
}

export function broadcastEmergency(s: EmergencyState) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ch = (supabase.channel(EMRG_CHANNEL) as any)
  ch.send({ type: 'broadcast', event: 'emrg_state', payload: s })
}
