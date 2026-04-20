"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Radio,
  CheckCircle,
  XCircle,
  Trophy,
  ArrowLeft,
  Loader2,
  ChevronRight,
} from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type GameState = "question-setup" | "playing" | "match-done";

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

const BUZZ_TIME = 5;

export default function BuzzerPage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState>("question-setup");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchMode, setMatchMode] = useState(false);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [setName, setSetName] = useState("");

  // Setup
  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");

  // Playing
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [buzzedTeam, setBuzzedTeam] = useState<"A" | "B" | null>(null);
  const [countdown, setCountdown] = useState(BUZZ_TIME);
  const [countdownActive, setCountdownActive] = useState(false);
  const [questionResult, setQuestionResult] = useState<"correct" | "wrong" | null>(null);
  const [wrongTeam, setWrongTeam] = useState<"A" | "B" | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("sc_match");
    if (raw) {
      try {
        const md: MatchData = JSON.parse(raw);
        if (md.phase === "bz") {
          setMatchData(md);
          setMatchMode(true);
          setTeamAName(md.teamA.team_name);
          setTeamBName(md.teamB.team_name);
          loadSet(md.bzSetId);
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
      .select("name")
      .eq("id", setId)
      .single();
    if (setData) setSetName(setData.name);

    const { data: pqData } = await (supabase as any)
      .from("sc_pool_questions")
      .select("question_id, order_index")
      .eq("pool_id", setId)
      .order("order_index");

    if (pqData && pqData.length > 0) {
      const qids = pqData.map((r: { question_id: string }) => r.question_id);
      const { data: qData } = await (supabase as any)
        .from("sc_questions")
        .select("*")
        .in("id", qids);
      setQuestions(qData || []);
    }
    setLoading(false);
    setGameState("question-setup");
  }, []);

  const beginRound = () => {
    setCurrentQIndex(0);
    setScoreA(0);
    setScoreB(0);
    setBuzzedTeam(null);
    setCountdownActive(false);
    setCountdown(BUZZ_TIME);
    setQuestionResult(null);
    setWrongTeam(null);
    setGameState("playing");
  };

  const handleBuzz = (team: "A" | "B") => {
    if (buzzedTeam) return;
    setBuzzedTeam(team);
    setCountdown(BUZZ_TIME);
    setCountdownActive(true);
  };

  useEffect(() => {
    if (!countdownActive) return;
    intervalRef.current = setInterval(() => {
      setCountdown((p) => {
        if (p <= 1) {
          clearInterval(intervalRef.current!);
          setCountdownActive(false);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [countdownActive]);

  const handleResult = (result: "correct" | "wrong") => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCountdownActive(false);
    if (result === "correct") {
      if (buzzedTeam === "A") setScoreA((p) => p + 1);
      else if (buzzedTeam === "B") setScoreB((p) => p + 1);
      setQuestionResult("correct");
    } else {
      setWrongTeam(buzzedTeam);
      setQuestionResult("wrong");
    }
  };

  const nextQuestion = () => {
    const next = currentQIndex + 1;
    if (next >= questions.length) {
      setGameState("match-done");
      return;
    }
    setCurrentQIndex(next);
    setBuzzedTeam(null);
    setCountdown(BUZZ_TIME);
    setCountdownActive(false);
    setQuestionResult(null);
    setWrongTeam(null);
  };

  const continueSprint = () => {
    if (!matchData) return;
    const updated = { ...matchData, bzScores: [scoreA, scoreB], phase: "after-bz" };
    sessionStorage.setItem("sc_match", JSON.stringify(updated));
    router.push("/dashboard/staff/competition/live/match");
  };

  const currentQ = questions[currentQIndex];
  const totalQ = questions.length;

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
      <div className="bg-[#060f1e] border-b border-blue-500/20 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/staff/competition")} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
          <ArrowLeft size={18} />
        </button>
        <Radio className="text-blue-400" size={22} />
        <div>
          <h1 className="text-lg font-bold">Buzzer Round</h1>
          {setName && <p className="text-xs text-slate-400">{setName}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">

        {/* ── Question Setup ── */}
        {gameState === "question-setup" && (
          <div className="w-full max-w-lg">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-full text-blue-400 font-semibold text-sm mb-2">
                  <Radio size={14} />
                  {setName || "Buzzer Set"}
                </div>
                <p className="text-sm text-slate-400">{totalQ} questions loaded</p>
                {matchMode && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-[#f5a623]/10 rounded-full text-[#f5a623] text-xs font-semibold">
                    <Trophy size={12} />
                    Match Mode
                  </div>
                )}
              </div>

              <h2 className="text-xl font-bold text-center mb-6">Round Setup</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Team A Name</label>
                  <input
                    value={teamAName}
                    onChange={(e) => setTeamAName(e.target.value)}
                    className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-400"
                    disabled={matchMode}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Team B Name</label>
                  <input
                    value={teamBName}
                    onChange={(e) => setTeamBName(e.target.value)}
                    className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-400"
                    disabled={matchMode}
                  />
                </div>
              </div>

              {questions.length === 0 && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                  No questions in this set. Add questions in the Competition Manager.
                </div>
              )}

              <button
                onClick={beginRound}
                disabled={questions.length === 0}
                className="w-full mt-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Radio size={18} /> Begin Buzzer Round →
              </button>
            </div>
          </div>
        )}

        {/* ── Playing ── */}
        {gameState === "playing" && currentQ && (
          <div className="w-full max-w-2xl flex flex-col gap-5">
            {/* Progress */}
            <div className="flex justify-between text-sm text-slate-400">
              <span>Question {currentQIndex + 1} / {totalQ}</span>
              <span className="flex items-center gap-2">
                <span className="text-blue-400 font-semibold">{teamAName}: {scoreA}</span>
                <span>|</span>
                <span className="text-purple-400 font-semibold">{teamBName}: {scoreB}</span>
              </span>
            </div>

            {/* Question Card */}
            <div className={`bg-[#0d1f3c] border-2 rounded-2xl p-8 text-center transition-colors ${questionResult === "correct" ? "border-green-500 bg-green-900/10" : questionResult === "wrong" ? "border-red-500/50" : buzzedTeam ? "border-[#f5a623]/50" : "border-white/10"}`}>
              {currentQ.subject && <p className="text-xs text-blue-400/70 uppercase tracking-wider mb-3">{currentQ.subject}</p>}
              <p className="text-xl font-semibold text-white leading-relaxed">{currentQ.question_text}</p>

              {buzzedTeam && (
                <div className={`mt-4 px-4 py-2 rounded-xl text-sm font-semibold inline-block ${buzzedTeam === "A" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>
                  {buzzedTeam === "A" ? teamAName : teamBName} buzzed in!
                </div>
              )}

              {questionResult && (
                <div className="mt-3 text-slate-500 text-sm italic">Answer: {currentQ.answer_key}</div>
              )}
            </div>

            {/* Countdown circle */}
            {buzzedTeam && !questionResult && (
              <div className="flex justify-center">
                <CountdownCircle value={countdown} max={BUZZ_TIME} />
              </div>
            )}

            {/* Wrong team indicator */}
            {questionResult === "wrong" && wrongTeam && (
              <div className={`text-center py-2 px-4 rounded-xl text-sm font-semibold bg-red-500/10 border border-red-500/30 text-red-400`}>
                ✗ {wrongTeam === "A" ? teamAName : teamBName} answered incorrectly
              </div>
            )}

            {/* Buzz buttons (before buzz) */}
            {!buzzedTeam && (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleBuzz("A")}
                  className="py-8 bg-blue-600 hover:bg-blue-500 text-white font-black text-2xl rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                >
                  BUZZ!<br /><span className="text-sm font-normal">{teamAName}</span>
                </button>
                <button
                  onClick={() => handleBuzz("B")}
                  className="py-8 bg-purple-600 hover:bg-purple-500 text-white font-black text-2xl rounded-2xl shadow-lg shadow-purple-500/20 transition-all active:scale-95"
                >
                  BUZZ!<br /><span className="text-sm font-normal">{teamBName}</span>
                </button>
              </div>
            )}

            {/* Result buttons (after buzz, before result) */}
            {buzzedTeam && !questionResult && (
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => handleResult("correct")} className="py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                  <CheckCircle size={18} /> Correct ✓
                </button>
                <button onClick={() => handleResult("wrong")} className="py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                  <XCircle size={18} /> Wrong ✗
                </button>
                <button onClick={nextQuestion} className="py-3 bg-white/10 hover:bg-white/20 text-slate-300 font-bold rounded-xl">
                  Next →
                </button>
              </div>
            )}

            {/* After result: next button */}
            {questionResult && (
              <button onClick={nextQuestion} className="w-full py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2">
                Next Question → <ChevronRight size={18} />
              </button>
            )}

            {/* Live scoreboard */}
            <div className="bg-[#060f1e] border border-white/10 rounded-2xl p-5">
              <h3 className="text-xs text-slate-400 uppercase tracking-wider text-center mb-4">Score</h3>
              <div className="grid grid-cols-3 gap-4 items-center">
                <div className={`text-center p-3 rounded-xl ${buzzedTeam === "A" ? "bg-blue-500/20 border border-blue-500/30" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 truncate">{teamAName}</p>
                  <p className="text-4xl font-black text-white mt-1">{scoreA}</p>
                </div>
                <div className="text-center text-slate-500 font-bold">VS</div>
                <div className={`text-center p-3 rounded-xl ${buzzedTeam === "B" ? "bg-purple-500/20 border border-purple-500/30" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 truncate">{teamBName}</p>
                  <p className="text-4xl font-black text-white mt-1">{scoreB}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Match Done ── */}
        {gameState === "match-done" && (
          <div className="w-full max-w-lg text-center">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8">
              <Trophy className="text-blue-400 mx-auto mb-4" size={56} />
              <h2 className="text-2xl font-bold mb-6">Buzzer Round Complete!</h2>

              <div className="grid grid-cols-3 gap-4 mb-6 items-center">
                <div className={`p-4 rounded-xl ${scoreA > scoreB ? "bg-blue-500/20 border-2 border-blue-400" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamAName}</p>
                  <p className="text-4xl font-black">{scoreA}</p>
                </div>
                <div className="text-slate-500 font-bold">FINAL</div>
                <div className={`p-4 rounded-xl ${scoreB > scoreA ? "bg-purple-500/20 border-2 border-purple-400" : "bg-white/5"}`}>
                  <p className="text-xs text-slate-400 mb-1 truncate">{teamBName}</p>
                  <p className="text-4xl font-black">{scoreB}</p>
                </div>
              </div>

              <div className={`py-3 px-5 rounded-xl text-sm font-semibold mb-6 ${scoreA > scoreB ? "bg-blue-500/20 text-blue-300" : scoreB > scoreA ? "bg-purple-500/20 text-purple-300" : "bg-white/10 text-slate-300"}`}>
                {scoreA === scoreB ? "🤝 It's a Tie!" : `🏆 ${scoreA > scoreB ? teamAName : teamBName} Wins!`}
              </div>

              {matchMode ? (
                <button onClick={continueSprint} className="w-full py-3 bg-[#f5a623] text-[#0a1628] font-bold rounded-xl hover:bg-[#e0941a] flex items-center justify-center gap-2">
                  Continue → Innovation Sprint <ChevronRight size={18} />
                </button>
              ) : (
                <button onClick={() => setGameState("question-setup")} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500">
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

function CountdownCircle({ value, max }: { value: number; max: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / max) * circumference;
  const isRed = value <= 2;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke={isRed ? "#ef4444" : "#f5a623"}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <span className={`text-3xl font-black ${isRed ? "text-red-400" : "text-[#f5a623]"}`}>{value}</span>
    </div>
  );
}
