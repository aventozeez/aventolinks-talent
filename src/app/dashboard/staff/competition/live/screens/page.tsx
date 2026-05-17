'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, ExternalLink, Check } from 'lucide-react'

type LinkItem = {
  label: string
  sublabel: string
  path: string
  icon: string
  color: 'slate' | 'blue' | 'purple' | 'green'
}

type RoundSection = {
  title: string
  emoji: string
  accent: string
  links: LinkItem[]
}

const BASE = '/dashboard/staff/competition/live'

const ROUNDS: RoundSection[] = [
  {
    title: 'Rapid Fire Round',
    emoji: '⚡',
    accent: 'border-yellow-500/30 bg-yellow-500/5',
    links: [
      { label: 'Admin Control', sublabel: 'Manage questions — keep on this device', path: `${BASE}/rapid-fire/`, icon: '🎛️', color: 'slate' },
      { label: 'Audience Display', sublabel: 'Projector / big screen', path: `${BASE}/rapid-fire/display/`, icon: '📺', color: 'slate' },
      { label: 'Team A Screen', sublabel: 'Same view as Audience — open on Team A laptop', path: `${BASE}/rapid-fire/display/`, icon: '🔵', color: 'blue' },
      { label: 'Team B Screen', sublabel: 'Same view as Audience — open on Team B laptop', path: `${BASE}/rapid-fire/display/`, icon: '🟣', color: 'purple' },
    ],
  },
  {
    title: 'Buzzer Round',
    emoji: '🔔',
    accent: 'border-blue-500/30 bg-blue-500/5',
    links: [
      { label: 'Admin Control', sublabel: 'Manage buzzes & scoring', path: `${BASE}/buzzer/`, icon: '🎛️', color: 'slate' },
      { label: 'Audience Display', sublabel: 'Projector / big screen', path: `${BASE}/buzzer/display/`, icon: '📺', color: 'slate' },
      { label: 'Team A Screen', sublabel: 'Team A buzzer laptop', path: `${BASE}/buzzer/team-a/`, icon: '🔵', color: 'blue' },
      { label: 'Team B Screen', sublabel: 'Team B buzzer laptop', path: `${BASE}/buzzer/team-b/`, icon: '🟣', color: 'purple' },
    ],
  },
  {
    title: 'Innovation Sprint',
    emoji: '💡',
    accent: 'border-purple-500/30 bg-purple-500/5',
    links: [
      { label: 'Admin Control', sublabel: 'Manage problems & reveal', path: `${BASE}/sprint/`, icon: '🎛️', color: 'slate' },
      { label: 'Audience Display', sublabel: 'Projector / big screen', path: `${BASE}/sprint/display/`, icon: '📺', color: 'slate' },
      { label: 'Team A Screen', sublabel: 'Team A drag-and-drop laptop', path: `${BASE}/sprint/team-a/`, icon: '🔵', color: 'blue' },
      { label: 'Team B Screen', sublabel: 'Team B drag-and-drop laptop', path: `${BASE}/sprint/team-b/`, icon: '🟣', color: 'purple' },
    ],
  },
]

const colorClasses = {
  slate: { label: 'text-slate-200', border: 'border-white/15', bg: 'bg-white/5' },
  blue:  { label: 'text-blue-300',  border: 'border-blue-500/30',   bg: 'bg-blue-500/10' },
  purple:{ label: 'text-purple-300',border: 'border-purple-500/30', bg: 'bg-purple-500/10' },
  green: { label: 'text-green-300', border: 'border-green-500/30',  bg: 'bg-green-500/10' },
}

export default function ScreenHubPage() {
  const router = useRouter()
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const copy = (path: string) => {
    const url = typeof window !== 'undefined' ? window.location.origin + path : path
    navigator.clipboard.writeText(url).then(() => {
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(null), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-[#040c18] text-white">
      {/* Header */}
      <div className="bg-[#060f1e] border-b border-white/10 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => router.push('/dashboard/staff/competition')}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-base font-bold text-white">Competition Screens</h1>
          <p className="text-xs text-slate-500">Open each link on the correct device before starting</p>
        </div>
      </div>

      {/* Instructions banner */}
      <div className="mx-4 mt-4 mb-2 px-4 py-3 bg-[#f5a623]/10 border border-[#f5a623]/20 rounded-xl text-sm text-[#f5a623]">
        💡 <strong>Tip:</strong> Open this page on the admin laptop. Use <strong>Copy</strong> to send each link to the right device, or use <strong>Open</strong> to launch it in a new tab on this machine.
      </div>

      {/* Rounds */}
      <div className="px-4 py-4 space-y-6 max-w-2xl mx-auto">
        {ROUNDS.map(round => (
          <div key={round.title} className={`border rounded-2xl overflow-hidden ${round.accent}`}>
            {/* Round header */}
            <div className="px-5 py-3 flex items-center gap-2 border-b border-white/10">
              <span className="text-2xl">{round.emoji}</span>
              <h2 className="text-base font-black text-white">{round.title}</h2>
            </div>

            {/* Links */}
            <div className="divide-y divide-white/5">
              {round.links.map(link => {
                const c = colorClasses[link.color]
                const isCopied = copiedPath === link.path + round.title // unique key per round
                return (
                  <div key={link.label} className={`flex items-center gap-3 px-5 py-3 ${c.bg}`}>
                    <span className="text-xl flex-shrink-0 w-8 text-center">{link.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${c.label} truncate`}>{link.label}</p>
                      <p className="text-xs text-slate-500 truncate">{link.sublabel}</p>
                    </div>
                    <button
                      onClick={() => window.open(link.path, '_blank')}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-semibold rounded-lg transition flex-shrink-0"
                    >
                      <ExternalLink size={11} /> Open
                    </button>
                    <button
                      onClick={() => {
                        const url = typeof window !== 'undefined' ? window.location.origin + link.path : link.path
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedPath(link.path + round.title)
                          setTimeout(() => setCopiedPath(null), 2000)
                        })
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition flex-shrink-0 ${
                        copiedPath === link.path + round.title
                          ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                          : 'bg-white/10 hover:bg-white/20 text-slate-300'
                      }`}
                    >
                      {copiedPath === link.path + round.title
                        ? <><Check size={11} /> Copied!</>
                        : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Note about RF team screens */}
        <p className="text-xs text-slate-600 text-center pb-4">
          In Rapid Fire, all team screens show the same audience display — teams watch together while the admin controls the questions.
        </p>
      </div>
    </div>
  )
}
