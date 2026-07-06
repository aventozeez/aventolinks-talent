'use client'

export type AdjustTeam = {
  label: string
  score: number
  colour: string   // hex for the team label
  onAdjust: (delta: number) => void
}

const DELTAS = [1, 5, 10] as const

export function PointAdjustRow({ label, score, colour, onAdjust }: AdjustTeam) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold truncate" style={{ color: colour }}>{label}</p>
        <p className="text-2xl font-black text-white tabular-nums">{score}</p>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {DELTAS.map(d => (
          <button key={`m${d}`} onClick={() => onAdjust(-d)}
            className="rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-black py-1.5 hover:bg-red-500/25 transition-colors">
            −{d}
          </button>
        ))}
        {DELTAS.map(d => (
          <button key={`p${d}`} onClick={() => onAdjust(d)}
            className="rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 text-xs font-black py-1.5 hover:bg-green-500/25 transition-colors">
            +{d}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function PointAdjuster({ teams, note }: { teams: AdjustTeam[]; note?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">Manual score adjust</p>
        <p className="text-[10px] text-slate-500">Broadcasts instantly</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {teams.map(t => <PointAdjustRow key={t.label} {...t} />)}
      </div>
      {note && <p className="text-[10px] text-slate-500 italic">{note}</p>}
    </div>
  )
}
