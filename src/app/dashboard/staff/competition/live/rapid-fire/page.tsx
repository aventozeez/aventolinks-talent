"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Zap, CheckCircle, XCircle, SkipForward, Trophy,
  Monitor, ArrowLeft, Loader2, Play, ChevronRight, RotateCcw,
} from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── constants ───────────────────────────────────────────────────────────────
export const RF_LIVE_KEY = "sc_rf_live_v2";
const TIMER_MS   = 60_000;   // 60 seconds per team
const TOTAL_QS   = 10;       // questions in starting pool
const PTS        = 10;       // points per correct answer

// ─── types ───────────────────────────────────────────────────────────────────
type Phase = "setup" | "playing-a" | "break" | "playing-b" | "done";

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

export type RFDisplayState = {
  phase: Phase;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  timerStartedAt: number | null;
  timerDuration: number;
  currentQuestion: string;
  currentSubject: string;
  correctCount: number;   // how many answered correctly this turn
  queueLength: number;    // questions still in play (shrinks on correct, stays on wrong/pass)
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RapidFireAdminPage() {
  const router = useRouter();

  // ── data ──────────────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(true);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [matchMode, setMatchMode] = useState(false);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]); // full pool

  // ── game state ────────────────────────────────────────────────────────────
  const [teamAName, setTeamAName]   = useState("Team A");
  const [teamBName, setTeamBName]   = useState("Team B");
  const [phase,     setPhase]       = useState<Phase>("setup");
  const [queue,     setQueue]       = useState<Question[]>([]);  // active queue, [0] is current
  const [correctCount, setCorrectCount] = useState(0);           // correct this turn
  const [scoreA,    setScoreA]      = useState(0);
  const [scoreB,    setScoreB]      = useState(0);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [remaining, setRemaining]   = useState(60);
  const [flash,     setFlash]       = useState<"correct" | "wrong" | "pass" | null>(null);

  // ── refs (stale-closure safety — mutated synchronously in event handlers) ─
  const phaseRef          = useRef<Phase>("setup");
  const queueRef          = useRef<Question[]>([]);
  const correctCountRef   = useRef(0);
  const scoreARef         = useRef(0);
  const scoreBRef         = useRef(0);
  const timerStartedAtRef = useRef<number | null>(null);
  const teamARef          = useRef("Team A");
  const teamBRef          = useRef("Team B");
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef          = useRef(false);

  useEffect(() => { phaseRef.current        = phase;        }, [phase]);
  useEffect(() => { queueRef.current        = queue;        }, [queue]);
  useEffect(() => { correctCountRef.current = correctCount; }, [correctCount]);
  useEffect(() => { scoreARef.current       = scoreA;       }, [scoreA]);
  useEffect(() => { scoreBRef.current       = scoreB;       }, [scoreB]);
  useEffect(() => { teamARef.current        = teamAName;    }, [teamAName]);
  useEffect(() => { teamBRef.current        = teamBName;    }, [teamBName]);
  useEffect(() => { timerStartedAtRef.current = timerStartedAt; }, [timerStartedAt]);

  // ── load questions ────────────────────────────────────────────────────────
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
          teamARef.current = md.teamA.team_name;
          teamBRef.current = md.teamB.team_name;
          loadMatchPools(md.rfPoolIds);
          return;
        }
      } catch { /* ignore */ }
    }
    loadAllRF();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMatchPools = async (poolIds: string[]) => {
    setLoading(true);
    const { data: pq } = await (supabase as any)
      .from("sc_pool_questions").select("question_id").in("pool_id", poolIds);
    if (pq?.length) {
      const { data: qs } = await (supabase as any)
        .from("sc_questions").select("*").in("id", pq.map((r: any) => r.question_id));
      setAllQuestions(shuffle((qs ?? []) as Question[]).slice(0, TOTAL_QS));
    }
    setLoading(false);
  };

  const loadAllRF = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("sc_questions").select("*").eq("round_type", "rapid_fire");
    setAllQuestions(shuffle((data ?? []) as Question[]).slice(0, TOTAL_QS));
    setLoading(false);
  };

  // ── write display state to localStorage + BroadcastChannel ──────────────
  const writeDisplay = useCallback((
    p: Phase, q: Question[], correct: number, sA: number, sB: number, tsa: number | null
  ) => {
    const state: RFDisplayState = {
      phase:           p,
      teamAName:       teamARef.current,
      teamBName:       teamBRef.current,
      scoreA:          sA,
      scoreB:          sB,
      timerStartedAt:  tsa,
      timerDuration:   TIMER_MS,
      currentQuestion: q[0]?.question_text ?? "",
      currentSubject:  q[0]?.subject        ?? "",
      correctCount:    correct,
      queueLength:     q.length,
    };
    const json = JSON.stringify(state);
    localStorage.setItem(RF_LIVE_KEY, json);
    // Instant push to any open display tabs via BroadcastChannel
    try {
      const bc = new BroadcastChannel(RF_LIVE_KEY);
      bc.postMessage(json);
      bc.close();
    } catch { /* not supported in this env */ }
  }, []);

  // ── timer ─────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const endTurn = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    stopTimer();
    const newPhase: Phase = phaseRef.current === "playing-a" ? "break" : "done";
    phaseRef.current = newPhase;
    setPhase(newPhase);
    setTimerStartedAt(null);
    timerStartedAtRef.current = null;
    writeDisplay(newPhase, [], correctCountRef.current, scoreARef.current, scoreBRef.current, null);
  }, [stopTimer, writeDisplay]);

  useEffect(() => {
    stopTimer();
    if (!timerStartedAt) { setRemaining(60); return; }
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - timerStartedAt;
      const rem = Math.max(0, Math.ceil((TIMER_MS - elapsed) / 1000));
      setRemaining(rem);
      if (rem === 0) endTurn();
    }, 100);
    return () => stopTimer();
  }, [timerStartedAt, stopTimer, endTurn]);

  // ── game actions ──────────────────────────────────────────────────────────
  const freshQueue = () => shuffle([...allQuestions]).slice(0, TOTAL_QS);

  const startTeamA = () => {
    endedRef.current = false;
    const q = freshQueue();
    const now = Date.now();
    setQueue(q);          queueRef.current        = q;
    setCorrectCount(0);   correctCountRef.current = 0;
    setScoreA(0);         scoreARef.current       = 0;
    setScoreB(0);         scoreBRef.current       = 0;
    setRemaining(60);
    setPhase("playing-a"); phaseRef.current       = "playing-a";
    setTimerStartedAt(now); timerStartedAtRef.current = now;
    writeDisplay("playing-a", q, 0, 0, 0, now);
  };

  const startTeamB = () => {
    endedRef.current = false;
    const q = freshQueue();
    const now = Date.now();
    setQueue(q);          queueRef.current        = q;
    setCorrectCount(0);   correctCountRef.current = 0;
    setScoreB(0);         scoreBRef.current       = 0;
    setRemaining(60);
    setPhase("playing-b"); phaseRef.current       = "playing-b";
    setTimerStartedAt(now); timerStartedAtRef.current = now;
    writeDisplay("playing-b", q, 0, scoreARef.current, 0, now);
  };

  const doFlash = (kind: "correct" | "wrong" | "pass") => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 280);
  };

  const handleCorrect = () => {
    if (endedRef.current) return;
    doFlash("correct");
    const isA   = phaseRef.current === "playing-a";
    const newSA = isA ? scoreARef.current + PTS : scoreARef.current;
    const newSB = isA ? scoreBRef.current       : scoreBRef.current + PTS;
    if (isA) { setScoreA(newSA); scoreARef.current = newSA; }
    else      { setScoreB(newSB); scoreBRef.current = newSB; }

    // Remove answered question from the front
    const newQ = queueRef.current.slice(1);
    const newCorrect = correctCountRef.current + 1;
    queueRef.current        = newQ;
    correctCountRef.current = newCorrect;
    setQueue(newQ);
    setCorrectCount(newCorrect);

    if (newQ.length === 0) {
      // All questions answered correctly — end turn immediately
      endTurn();
    } else {
      writeDisplay(phaseRef.current, newQ, newCorrect, newSA, newSB, timerStartedAtRef.current);
    }
  };

  const handleWrong = () => {
    if (endedRef.current) return;
    doFlash("wrong");
    // Move current question to the back — it will reappear
    const cur = queueRef.current;
    const newQ = cur.length > 1 ? [...cur.slice(1), cur[0]] : cur;
    queueRef.current = newQ;
    setQueue(newQ);
    writeDisplay(
      phaseRef.current, newQ, correctCountRef.current,
      scoreARef.current, scoreBRef.current, timerStartedAtRef.current
    );
  };

  const handlePass = () => {
    if (endedRef.current) return;
    doFlash("pass");
    // Same as wrong — move to back
    const cur = queueRef.current;
    const newQ = cur.length > 1 ? [...cur.slice(1), cur[0]] : cur;
    queueRef.current = newQ;
    setQueue(newQ);
    writeDisplay(
      phaseRef.current, newQ, correctCountRef.current,
      scoreARef.current, scoreBRef.current, timerStartedAtRef.current
    );
  };

  const continueToMatch = () => {
    if (!matchData) return;
    const updated = { ...matchData, rfScores: [scoreA, scoreB], phase: "after-rf" };
    sessionStorage.setItem("sc_match", JSON.stringify(updated));
    router.push("/dashboard/staff/competition/live/match");
  };

  const openDisplay = () =>
    window.open("/dashboard/staff/competition/live/rapid-fire/display/", "_blank", "noopener");

  // ── derived ───────────────────────────────────────────────────────────────
  const isPlaying   = phase === "playing-a" || phase === "playing-b";
  const currentQ    = queue[0];
  const activeTeam  = phase === "playing-b" ? teamBName : teamAName;
  const activeScore = phase === "playing-b" ? scoreB    : scoreA;
  const teamColor   = phase === "playing-b" ? "#60a5fa" : "#f5a623";
  const timerPct    = remaining / 60;
  const timerColor  = remaining > 20 ? "#22c55e" : remaining > 10 ? "#f5a623" : "#ef4444";

  // ─── loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <Loader2 className="animate-spin text-[#f5a623]" size={40} />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col">

      {/* ── Header ── */}
      <div className="bg-[#060f1e] border-b border-[#f5a623]/20 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/staff/competition")}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </button>
          <Zap className="text-[#f5a623]" size={22} />
          <div>
            <h1 className="text-lg font-bold">Rapid Fire — Admin</h1>
            <p className="text-xs text-slate-400">
              {allQuestions.length} questions · +{PTS} pts correct · wrong/pass recycles
            </p>
          </div>
        </div>
        <button onClick={openDisplay}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-lg text-sm hover:bg-blue-600/30 transition-colors font-semibold">
          <Monitor size={14} /> Open Participant Display
        </button>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl space-y-5">

          {/* ══ SETUP ══════════════════════════════════════════════════════ */}
          {phase === "setup" && (
            <>
              <div className="text-center">
                <h2 className="text-2xl font-bold">Rapid Fire Round</h2>
                <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                  Each team has <strong className="text-white">60 seconds</strong> to answer as many of the{" "}
                  <strong className="text-white">{TOTAL_QS} questions</strong> as possible.
                  <br />+{PTS} pts for correct · wrong &amp; pass recycle back into the queue.
                </p>
              </div>

              <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-6 space-y-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Team A Name</label>
                  <input value={teamAName} onChange={e => setTeamAName(e.target.value)}
                    disabled={matchMode}
                    className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f5a623] disabled:opacity-60" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Team B Name</label>
                  <input value={teamBName} onChange={e => setTeamBName(e.target.value)}
                    disabled={matchMode}
                    className="w-full bg-[#060f1e] border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f5a623] disabled:opacity-60" />
                </div>
              </div>

              {allQuestions.length < TOTAL_QS && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-sm text-yellow-400">
                  ⚠ Only {allQuestions.length} question{allQuestions.length !== 1 ? "s" : ""} loaded (need {TOTAL_QS}).
                </div>
              )}

              <button onClick={startTeamA} disabled={allQuestions.length === 0}
                className="w-full py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-2xl hover:bg-[#e0941a] disabled:opacity-50 flex items-center justify-center gap-2 text-lg transition-colors">
                <Play size={20} /> Start — Team A Goes First
              </button>
            </>
          )}

          {/* ══ PLAYING ════════════════════════════════════════════════════ */}
          {isPlaying && currentQ && (
            <>
              {/* Scoreboard + timer row */}
              <div className="grid grid-cols-3 gap-3 items-stretch">
                <div className="col-span-2 bg-[#0d1f3c] border border-white/10 rounded-2xl p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Now Answering</p>
                  <p className="text-xl font-black mt-0.5" style={{ color: teamColor }}>{activeTeam}</p>
                  <p className="text-5xl font-black text-white leading-none mt-1">
                    {activeScore}
                    <span className="text-base font-normal text-slate-400 ml-1.5">pts</span>
                  </p>
                  {phase === "playing-b" && (
                    <p className="text-xs text-slate-600 mt-1">{teamAName}: {scoreA} pts</p>
                  )}
                </div>

                <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black tabular-nums leading-none"
                    style={{ color: timerColor }}>{remaining}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">secs</span>
                  <div className="w-full mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-200"
                      style={{ width: `${timerPct * 100}%`, backgroundColor: timerColor }} />
                  </div>
                </div>
              </div>

              {/* Correct count + queue status */}
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-green-400 font-bold">
                  ✓ {correctCount} correct
                </span>
                <span className="text-slate-500">
                  {queue.length} question{queue.length !== 1 ? "s" : ""} in queue
                </span>
              </div>

              {/* Question card */}
              <div className={`bg-[#0d1f3c] border-2 rounded-2xl p-6 transition-all duration-150 ${
                flash === "correct" ? "border-green-500 bg-green-900/20 scale-[1.01]" :
                flash === "wrong"   ? "border-red-500/60 bg-red-900/10 scale-[0.99]"  :
                flash === "pass"    ? "border-yellow-500/40"                            :
                "border-white/10"
              }`}>
                {currentQ.subject && (
                  <p className="text-xs text-[#f5a623]/60 uppercase tracking-wider mb-3">{currentQ.subject}</p>
                )}
                <p className="text-xl font-semibold text-white leading-relaxed">{currentQ.question_text}</p>

                {/* Answer — admin only */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Answer (admin only)</p>
                  <p className="text-lg font-bold text-[#f5a623]">{currentQ.answer_key}</p>
                </div>
              </div>

              {/* Control buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button onClick={handleCorrect}
                  className="py-5 bg-green-600 hover:bg-green-500 active:scale-95 text-white font-black rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all shadow-lg shadow-green-500/20">
                  <CheckCircle size={26} />
                  <span className="text-base">CORRECT</span>
                  <span className="text-xs font-normal opacity-75">+{PTS} pts</span>
                </button>
                <button onClick={handleWrong}
                  className="py-5 bg-red-600/80 hover:bg-red-600 active:scale-95 text-white font-black rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all">
                  <XCircle size={26} />
                  <span className="text-base">WRONG</span>
                  <span className="text-xs font-normal opacity-75">recycles ↩</span>
                </button>
                <button onClick={handlePass}
                  className="py-5 bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 font-black rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all border border-white/10">
                  <SkipForward size={26} />
                  <span className="text-base">PASS</span>
                  <span className="text-xs font-normal opacity-75">recycles ↩</span>
                </button>
              </div>

              <button onClick={endTurn}
                className="w-full py-2.5 bg-white/5 text-slate-500 hover:text-slate-300 rounded-xl hover:bg-white/10 text-sm border border-white/5 transition-colors">
                End Turn Early
              </button>
            </>
          )}

          {/* ══ BREAK — Team A done, Team B about to start ══════════════════ */}
          {phase === "break" && (
            <>
              <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8 text-center">
                <div className="text-5xl mb-3">⏱️</div>
                <p className="text-slate-400 text-lg">Time&apos;s Up —</p>
                <p className="text-2xl font-black text-[#f5a623] mb-4">{teamAName}</p>
                <p className="text-8xl font-black text-white leading-none">{scoreA}</p>
                <p className="text-slate-500 mt-2">points scored</p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 text-center">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Next Up</p>
                <p className="text-2xl font-black text-blue-400">{teamBName}</p>
                <p className="text-slate-500 text-sm mt-1">60 seconds · wrong &amp; pass recycle</p>
              </div>

              <button onClick={startTeamB}
                className="w-full py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-2xl hover:bg-[#e0941a] text-lg flex items-center justify-center gap-2 transition-colors">
                Start — {teamBName} <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* ══ DONE ════════════════════════════════════════════════════════ */}
          {phase === "done" && (
            <>
              <div className="bg-gradient-to-b from-[#f5a623]/20 to-[#0d1f3c] border border-[#f5a623]/30 rounded-2xl p-8 text-center">
                <Trophy className="text-[#f5a623] mx-auto mb-4" size={48} />
                <h2 className="text-2xl font-bold mb-6">Rapid Fire Complete!</h2>

                <div className="grid grid-cols-3 gap-4 items-center mb-6">
                  <div className={`p-4 rounded-xl text-center border-2 ${
                    scoreA > scoreB ? "bg-[#f5a623]/20 border-[#f5a623]" : "bg-white/5 border-transparent"
                  }`}>
                    <p className="text-xs text-slate-400 truncate mb-1">{teamAName}</p>
                    <p className="text-4xl font-black">{scoreA}</p>
                    {scoreA > scoreB && <p className="text-xs text-[#f5a623] mt-1">🏆 Wins</p>}
                  </div>
                  <div className="text-slate-500 font-bold text-center text-sm">FINAL<br />SCORE</div>
                  <div className={`p-4 rounded-xl text-center border-2 ${
                    scoreB > scoreA ? "bg-[#f5a623]/20 border-[#f5a623]" : "bg-white/5 border-transparent"
                  }`}>
                    <p className="text-xs text-slate-400 truncate mb-1">{teamBName}</p>
                    <p className="text-4xl font-black">{scoreB}</p>
                    {scoreB > scoreA && <p className="text-xs text-[#f5a623] mt-1">🏆 Wins</p>}
                  </div>
                </div>

                <p className="font-semibold text-[#f5a623] text-lg">
                  {scoreA === scoreB
                    ? "🤝 It's a Tie!"
                    : `🏆 ${scoreA > scoreB ? teamAName : teamBName} Wins the Rapid Fire Round!`}
                </p>
              </div>

              {matchMode ? (
                <button onClick={continueToMatch}
                  className="w-full py-4 bg-[#f5a623] text-[#0a1628] font-bold rounded-2xl hover:bg-[#e0941a] flex items-center justify-center gap-2 text-lg transition-colors">
                  Continue to Buzzer Round <ChevronRight size={20} />
                </button>
              ) : (
                <button onClick={() => { setPhase("setup"); setScoreA(0); setScoreB(0); setQueue([]); setCorrectCount(0); }}
                  className="w-full py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 flex items-center justify-center gap-2 transition-colors">
                  <RotateCcw size={16} /> Play Again
                </button>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
