"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Zap,
  Radio,
  Lightbulb,
  ChevronRight,
  Home,
  Star,
} from "lucide-react";

type MatchData = {
  teamA: { id: string; team_name: string };
  teamB: { id: string; team_name: string };
  phase: string;
  rfScores: number[];
  bzScores: number[];
  spScores: number[];
  rfPoolIds: string[];
  bzSetId: string;
  spSetId: string;
};

export default function MatchHubPage() {
  const router = useRouter();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("sc_match");
    if (!raw) {
      router.replace("/dashboard/staff/competition");
      return;
    }
    try {
      const md: MatchData = JSON.parse(raw);
      setMatch(md);
    } catch {
      router.replace("/dashboard/staff/competition");
    }
    setLoaded(true);
  }, [router]);

  const startBuzzer = () => {
    if (!match) return;
    const updated = { ...match, phase: "bz" };
    sessionStorage.setItem("sc_match", JSON.stringify(updated));
    router.push("/dashboard/staff/competition/live/buzzer");
  };

  const startSprint = () => {
    if (!match) return;
    const updated = { ...match, phase: "sp" };
    sessionStorage.setItem("sc_match", JSON.stringify(updated));
    router.push("/dashboard/staff/competition/live/sprint");
  };

  const endMatch = () => {
    sessionStorage.removeItem("sc_match");
    router.push("/dashboard/staff/competition");
  };

  if (!loaded || !match) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { teamA, teamB, phase, rfScores, bzScores, spScores } = match;
  const totalA = rfScores[0] + bzScores[0] + spScores[0];
  const totalB = rfScores[1] + bzScores[1] + spScores[1];

  const teamALabel = teamA.team_name;
  const teamBLabel = teamB.team_name;

  // ── After RF ──────────────────────────────────────────────────────────────

  if (phase === "after-rf") {
    return (
      <MatchHubLayout>
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#f5a623]/20 rounded-full text-[#f5a623] font-semibold text-sm mb-3">
              <Zap size={14} /> Rapid Fire Complete
            </div>
            <h1 className="text-2xl font-bold text-white">Round 1 Results</h1>
          </div>

          {/* RF Scores */}
          <ScoreCard
            title="Rapid Fire"
            icon={<Zap className="text-[#f5a623]" size={18} />}
            teamAName={teamALabel}
            teamBName={teamBLabel}
            scoreA={rfScores[0]}
            scoreB={rfScores[1]}
          />

          {/* Teams badge */}
          <TeamsBar teamA={teamALabel} teamB={teamBLabel} />

          <button
            onClick={startBuzzer}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg transition-colors shadow-lg shadow-blue-500/20"
          >
            <Radio size={20} /> Start Buzzer Round →
          </button>

          <button onClick={endMatch} className="w-full py-2.5 bg-white/5 text-slate-400 rounded-xl hover:bg-white/10 text-sm transition-colors flex items-center justify-center gap-2">
            <Home size={14} /> Return to Competition Manager
          </button>
        </div>
      </MatchHubLayout>
    );
  }

  // ── After Buzzer ──────────────────────────────────────────────────────────

  if (phase === "after-bz") {
    const cumA = rfScores[0] + bzScores[0];
    const cumB = rfScores[1] + bzScores[1];

    return (
      <MatchHubLayout>
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-full text-blue-400 font-semibold text-sm mb-3">
              <Radio size={14} /> Buzzer Round Complete
            </div>
            <h1 className="text-2xl font-bold text-white">Round 2 Results</h1>
          </div>

          {/* Individual round scores */}
          <div className="space-y-3">
            <ScoreCard
              title="Rapid Fire"
              icon={<Zap className="text-[#f5a623]" size={16} />}
              teamAName={teamALabel}
              teamBName={teamBLabel}
              scoreA={rfScores[0]}
              scoreB={rfScores[1]}
              compact
            />
            <ScoreCard
              title="Buzzer Round"
              icon={<Radio className="text-blue-400" size={16} />}
              teamAName={teamALabel}
              teamBName={teamBLabel}
              scoreA={bzScores[0]}
              scoreB={bzScores[1]}
              compact
            />
          </div>

          {/* Cumulative */}
          <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-2xl p-5">
            <p className="text-xs text-[#f5a623] uppercase tracking-wider text-center mb-4">Cumulative Totals</p>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className={`text-center p-3 rounded-xl ${cumA > cumB ? "bg-[#f5a623]/20 border border-[#f5a623]/40" : "bg-white/5"}`}>
                <p className="text-xs text-slate-400 truncate">{teamALabel}</p>
                <p className="text-3xl font-black text-white">{cumA}</p>
              </div>
              <div className="text-center text-slate-500 font-bold">TOTAL</div>
              <div className={`text-center p-3 rounded-xl ${cumB > cumA ? "bg-[#f5a623]/20 border border-[#f5a623]/40" : "bg-white/5"}`}>
                <p className="text-xs text-slate-400 truncate">{teamBLabel}</p>
                <p className="text-3xl font-black text-white">{cumB}</p>
              </div>
            </div>
            {cumA !== cumB && (
              <p className="text-center text-sm mt-3 text-[#f5a623]/70">
                {cumA > cumB ? teamALabel : teamBLabel} leads by {Math.abs(cumA - cumB)} point{Math.abs(cumA - cumB) !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          <TeamsBar teamA={teamALabel} teamB={teamBLabel} />

          <button
            onClick={startSprint}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg transition-colors shadow-lg shadow-purple-500/20"
          >
            <Lightbulb size={20} /> Start Innovation Sprint →
          </button>

          <button onClick={endMatch} className="w-full py-2.5 bg-white/5 text-slate-400 rounded-xl hover:bg-white/10 text-sm transition-colors flex items-center justify-center gap-2">
            <Home size={14} /> Return to Competition Manager
          </button>
        </div>
      </MatchHubLayout>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  if (phase === "done") {
    const winner = totalA > totalB ? teamALabel : totalB > totalA ? teamBLabel : null;

    return (
      <MatchHubLayout>
        <div className="max-w-lg w-full space-y-6">
          {/* Winner announcement */}
          <div className="bg-gradient-to-b from-[#f5a623]/20 to-[#0d1f3c] border border-[#f5a623]/30 rounded-2xl p-8 text-center">
            <Trophy className="text-[#f5a623] mx-auto mb-4" size={56} />
            <p className="text-xs text-[#f5a623] uppercase tracking-widest mb-2">Match Champion</p>
            {winner ? (
              <>
                <h1 className="text-3xl font-black text-white mb-1">{winner}</h1>
                <div className="mt-4 flex justify-center gap-2">
                  {[...Array(3)].map((_, i) => <Star key={i} className="text-[#f5a623] fill-[#f5a623]" size={24} />)}
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black text-white">It&apos;s a Tie!</h1>
                <p className="text-slate-400 text-sm mt-2">Both teams performed equally well</p>
              </>
            )}
          </div>

          {/* All round scores */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Round Breakdown</h2>
            <ScoreCard
              title="Rapid Fire"
              icon={<Zap className="text-[#f5a623]" size={16} />}
              teamAName={teamALabel}
              teamBName={teamBLabel}
              scoreA={rfScores[0]}
              scoreB={rfScores[1]}
              compact
            />
            <ScoreCard
              title="Buzzer Round"
              icon={<Radio className="text-blue-400" size={16} />}
              teamAName={teamALabel}
              teamBName={teamBLabel}
              scoreA={bzScores[0]}
              scoreB={bzScores[1]}
              compact
            />
            <ScoreCard
              title="Innovation Sprint"
              icon={<Lightbulb className="text-purple-400" size={16} />}
              teamAName={teamALabel}
              teamBName={teamBLabel}
              scoreA={spScores[0]}
              scoreB={spScores[1]}
              compact
            />
          </div>

          {/* Grand total */}
          <div className="bg-[#0a1628] border-2 border-[#f5a623]/40 rounded-2xl p-5">
            <p className="text-xs text-[#f5a623] uppercase tracking-wider text-center mb-4">Grand Total</p>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className={`text-center p-4 rounded-xl ${totalA >= totalB ? "bg-[#f5a623]/20 border border-[#f5a623]/50" : "bg-white/5"}`}>
                <p className="text-xs text-slate-400 truncate mb-1">{teamALabel}</p>
                <p className="text-4xl font-black text-white">{totalA}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500 font-bold text-lg">VS</p>
              </div>
              <div className={`text-center p-4 rounded-xl ${totalB >= totalA ? "bg-[#f5a623]/20 border border-[#f5a623]/50" : "bg-white/5"}`}>
                <p className="text-xs text-slate-400 truncate mb-1">{teamBLabel}</p>
                <p className="text-4xl font-black text-white">{totalB}</p>
              </div>
            </div>
          </div>

          <button
            onClick={endMatch}
            className="w-full py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-2xl hover:bg-[#e0941a] flex items-center justify-center gap-2 text-lg transition-colors"
          >
            <Home size={20} /> End Match & Return
          </button>
        </div>
      </MatchHubLayout>
    );
  }

  // Fallback redirect
  router.replace("/dashboard/staff/competition");
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MatchHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      <div className="bg-[#060f1e] border-b border-[#f5a623]/20 px-6 py-4 flex items-center gap-3">
        <Trophy className="text-[#f5a623]" size={22} />
        <div>
          <h1 className="text-lg font-bold">Match Hub</h1>
          <p className="text-xs text-slate-400">Scholars Challenge</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {children}
      </div>
    </div>
  );
}

function ScoreCard({
  title, icon, teamAName, teamBName, scoreA, scoreB, compact = false,
}: {
  title: string;
  icon: React.ReactNode;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  compact?: boolean;
}) {
  const aWins = scoreA > scoreB;
  const bWins = scoreB > scoreA;

  if (compact) {
    return (
      <div className="bg-[#0d1f3c] border border-white/10 rounded-xl px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          {icon} {title}
        </div>
        <div className="flex items-center gap-4">
          <span className={`font-bold text-sm ${aWins ? "text-[#f5a623]" : "text-slate-300"}`}>{teamAName}: {scoreA}</span>
          <span className="text-slate-600">|</span>
          <span className={`font-bold text-sm ${bWins ? "text-[#f5a623]" : "text-slate-300"}`}>{teamBName}: {scoreB}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-300">
        {icon} {title}
      </div>
      <div className="grid grid-cols-3 gap-4 items-center">
        <div className={`text-center p-3 rounded-xl ${aWins ? "bg-[#f5a623]/20 border border-[#f5a623]/40" : "bg-white/5"}`}>
          <p className="text-xs text-slate-400 truncate">{teamAName}</p>
          <p className="text-3xl font-black text-white">{scoreA}</p>
        </div>
        <div className="text-center text-slate-500 font-bold">VS</div>
        <div className={`text-center p-3 rounded-xl ${bWins ? "bg-[#f5a623]/20 border border-[#f5a623]/40" : "bg-white/5"}`}>
          <p className="text-xs text-slate-400 truncate">{teamBName}</p>
          <p className="text-3xl font-black text-white">{scoreB}</p>
        </div>
      </div>
    </div>
  );
}

function TeamsBar({ teamA, teamB }: { teamA: string; teamB: string }) {
  return (
    <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl px-5 py-4 flex items-center">
      <div className="flex-1 text-center">
        <p className="text-xs text-slate-400">Team A</p>
        <p className="font-bold text-white">{teamA}</p>
      </div>
      <div className="text-[#f5a623] font-black text-xl px-4">VS</div>
      <div className="flex-1 text-center">
        <p className="text-xs text-slate-400">Team B</p>
        <p className="font-bold text-white">{teamB}</p>
      </div>
    </div>
  );
}
