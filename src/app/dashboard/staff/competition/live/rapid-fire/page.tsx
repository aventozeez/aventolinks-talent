"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Zap,
  ChevronRight,
  RotateCcw,
  Trophy,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type GameState = "pool-select" | "round-setup" | "playing" | "session-done";

type Pool = {
  id: string;
  name: string;
  pool_number: number;
};

type Question = {
  id: string;
  question_text: string;
  answer_key: string;
  subject: string;
  difficulty: string;
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

export default function RapidFirePage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState>("pool-select");
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingPools, setLoadingPools] = useState(true);
  const [loadingQ, setLoadingQ] = useState(false);

  // Round setup
  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [questionsPerTeam, setQuestionsPerTeam] = useState(10);
  const [matchMode, setMatchMode] = useState(false);
  const [matchData, setMatchData] = useState<MatchData | null>(null);

  // Playing
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [currentTeam, setCurrentTeam] = useState<"A" | "B">("A");
  const [teamACount, setTeamACount] = useState(0);
  const [teamBCount, setTeamBCount] = useState(0);
  const [answered, setAnswered] = useState<("correct" | "skip" | null)[]>([]);
  const [showFeedback, setShowFeedback] = useState<"correct" | "skip" | null>(null);

  // Load pools and check for match session
  useEffect(() => {
    const raw = sessionStorage.getItem("sc_match");
    if (raw) {
      try {
        const md: MatchData = JSON.parse(raw);
        if (md.phase === "rf") {
          setMatchData(md);
          setMatchMode(true);
          setTeamAName(md.teamA.team_name);
          setTeamBName(md.teamB.team_name);
          // fetch pools by rfPoolIds and all their questions
          loadMatchPools(md.rfPoolIds);
          return;
        }
      } catch { /* ignore */ }
    }
    fetchPools();
  }, []);

  const fetchPools = useCallback(async () => {
    setLoadingPools(true);
    const { data } = await (supabase as any)
      .from("sc_question_pools")
      .select("id, name, pool_number")
      .eq("pool_type", "rapid_fire")
      .order("pool_number");
    setPools(data || []);
    setLoadingPools(false);
  }, []);

  const loadMatchPools = async (poolIds: string[]) => {
    setLoadingPools(true);
    const { data: poolData } = await (supabase as any)
      .from("sc_question_pools")
      .select("id, name, pool_number")
      .in("id", poolIds);
    setPools(poolData || []);

    // Get all questions from all pools
    const { data: pqData } = await (supabase as any)
      .from("sc_pool_questions")
      .select("question_id")
      .in("pool_id", poolIds);

    if (pqData && pqData.length > 0) {
      const qids = pqData.map((r: { question_id: string }) => r.question_id);
      const { data: qData } = await (supabase as any)
        .from("sc_questions")
        .select("*")
        .in("id", qids);
      setQuestions(shuffle(qData || []));
    }

    setLoadingPools(false);
    setGameState("round-setup");
  };

  const fetchPoolQuestions = useCallback(async (pool: Pool) => {
    setLoadingQ(true);
    const { data: pqData } = await (supabase as any)
      .from("sc_pool_questions")
      .select("question_id, order_index")
      .eq("pool_id", pool.id)
      .order("order_index");

    if (!pqData || pqData.length === 0) {
      setQuestions([]);
      setLoadingQ(false);
      return;
    }
    const qids = pqData.map((r: { question_id: string }) => r.question_id);
    const { data: qData } = await (supabase as any)
      .from("sc_questions")
      .select("*")
      .in("id", qids);
    setQuestions(qData || []);
    setLoadingQ(false);
  }, []);

  const selectPool = async (pool: Pool) => {
    setSelectedPool(pool);
    await fetchPoolQuestions(pool);
    setGameState("round-setup");
  };

  const beginRound = () => {
    const total = questionsPerTeam * 2;
    const qs = questions.slice(0, total);
    setQuestions(qs);
    setAnswered(new Array(qs.length).fill(null));
    setCurrentQIndex(0);
    setScoreA(0);
    setScoreB(0);
    setCurrentTeam("A");
    setTeamACount(0);
    setTeamBCount(0);
    setShowFeedback(null);
    setGameState("playing");
  };

  const handleAnswer = (result: "correct" | "skip") => {
    if (result === "correct") {
      if (currentTeam === "A") setScoreA((p) => p + 1);
      else setScoreB((p) => p + 1);
    }
    setAnswered((p) => p.map((v, i) => (i === currentQIndex ? result : v)));
    setShowFeedback(result);
    setTimeout(() => {
      setShowFeedback(null);
      advanceQuestion();
    }, 800);
  };

  const advanceQuestion = () => {
    const nextIndex = currentQIndex + 1;
    if (nextIndex >= questions.length) {
      setGameState("session-done");
      return;
    }
    // determine next team
    const aCount = currentTeam === "A" ? teamACount + 1 : teamACount;
    const bCount = currentTeam === "B" ? teamBCount + 1 : teamBCount;
    setTeamACount(aCount);
    setTeamBCount(bCount);

    let nextTeam: "A" | "B" = "A";
    if (aCount >= questionsPerTeam) nextTeam = "B";
    else if (bCount >= questionsPerTeam) nextTeam = "A";
    else nextTeam = currentTeam === "A" ? "B" : "A";

    setCurrentTeam(nextTeam);
    setCurrentQIndex(nextIndex);
  };

  const continueToMatch = () => {
    if (!matchData) return;
    const updated = { ...matchData, rfScores: [scoreA, scoreB], phase: "after-rf" };
    sessionStorage.setItem("sc_match", JSON.stringify(updated));
    router.push("/dashboard/staff/competition/live/match");
  };

  const totalQ = questions.length;
  const currentQ = questions[currentQIndex];
  const progressPct = totalQ > 0 ? ((currentQIndex) / totalQ) * 100 : 0;

  // ── Render ──

  if (loadingPools) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#f5a623]" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">
      {/* Header */}
      <div className="bg-[#060f1e] border-b border-[#f5a623]/20 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/staff/competition")} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <Zap className="text-[#f5a623]" size={22} />
        <div>
          <h1 className="text-lg font-bold">Rapid Fire Round</h1>
          {selectedPool && <p className="text-xs text-slate-400">Pool {selectedPool.pool_number}: {selectedPool.name}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">

        {/* ── Pool Select ── */}
        {gameState === "pool-select" && (
          <div className="w-full max-w-2xl">
            <h2 className="text-2xl font-bold text-center mb-2">Select a Pool</h2>
            <p className="text-slate-400 text-center text-sm mb-8">Choose the question pool for this Rapid Fire round</p>
            {pools.length === 0 ? (
              <div className="text-center text-slate-500 py-12">No rapid fire pools available. Create pools in the Competition Manager.</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {pools.map((pool) => (
                  <button
                    key={pool.id}
                    onClick={() => selectPool(pool)}
                    disabled={loadingQ}
                    className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-6 text-left hover:border-[#f5a623]/40 hover:bg-[#0d1f3c]/80 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#f5a623]/20 flex items-center justify-center mb-3 group-hover:bg-[#f5a623]/30 transition-colors">
                      <span className="text-[#f5a623] font-black text-lg">{pool.pool_number}</span>
                    </div>
                    <p className="font-bold text-white">{pool.name}</p>
                    <div className="flex items-center gap-1 mt-2 text-[#f5a623] text-sm">
                      <span>Select</span>
                      <ChevronRight size={14} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Round Setup ── */}
        {gameState === "round-setup" && (
          <div className="w-full max-w-lg">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8">
              {selectedPool && (
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#f5a623]/20 rounded-full text-[#f5a623] font-semibold text-sm mb-2">
                    <Zap size={14} />
                    Pool {selectedPool.pool_number}: {selectedPool.name}
                  </div>
                  <p className="text-sm text-slate-400">{questions.length} questions available</p>
                </div>
              )}
              {matchMode && (
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#f5a623]/20 rounded-full text-[#f5a623] font-semibold text-sm">
                    <Trophy size={14} />
                    Match Mode: {matchData?.teamA.team_name} vs {matchData?.teamB.team_name}
                  </div>
                </div>
              )}

              <h2 className="text-xl font-bold text-center mb-6">Round Setup</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Team A Name</label>
                  <input
                    value={teamAName}
                    onChange={(e) => setTeamAName(e.target.value)}
                    className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f5a623]"
                    disabled={matchMode}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Team B Name</label>
                  <input
                    value={teamBName}
                    onChange={(e) => setTeamBName(e.target.value)}
                    className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f5a623]"
                    disabled={matchMode}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Questions Per Team ({questionsPerTeam})</label>
                  <input
                    type="range"
                    min={5}
                    max={15}
                    value={questionsPerTeam}
                    onChange={(e) => setQuestionsPerTeam(Number(e.target.value))}
                    className="w-full accent-[#f5a623]"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>5</span><span>10</span><span>15</span>
                  </div>
                </div>
              </div>

              {questions.length < questionsPerTeam * 2 && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-400">
                  Only {questions.length} questions available. Adjust count or add more questions.
                </div>
              )}

              <button
                onClick={beginRound}
                disabled={questions.length === 0}
                className="w-full mt-6 py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Zap size={18} /> Begin Round →
              </button>

              {!matchMode && (
                <button onClick={() => setGameState("pool-select")} className="w-full mt-3 py-2.5 bg-white/5 text-slate-400 rounded-xl hover:bg-white/10 text-sm">
                  ← Back to Pool Select
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Playing ── */}
        {gameState === "playing" && currentQ && (
          <div className="w-full max-w-2xl flex flex-col gap-5">
            {/* Progress */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Q {currentQIndex + 1} of {totalQ}</span>
                <span>{Math.round(progressPct)}% complete</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#f5a623] transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {/* Whose turn */}
            <div className={`text-center py-2.5 rounded-xl text-sm font-semibold ${currentTeam === "A" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-purple-500/20 text-purple-300 border border-purple-500/30"}`}>
              {currentTeam === "A" ? teamAName : teamBName}&apos;s Turn
            </div>

            {/* Question Card */}
            <div className={`relative bg-[#0d1f3c] border-2 rounded-2xl p-8 text-center transition-colors ${showFeedback === "correct" ? "border-green-500 bg-green-900/20" : showFeedback === "skip" ? "border-red-500/50 bg-red-900/10" : "border-white/10"}`}>
              {showFeedback && (
                <div className={`absolute inset-0 flex items-center justify-center rounded-2xl ${showFeedback === "correct" ? "bg-green-500/20" : "bg-red-500/10"}`}>
                  {showFeedback === "correct" ? <CheckCircle className="text-green-400" size={64} /> : <XCircle className="text-red-400" size={64} />}
                </div>
              )}
              {currentQ.subject && <p className="text-xs text-[#f5a623]/70 uppercase tracking-wider mb-3">{currentQ.subject}</p>}
              <p className="text-xl font-semibold text-white leading-relaxed">{currentQ.question_text}</p>
              <p className="mt-4 text-sm text-slate-500 italic">Answer: {currentQ.answer_key}</p>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleAnswer("correct")}
                disabled={showFeedback !== null}
                className="py-4 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle size={20} /> Correct (+1)
              </button>
              <button
                onClick={() => handleAnswer("skip")}
                disabled={showFeedback !== null}
                className="py-4 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-slate-300 font-bold rounded-xl text-lg flex items-center justify-center gap-2 transition-colors"
              >
                <XCircle size={20} /> Skip
              </button>
            </div>

            {/* Scoreboard */}
            <div className="bg-[#060f1e] border border-white/10 rounded-2xl p-5">
              <h3 className="text-xs text-slate-400 uppercase tracking-wider text-center mb-4">Live Score</h3>
              <div className="grid grid-cols-3 gap-4 items-center">
                <div className={`text-center p-3 rounded-xl ${currentTeam === "A" ? "bg-blue-500/20 border border-blue-500/30" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 truncate">{teamAName}</p>
                  <p className="text-4xl font-black text-white mt-1">{scoreA}</p>
                </div>
                <div className="text-center text-slate-500 font-bold text-lg">VS</div>
                <div className={`text-center p-3 rounded-xl ${currentTeam === "B" ? "bg-purple-500/20 border border-purple-500/30" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 truncate">{teamBName}</p>
                  <p className="text-4xl font-black text-white mt-1">{scoreB}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Session Done ── */}
        {gameState === "session-done" && (
          <div className="w-full max-w-lg text-center">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8">
              <Trophy className="text-[#f5a623] mx-auto mb-4" size={56} />
              <h2 className="text-2xl font-bold mb-6">Round Complete!</h2>

              <div className="grid grid-cols-3 gap-4 mb-6 items-center">
                <div className={`p-4 rounded-xl ${scoreA > scoreB ? "bg-[#f5a623]/20 border-2 border-[#f5a623]" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamAName}</p>
                  <p className="text-4xl font-black">{scoreA}</p>
                </div>
                <div className="text-slate-500 font-bold">FINAL</div>
                <div className={`p-4 rounded-xl ${scoreB > scoreA ? "bg-[#f5a623]/20 border-2 border-[#f5a623]" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamBName}</p>
                  <p className="text-4xl font-black">{scoreB}</p>
                </div>
              </div>

              <div className={`py-3 px-5 rounded-xl text-sm font-semibold mb-6 ${scoreA > scoreB ? "bg-blue-500/20 text-blue-300" : scoreB > scoreA ? "bg-purple-500/20 text-purple-300" : "bg-white/10 text-slate-300"}`}>
                {scoreA === scoreB ? "🤝 It's a Tie!" : `🏆 ${scoreA > scoreB ? teamAName : teamBName} Wins!`}
              </div>

              {matchMode ? (
                <button onClick={continueToMatch} className="w-full py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2">
                  Continue Match → <ChevronRight size={18} />
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <button onClick={() => { setGameState("round-setup"); }} className="w-full py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2">
                    <RotateCcw size={16} /> Play Again
                  </button>
                  <button onClick={() => { setSelectedPool(null); setGameState("pool-select"); }} className="w-full py-2.5 bg-white/10 text-slate-300 rounded-xl hover:bg-white/20 text-sm">
                    ← Back to Pool Select
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
