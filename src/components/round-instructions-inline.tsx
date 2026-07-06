import { RoundInfo } from '@/lib/round-info'

const toneMap = {
  green: 'text-green-300 border-green-400/40 bg-green-500/10',
  red:   'text-red-300   border-red-400/40   bg-red-500/10',
  amber: 'text-amber-300 border-amber-400/40 bg-amber-500/10',
  blue:  'text-blue-300  border-blue-400/40  bg-blue-500/10',
  slate: 'text-slate-200 border-slate-400/30 bg-slate-500/10',
} as const

/**
 * Compact instructions block sized to fit inside an existing audience layout —
 * no full-screen background of its own, no CTA buttons. Rules + scoring only.
 */
export default function RoundInstructionsInline({ info, footerHint }: {
  info: RoundInfo
  /** Small caption under the card, e.g. "Waiting for host to start…" */
  footerHint?: string
}) {
  return (
    <div className="w-full max-w-5xl mx-auto">
      <div
        className="rounded-3xl border p-6 md:p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
        style={{ borderColor: `${info.accent}44`, background: `linear-gradient(180deg, ${info.accent}10 0%, rgba(0,0,0,0.25) 100%)` }}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="text-6xl md:text-7xl leading-none drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]">{info.emoji}</div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em]" style={{ color: info.accent }}>
              {info.eyebrow}
            </p>
            <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">{info.title}</h1>
            <p className="text-sm md:text-lg text-white/70 mt-1">{info.tagline}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Rules */}
          <section className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-5 w-1.5 rounded-full" style={{ background: info.accent }} />
              <h2 className="text-sm md:text-base font-black uppercase tracking-widest">How it's played</h2>
            </div>
            <ol className="space-y-2.5">
              {info.rules.map((r, i) => (
                <li key={i} className="flex gap-3">
                  <span
                    className="mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black"
                    style={{ background: `${info.accent}25`, color: info.accent, border: `1px solid ${info.accent}55` }}>
                    {i + 1}
                  </span>
                  <p className="text-sm md:text-base leading-relaxed text-white/90">{r}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Scoring */}
          <aside className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-5 w-1.5 rounded-full" style={{ background: info.accent }} />
              <h2 className="text-sm md:text-base font-black uppercase tracking-widest">Scoring</h2>
            </div>
            <ul className="space-y-2">
              {info.scoring.map((line, i) => (
                <li key={i} className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${toneMap[line.tone ?? 'slate']}`}>
                  <span className="text-xs md:text-sm font-semibold">{line.label}</span>
                  <span className="text-base md:text-lg font-black tabular-nums">{line.value}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      {footerHint && (
        <p className="text-center text-slate-400 text-sm mt-5 italic">{footerHint}</p>
      )}
    </div>
  )
}
