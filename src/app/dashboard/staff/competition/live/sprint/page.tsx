"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Lightbulb,
  CheckCircle,
  XCircle,
  Trophy,
  ArrowLeft,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type GameState = "problem-select" | "playing" | "match-result";

type SprintProblem = {
  id: string;
  title: string;
  statement: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  step5: string;
};

type StepResult = {
  team: "A" | "B" | null;
  result: "correct" | "wrong" | null;
};

type ProblemScore = {
  problemId: string;
  title: string;
  scoreA: number;
  scoreB: number;
};

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

export default function SprintPage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState>("problem-select");
  const [problems, setProblems] = useState<SprintProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchMode, setMatchMode] = useState(false);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [setName, setSetName] = useState("");

  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");

  // Playing state
  const [currentProblem, setCurrentProblem] = useState<SprintProblem | null>(null);
  const [stepResults, setStepResults] = useState<StepResult[]>(Array(5).fill({ team: null, result: null }));
  const [completedProblems, setCompletedProblems] = useState<ProblemScore[]>([]);

  // Total scores across all problems
  const [totalScoreA, setTotalScoreA] = useState(0);
  const [totalScoreB, setTotalScoreB] = useState(0);

  useEffect(() => {
    const raw = sessionStorage.getItem("sc_match");
    if (raw) {
      try {
        const md: MatchData = JSON.parse(raw);
        if (md.phase === "sp") {
          setMatchData(md);
          setMatchMode(true);
          setTeamAName(md.teamA.team_name);
          setTeamBName(md.teamB.team_name);
          loadSet(md.spSetId);
          return;
        }
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const loadSet = useCallback(async (setId: string) => {
    setLoading(true);
    const { data: setData } = await (supabase as any)
      .from("sc_question_pools")
      .select("name, problem_ids")
      .eq("id", setId)
      .single();

    if (setData) {
      setSetName(setData.name);
      if (setData.problem_ids) {
        try {
          const ids: string[] = JSON.parse(setData.problem_ids);
          if (ids.length > 0) {
            const { data: pData } = await (supabase as any)
              .from("sc_sprint_problems")
              .select("*")
              .in("id", ids);
            setProblems(pData || []);
          }
        } catch { /* ignore */ }
      }
    }
    setLoading(false);
    setGameState("problem-select");
  }, []);

  const selectProblem = (problem: SprintProblem) => {
    setCurrentProblem(problem);
    setStepResults(Array(5).fill({ team: null, result: null }));
    setGameState("playing");
  };

  const getSteps = (p: SprintProblem) => [p.step1, p.step2, p.step3, p.step4, p.step5];

  const handleStep = (stepIdx: number, team: "A" | "B", result: "correct" | "wrong") => {
    setStepResults((prev) => prev.map((r, i) => i === stepIdx ? { team, result } : r));
    if (result === "correct") {
      if (team === "A") setTotalScoreA((p) => p + 1);
      else setTotalScoreB((p) => p + 1);
    }
  };

  const problemScoreA = stepResults.filter((r) => r.team === "A" && r.result === "correct").length;
  const problemScoreB = stepResults.filter((r) => r.team === "B" && r.result === "correct").length;

  const completeProblem = () => {
    if (!currentProblem) return;
    setCompletedProblems((p) => [...p, {
      problemId: currentProblem.id,
      title: currentProblem.title,
      scoreA: problemScoreA,
      scoreB: problemScoreB,
    }]);
    setCurrentProblem(null);
    setStepResults(Array(5).fill({ team: null, result: null }));
    setGameState("problem-select");
  };

  const endSprint = () => {
    if (currentProblem) {
      setCompletedProblems((p) => [...p, {
        problemId: currentProblem.id,
        title: currentProblem.title,
        scoreA: problemScoreA,
        scoreB: problemScoreB,
      }]);
    }
    setGameState("match-result");
  };

  const continueMatch = () => {
    if (!matchData) return;
    const updated = { ...matchData, spScores: [totalScoreA, totalScoreB], phase: "done" };
    sessionStorage.setItem("sc_match", JSON.stringify(updated));
    router.push("/dashboard/staff/competition/live/match");
  };

  const remainingProblems = problems.filter(
    (p) => !completedProblems.some((cp) => cp.problemId === p.id) && p.id !== currentProblem?.id
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#f5a623]" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      {/* Header */}
      <div className="bg-[#060f1e] border-b border-purple-500/20 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/staff/competition")} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <Lightbulb className="text-purple-400" size={22} />
        <div>
          <h1 className="text-lg font-bold">Innovation Sprint</h1>
          {setName && <p className="text-xs text-slate-400">{setName}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-8">

        {/* ── Problem Select ── */}
        {gameState === "problem-select" && (
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold">
                  {completedProblems.length > 0 ? "Select Next Problem" : "Select Starting Problem"}
                </h2>
                <p className="text-sm text-slate-400 mt-1">{problems.length} problems available</p>
              </div>
              {matchMode && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f5a623]/10 rounded-full text-[#f5a623] text-xs font-semibold">
                  <Trophy size={12} /> Match Mode
                </div>
              )}
            </div>

            {/* Completed problems summary */}
            {completedProblems.length > 0 && (
              <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-4 mb-5">
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Completed Problems</h3>
                <div className="space-y-2">
                  {completedProblems.map((cp, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <span className="text-sm text-white">{cp.title}</span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-blue-400">{teamAName}: {cp.scoreA}</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-purple-400">{teamBName}: {cp.scoreB}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Running totals */}
            {completedProblems.length > 0 && (
              <div className="bg-[#060f1e] border border-white/10 rounded-2xl p-4 mb-5">
                <div className="grid grid-cols-3 gap-4 items-center text-center">
                  <div>
                    <p className="text-xs text-slate-400">{teamAName}</p>
                    <p className="text-2xl font-black text-blue-400">{totalScoreA}</p>
                  </div>
                  <div className="text-slate-500 text-sm">Running Total</div>
                  <div>
                    <p className="text-xs text-slate-400">{teamBName}</p>
                    <p className="text-2xl font-black text-purple-400">{totalScoreB}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Available problems */}
            {remainingProblems.length === 0 && completedProblems.length > 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">All problems completed!</p>
                <button onClick={endSprint} className="px-6 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a]">
                  View Final Results
                </button>
              </div>
            ) : remainingProblems.length === 0 && completedProblems.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No sprint problems available in this set.</div>
            ) : (
              <div className="space-y-3">
                {remainingProblems.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectProblem(p)}
                    className="w-full bg-[#0d1f3c] border border-white/10 rounded-2xl p-5 text-left hover:border-purple-500/40 hover:bg-[#0d1f3c]/80 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-white group-hover:text-purple-300 transition-colors">{p.title}</h3>
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{p.statement}</p>
                        <p className="text-xs text-purple-400/70 mt-2">{getSteps(p).filter(Boolean).length} steps defined</p>
                      </div>
                      <ChevronRight className="text-purple-400 shrink-0 mt-1 group-hover:translate-x-1 transition-transform" size={20} />
                    </div>
                  </button>
                ))}
                {completedProblems.length > 0 && (
                  <button onClick={endSprint} className="w-full mt-2 py-3 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl font-semibold hover:bg-purple-500/30 transition-colors">
                    End Sprint & View Results
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Playing ── */}
        {gameState === "playing" && currentProblem && (
          <div className="w-full max-w-2xl flex flex-col gap-5">
            {/* Problem card */}
            <div className="bg-[#0d1f3c] border border-purple-500/30 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded-full border border-purple-500/30">Sprint Problem</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-3">{currentProblem.title}</h2>
              <p className="text-slate-300 text-sm leading-relaxed">{currentProblem.statement}</p>
            </div>

            {/* Current problem scores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">{teamAName}</p>
                <p className="text-2xl font-black text-blue-400">{problemScoreA}</p>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">{teamBName}</p>
                <p className="text-2xl font-black text-purple-400">{problemScoreB}</p>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              {getSteps(currentProblem).map((step, i) => {
                if (!step) return null;
                const res = stepResults[i];
                const answered = res.result !== null;
                return (
                  <div key={i} className={`bg-[#0d1f3c] border rounded-2xl p-5 transition-colors ${answered ? (res.result === "correct" ? "border-green-500/40 bg-green-900/10" : "border-red-500/30 bg-red-900/5") : "border-white/10"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${answered ? (res.result === "correct" ? "bg-green-500 text-white" : "bg-red-500 text-white") : "bg-white/10 text-slate-400"}`}>
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs text-slate-400 mb-0.5">Step {i + 1}</p>
                            <p className="text-sm text-white font-medium">{step}</p>
                          </div>
                          {answered && (
                            <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${res.result === "correct" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                              {res.result === "correct" ? <CheckCircle size={12} /> : <XCircle size={12} />}
                              {res.team === "A" ? teamAName : teamBName}
                            </div>
                          )}
                        </div>

                        {!answered && (
                          <div className="mt-3">
                            <p className="text-xs text-slate-500 mb-2">Which team answered?</p>
                            <div className="grid grid-cols-2 gap-2">
                              {(["A", "B"] as const).map((team) => (
                                <div key={team} className="flex gap-1.5">
                                  <button
                                    onClick={() => handleStep(i, team, "correct")}
                                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${team === "A" ? "bg-blue-600/80 hover:bg-blue-500 text-white" : "bg-purple-600/80 hover:bg-purple-500 text-white"}`}
                                  >
                                    {team === "A" ? teamAName : teamBName}<br />
                                    <span className="text-[10px] opacity-80">Correct (+1)</span>
                                  </button>
                                  <button
                                    onClick={() => handleStep(i, team, "wrong")}
                                    className="px-2 py-2 rounded-xl bg-red-900/30 border border-red-500/20 text-red-400 hover:bg-red-900/50 transition-colors"
                                    title={`${team === "A" ? teamAName : teamBName} Wrong`}
                                  >
                                    <XCircle size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={completeProblem}
                className="flex-1 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2"
              >
                Next Problem <ChevronRight size={18} />
              </button>
              <button
                onClick={endSprint}
                className="px-5 py-3 bg-white/10 text-slate-300 rounded-xl hover:bg-white/20 text-sm font-semibold"
              >
                End Sprint
              </button>
            </div>
          </div>
        )}

        {/* ── Match Result ── */}
        {gameState === "match-result" && (
          <div className="w-full max-w-2xl">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8">
              <Trophy className="text-purple-400 mx-auto mb-4" size={56} />
              <h2 className="text-2xl font-bold text-center mb-6">Innovation Sprint Complete!</h2>

              {/* Per-problem breakdown */}
              {completedProblems.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Problem Breakdown</h3>
                  <div className="space-y-2">
                    {completedProblems.map((cp, i) => (
                      <div key={i} className="bg-[#060f1e] rounded-xl px-4 py-3 flex items-center justify-between">
                        <span className="text-sm text-white">{cp.title}</span>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-blue-400 font-semibold">{cp.scoreA}</span>
                          <span className="text-slate-500">vs</span>
                          <span className="text-purple-400 font-semibold">{cp.scoreB}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final totals */}
              <div className="grid grid-cols-3 gap-4 mb-6 items-center">
                <div className={`p-4 rounded-xl text-center ${totalScoreA > totalScoreB ? "bg-blue-500/20 border-2 border-blue-400" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamAName}</p>
                  <p className="text-4xl font-black text-blue-400">{totalScoreA}</p>
                </div>
                <div className="text-slate-500 font-bold text-center">TOTAL</div>
                <div className={`p-4 rounded-xl text-center ${totalScoreB > totalScoreA ? "bg-purple-500/20 border-2 border-purple-400" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamBName}</p>
                  <p className="text-4xl font-black text-purple-400">{totalScoreB}</p>
                </div>
              </div>

              <div className={`py-3 px-5 rounded-xl text-sm font-semibold text-center mb-6 ${totalScoreA > totalScoreB ? "bg-blue-500/20 text-blue-300" : totalScoreB > totalScoreA ? "bg-purple-500/20 text-purple-300" : "bg-white/10 text-slate-300"}`}>
                {totalScoreA === totalScoreB ? "🤝 Sprint Tie!" : `🏆 ${totalScoreA > totalScoreB ? teamAName : teamBName} Wins the Sprint!`}
              </div>

              {matchMode ? (
                <button onClick={continueMatch} className="w-full py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2">
                  Continue → Final Results <ChevronRight size={18} />
                </button>
              ) : (
                <button onClick={() => { setGameState("problem-select"); setCompletedProblems([]); setTotalScoreA(0); setTotalScoreB(0); }} className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500">
                  Play Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
