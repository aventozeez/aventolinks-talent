'use client'

import { useEffect, useRef, useState } from 'react'
import {
  MAP_W, MAP_H, R,
  NODES, INCIDENTS, RESOURCES, VEHICLE_PATHS,
  Deployment, EmergencyPhase,
  VEHICLE_TRAVEL_MS,
} from '@/lib/fsc-emergency'

// ── Path interpolation ─────────────────────────────────────────────────────
function interpolateAlongPath(path: [number, number][], t: number): [number, number] {
  if (!path.length) return [0, 0]
  if (t <= 0) return path[0]
  if (t >= 1) return path[path.length - 1]
  const segs: number[] = []
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
    segs.push(d); total += d
  }
  let rem = t * total
  for (let i = 0; i < segs.length; i++) {
    if (rem <= segs[i]) {
      const st = rem / segs[i]
      return [path[i][0] + st * (path[i + 1][0] - path[i][0]), path[i][1] + st * (path[i + 1][1] - path[i][1])]
    }
    rem -= segs[i]
  }
  return path[path.length - 1]
}

type VehicleState = { resource_id: string; icon: string; pos: [number, number]; arrived: boolean; color: string }

type Props = {
  deployments  : Deployment[]
  phase        : EmergencyPhase
  vehicleColor?: string   // hex color for this team's vehicles
  showFire    ?: boolean  // overlay fire animation on incident sites
}

export default function CityMap({ deployments, phase, vehicleColor = '#f5a623', showFire = true }: Props) {
  const [vehicles, setVehicles] = useState<VehicleState[]>([])
  const rafRef = useRef<number>()

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setVehicles(deployments.map(dep => {
        const res = RESOURCES.find(r => r.id === dep.resource_id)
        const inc = INCIDENTS.find(i => i.id === dep.incident_id)
        if (!res || !inc) return null
        const path = VEHICLE_PATHS[res.base]?.[inc.location]
        if (!path) return null
        const t   = Math.min(1, (now - dep.deployed_at) / VEHICLE_TRAVEL_MS)
        const pos = interpolateAlongPath(path, t)
        return { resource_id: res.id, icon: res.icon, pos, arrived: t >= 1, color: vehicleColor }
      }).filter(Boolean) as VehicleState[])
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [deployments, vehicleColor])

  const isLive = phase === 'active' || phase === 'revealed'

  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-full select-none">
      <style>{`
        @keyframes fireFlicker {
          0%,100%{ transform:scale(1)   translateY(0px);  }
          20%    { transform:scale(1.22) translateY(-4px); }
          40%    { transform:scale(0.9)  translateY(1px);  }
          60%    { transform:scale(1.18) translateY(-3px); }
          80%    { transform:scale(0.95) translateY(0px);  }
        }
        @keyframes smokeDrift {
          0%  { opacity:0.7; transform:translateY(0px)   scale(0.3); }
          100%{ opacity:0;   transform:translateY(-32px) scale(1.3); }
        }
        @keyframes incidentPulse {
          0%,100%{ opacity:0.25; r:34; }
          50%    { opacity:0.5;  r:42; }
        }
        @keyframes crashFlash {
          0%,100%{ transform:scale(1);    opacity:1;   }
          50%    { transform:scale(1.28); opacity:0.7; }
        }
        @keyframes arriveFlash {
          0%,100%{ transform:scale(1);   }
          33%    { transform:scale(1.45); }
          66%    { transform:scale(0.85); }
        }
        @keyframes warningBlink {
          0%,100%{ opacity:0.3; }
          50%    { opacity:0.7; }
        }
      `}</style>

      {/* Sky / background */}
      <defs>
        <radialGradient id="skyGrad" cx="50%" cy="0%" r="80%">
          <stop offset="0%"   stopColor="#1e3a5f" stopOpacity="1"/>
          <stop offset="100%" stopColor="#0f172a" stopOpacity="1"/>
        </radialGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="fireGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width={MAP_W} height={MAP_H} fill="url(#skyGrad)" rx="8"/>

      {/* ── City blocks ──────────────────────────────────────────── */}
      {[
        [100, 95, 155, 70],
        [300, 95, 155, 70],
        [100, 200, 155, 82],
        [300, 200,  85, 82],
        [428, 200,  30, 82],
        [100, 315, 155, 48],
        [300, 315, 155, 48],
      ].map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx="3" fill="#1e293b"/>
          <rect x={x} y={y} width={w} height={h} rx="3" fill="none" stroke="#334155" strokeWidth="0.8"/>
          {/* windows */}
          {Array.from({ length: Math.floor(w / 18) }).map((_, c) =>
            Array.from({ length: Math.floor(h / 14) }).map((_, r) => (
              <rect
                key={`${c}-${r}`}
                x={x + 6 + c * 18}
                y={y + 6 + r * 14}
                width="9" height="7" rx="1"
                fill={Math.random() > 0.4 ? '#fde68a' : '#0f172a'}
                opacity={0.5}
              />
            ))
          )}
        </g>
      ))}

      {/* ── Roads ────────────────────────────────────────────────── */}
      {/* Horizontal */}
      {[R.h1, R.h2, R.h3].map(y => (
        <g key={y}>
          <rect x="50" y={y - 14} width="460" height="28" fill="#1e2d3d" rx="2"/>
          <rect x="50" y={y - 14} width="460" height="28" fill="none" stroke="#2d4a6a" strokeWidth="0.5"/>
          <line x1="50" y1={y} x2="510" y2={y} stroke="#334155" strokeWidth="1.5" strokeDasharray="14,11" opacity={0.7}/>
        </g>
      ))}
      {/* Vertical */}
      {[R.v1, R.v2, R.v3].map(x => (
        <g key={x}>
          <rect x={x - 14} y="50" width="28" height="290" fill="#1e2d3d" rx="2"/>
          <rect x={x - 14} y="50" width="28" height="290" fill="none" stroke="#2d4a6a" strokeWidth="0.5"/>
          <line x1={x} y1="50" x2={x} y2="340" stroke="#334155" strokeWidth="1.5" strokeDasharray="14,11" opacity={0.7}/>
        </g>
      ))}
      {/* Sub-road to crash site */}
      <rect x={R.v4 - 14} y={R.h2 - 14} width="28" height="130" fill="#1e2d3d" rx="2"/>
      <line x1={R.v4} y1={R.h2} x2={R.v4} y2="310" stroke="#334155" strokeWidth="1.5" strokeDasharray="14,11" opacity={0.7}/>

      {/* ── Base stations ────────────────────────────────────────── */}
      {/* Police HQ */}
      <g transform={`translate(${R.v1},${R.h1})`}>
        <rect x="-28" y="-22" width="56" height="44" rx="6" fill="#1e3a8a"/>
        <rect x="-28" y="-22" width="56" height="44" rx="6" fill="none" stroke="#3b82f6" strokeWidth="1.5"/>
        <text textAnchor="middle" dominantBaseline="middle" y="2" fontSize="20">👮</text>
        <text textAnchor="middle" y="30" fontSize="6.5" fill="#93c5fd" fontWeight="bold" letterSpacing="0.5">POLICE HQ</text>
      </g>

      {/* Fire Station */}
      <g transform={`translate(${R.v1},${R.h3})`}>
        <rect x="-28" y="-22" width="56" height="44" rx="6" fill="#7f1d1d"/>
        <rect x="-28" y="-22" width="56" height="44" rx="6" fill="none" stroke="#ef4444" strokeWidth="1.5"/>
        <text textAnchor="middle" dominantBaseline="middle" y="2" fontSize="20">🚒</text>
        <text textAnchor="middle" y="30" fontSize="6" fill="#fca5a5" fontWeight="bold" letterSpacing="0.5">FIRE STATION</text>
      </g>

      {/* Hospital */}
      <g transform={`translate(${R.v3},${R.h1})`}>
        <rect x="-28" y="-22" width="56" height="44" rx="6" fill="#14532d"/>
        <rect x="-28" y="-22" width="56" height="44" rx="6" fill="none" stroke="#22c55e" strokeWidth="1.5"/>
        <text textAnchor="middle" dominantBaseline="middle" y="2" fontSize="20">🏥</text>
        <text textAnchor="middle" y="30" fontSize="6.5" fill="#86efac" fontWeight="bold" letterSpacing="0.5">HOSPITAL</text>
      </g>

      {/* ── Incident: Briefing warning markers ─────────────────── */}
      {phase === 'briefing' && (
        <>
          <circle cx={R.v2} cy={R.h2} r="38"  fill="#ef4444" style={{ animation: 'incidentPulse 1.2s ease-in-out infinite' }}/>
          <text x={R.v2} y={R.h2 + 6} textAnchor="middle" fontSize="26">⚠️</text>
          <circle cx={R.v4} cy={280}   r="30"  fill="#f59e0b" style={{ animation: 'incidentPulse 1.4s ease-in-out infinite', animationDelay: '0.3s' }}/>
          <text x={R.v4} y={280 + 6}  textAnchor="middle" fontSize="20">⚠️</text>
        </>
      )}

      {/* ── Incident: Building Fire ──────────────────────────────── */}
      {isLive && showFire && (
        <g transform={`translate(${R.v2},${R.h2})`} filter="url(#fireGlow)">
          {/* Glow rings */}
          <circle r="50" fill="#ef4444" opacity="0.08"/>
          <circle r="36" fill="#ef4444" opacity="0.12"/>
          {/* Building */}
          <rect x="-32" y="-26" width="64" height="52" rx="6" fill="#450a0a"/>
          <rect x="-32" y="-26" width="64" height="52" rx="6" fill="none" stroke="#ef4444" strokeWidth="2"/>
          {/* Smoke particles */}
          {[0, 1, 2, 3].map(i => (
            <circle key={i} cx={(i - 1.5) * 10} cy={-32} r={5 + i}
              fill={i % 2 === 0 ? '#64748b' : '#475569'}
              style={{
                animation: `smokeDrift ${1.1 + i * 0.3}s ease-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
          {/* Fire */}
          <text textAnchor="middle" y="8" fontSize="28"
            style={{ animation: 'fireFlicker 0.6s ease-in-out infinite', transformOrigin: 'center' }}>
            🔥
          </text>
          <text textAnchor="middle" y="34" fontSize="7" fill="#fca5a5" fontWeight="bold" letterSpacing="0.8">OFFICE BLOCK</text>
        </g>
      )}

      {/* ── Incident: Car Crash ──────────────────────────────────── */}
      {isLive && showFire && (
        <g transform={`translate(${R.v4},280)`}>
          <circle r="35" fill="#f59e0b" opacity="0.1"/>
          <rect x="-30" y="-24" width="60" height="48" rx="6" fill="#431407"/>
          <rect x="-30" y="-24" width="60" height="48" rx="6" fill="none" stroke="#f59e0b" strokeWidth="2"/>
          <text textAnchor="middle" y="8" fontSize="26"
            style={{ animation: 'crashFlash 1.1s ease-in-out infinite' }}>
            💥
          </text>
          <text textAnchor="middle" y="34" fontSize="7" fill="#fde68a" fontWeight="bold" letterSpacing="0.8">CRASH SITE</text>
        </g>
      )}

      {/* ── Vehicles ─────────────────────────────────────────────── */}
      {vehicles.map(v => (
        <g key={v.resource_id} transform={`translate(${v.pos[0]},${v.pos[1]})`} filter="url(#glow)">
          <circle r="15" fill={v.color} opacity="0.95"
            style={v.arrived ? { animation: 'arriveFlash 0.5s ease-in-out 3' } : {}}
          />
          <circle r="15" fill="none" stroke="white" strokeWidth="1" opacity="0.4"/>
          <text textAnchor="middle" y="5" fontSize="15">{v.icon}</text>
        </g>
      ))}

      {/* ── Idle overlay ────────────────────────────────────────── */}
      {phase === 'idle' && (
        <g>
          <rect width={MAP_W} height={MAP_H} fill="#0f172a" opacity="0.6" rx="8"/>
          <text x={MAP_W / 2} y={MAP_H / 2 - 16} textAnchor="middle" fontSize="40">🚨</text>
          <text x={MAP_W / 2} y={MAP_H / 2 + 20} textAnchor="middle" fontSize="16" fill="#94a3b8" fontWeight="bold">Waiting for briefing…</text>
        </g>
      )}
    </svg>
  )
}
