"use client";

/**
 * Competition Manager — matches real Supabase schema:
 *
 * sc_teams:          id, team_name, status ('pending'|'active'|'eliminated'|'winner'), total_score, created_at
 * sc_questions:      id, question_text, answer_key, round_type ('rapid_fire'|'buzzer'), category ('science'|'arts'|'commercial'|'general'), subject (NOT NULL), difficulty, points, created_at
 * sc_sprint_problems:id, title, statement, step1-step5, created_at
 * sc_question_pools: id, name, pool_type ('rapid_fire'|'buzzer'|'sprint'), pool_number (NOT NULL, UNIQUE), problem_ids (TEXT), created_at
 * sc_pool_questions: id, pool_id, question_id, order_index
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Trophy,
  Users,
  HelpCircle,
  Layers,
  Play,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Team = {
  id: string;
  team_name: string;
  status: "pending" | "active" | "eliminated" | "winner";
  total_score: number;
  created_at: string;
};

type Question = {
  id: string;
  question_text: string;
  answer_key: string;
  round_type: "rapid_fire" | "buzzer";
  category: "science" | "arts" | "commercial" | "general";
  subject: string;
  difficulty: string;
  created_at: string;
};

type SprintProblem = {
  id: string;
  title: string;
  statement: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  step5: string;
  created_at: string;
};

type QuestionPool = {
  id: string;
  name: string;
  pool_type: "rapid_fire" | "buzzer" | "sprint";
  pool_number: number;
  problem_ids: string;
  created_at: string;
  questionCount?: number;
};

const CATEGORIES = ["science", "arts", "commercial", "general"] as const;
type Category = (typeof CATEGORIES)[number];

// ─── Toast ───────────────────────────────────────────────────────────────────

type Toast = { id: number; msg: string; type: "ok" | "err" };
let toastId = 0;

function Toasts({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${
            t.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {t.type === "ok" ? <Check size={16} /> : <AlertCircle size={16} />}
          {t.msg}
          <button onClick={() => remove(t.id)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CompetitionPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<"teams" | "questions" | "sets" | "match">("teams");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    const id = ++toastId;
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  // Auth check
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await (supabase as any).auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      const role = profile?.role ?? session.user.user_metadata?.role;
      if (!role || !["admin", "moderator"].includes(role)) {
        router.replace("/dashboard");
        return;
      }
      setAuthChecked(true);
    })();
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#f5a623]" size={40} />
      </div>
    );
  }

  const tabs = [
    { key: "teams", label: "Teams", icon: Users },
    { key: "questions", label: "Questions", icon: HelpCircle },
    { key: "sets", label: "Question Sets", icon: Layers },
    { key: "match", label: "Match Setup", icon: Play },
  ] as const;

  return (
    <div className="min-h-screen bg-[#0d1f3c] text-white">
      <Toasts toasts={toasts} remove={removeToast} />

      {/* Header */}
      <div className="bg-[#0a1628] border-b border-[#f5a623]/20 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-3">
          <Trophy className="text-[#f5a623]" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-white">Competition Manager</h1>
            <p className="text-sm text-slate-400">Scholars Challenge Administration</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === key
                    ? "border-[#f5a623] text-[#f5a623]"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "teams" && <TeamsTab toast={toast} />}
        {activeTab === "questions" && <QuestionsTab toast={toast} />}
        {activeTab === "sets" && <SetsTab toast={toast} />}
        {activeTab === "match" && <MatchSetupTab toast={toast} router={router} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEAMS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function TeamsTab({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sc_teams")
      .select("id, team_name, status, total_score, created_at")
      .order("created_at", { ascending: true });
    if (error) toast(error.message, "err");
    else setTeams(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const registerTeam = async () => {
    if (!teamName.trim()) {
      toast("Team name is required", "err");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("sc_teams")
      .insert({ team_name: teamName.trim(), status: "active" });
    if (error) toast(error.message, "err");
    else {
      toast("Team registered!");
      setTeamName("");
      setShowForm(false);
      fetchTeams();
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from("sc_teams")
      .update({ status })
      .eq("id", id);
    if (error) toast(error.message, "err");
    else {
      toast("Status updated!");
      fetchTeams();
    }
  };

  const deleteTeam = async (id: string) => {
    if (!confirm("Delete this team permanently?")) return;
    const { error } = await (supabase as any).from("sc_teams").delete().eq("id", id);
    if (error) toast(error.message, "err");
    else {
      toast("Team deleted");
      fetchTeams();
    }
  };

  const stats = {
    total: teams.length,
    active: teams.filter((t) => t.status === "active").length,
    eliminated: teams.filter((t) => t.status === "eliminated").length,
    winner: teams.filter((t) => t.status === "winner").length,
    pending: teams.filter((t) => t.status === "pending").length,
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: stats.total, color: "text-white" },
          { label: "Active", value: stats.active, color: "text-green-400" },
          { label: "Eliminated", value: stats.eliminated, color: "text-red-400" },
          { label: "Winners 🏆", value: stats.winner, color: "text-[#f5a623]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0a1628] rounded-xl p-4 border border-white/10">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          Registered Teams{" "}
          <span className="text-sm text-slate-400 font-normal">({teams.length})</span>
        </h2>
        <button
          onClick={() => setShowForm((p) => !p)}
          className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] transition-colors text-sm"
        >
          <Plus size={16} /> Register Team
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-xl p-5 mb-5">
          <h3 className="text-sm font-semibold text-[#f5a623] mb-4">Register New Team</h3>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">Team Name *</label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && registerTeam()}
                placeholder="e.g. Alpha Wolves, Team Phoenix…"
                className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
              />
            </div>
            <button
              onClick={registerTeam}
              disabled={saving}
              className="px-5 py-2 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} Register
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Teams list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[#f5a623]" size={32} />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>No teams registered yet.</p>
          <p className="text-sm mt-1">Click &ldquo;Register Team&rdquo; to add the first team.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div
              key={team.id}
              className={`bg-[#0a1628] border rounded-xl px-5 py-4 flex items-center justify-between transition-colors ${
                team.status === "winner"
                  ? "border-[#f5a623]/40 bg-[#f5a623]/5"
                  : team.status === "eliminated"
                  ? "border-white/5 opacity-70"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    team.status === "winner"
                      ? "bg-[#f5a623] text-[#0a1628]"
                      : team.status === "eliminated"
                      ? "bg-white/10 text-slate-400"
                      : "bg-[#f5a623]/20 text-[#f5a623]"
                  }`}
                >
                  {team.status === "winner" ? "🏆" : team.team_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white">{team.team_name}</p>
                  <p className="text-xs text-slate-400">
                    Score: {team.total_score ?? 0} pts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={team.status} />
                <div className="flex gap-2 flex-wrap justify-end">
                  {team.status === "active" && (
                    <>
                      <button
                        onClick={() => updateStatus(team.id, "eliminated")}
                        className="px-3 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
                      >
                        Eliminate
                      </button>
                      <button
                        onClick={() => updateStatus(team.id, "winner")}
                        className="px-3 py-1 text-xs bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/30 rounded-lg hover:bg-[#f5a623]/30 transition-colors"
                      >
                        🏆 Mark Winner
                      </button>
                    </>
                  )}
                  {team.status === "pending" && (
                    <button
                      onClick={() => updateStatus(team.id, "active")}
                      className="px-3 py-1 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
                    >
                      Activate
                    </button>
                  )}
                  {team.status === "eliminated" && (
                    <button
                      onClick={() => updateStatus(team.id, "active")}
                      className="px-3 py-1 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
                    >
                      Restore
                    </button>
                  )}
                  {team.status === "winner" && (
                    <button
                      onClick={() => updateStatus(team.id, "active")}
                      className="px-3 py-1 text-xs bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-lg hover:bg-slate-500/30 transition-colors"
                    >
                      Remove Winner
                    </button>
                  )}
                  <button
                    onClick={() => deleteTeam(team.id)}
                    className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    eliminated: "bg-red-500/20 text-red-400 border-red-500/30",
    winner: "bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30",
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span
      className={`px-2.5 py-0.5 text-xs font-medium border rounded-full capitalize ${
        cfg[status] || "bg-white/10 text-white border-white/20"
      }`}
    >
      {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function QuestionsTab({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sprintProblems, setSprintProblems] = useState<SprintProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "rapid_fire" | "buzzer" | "sprint">("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [roundType, setRoundType] = useState<"rapid_fire" | "buzzer" | "sprint">("rapid_fire");
  const [qText, setQText] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<Category>("general");
  const [difficulty, setDifficulty] = useState("medium");
  // Sprint
  const [spTitle, setSpTitle] = useState("");
  const [spStatement, setSpStatement] = useState("");
  const [steps, setSteps] = useState(["", "", "", "", ""]);

  const resetForm = () => {
    setRoundType("rapid_fire");
    setQText("");
    setAnswerKey("");
    setSubject("");
    setCategory("general");
    setDifficulty("medium");
    setSpTitle("");
    setSpStatement("");
    setSteps(["", "", "", "", ""]);
    setEditingId(null);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: q }, { data: sp }] = await Promise.all([
      (supabase as any)
        .from("sc_questions")
        .select("id, question_text, answer_key, round_type, category, subject, difficulty, created_at")
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("sc_sprint_problems")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    setQuestions(q || []);
    setSprintProblems(sp || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const startEdit = (q: Question) => {
    setEditingId(q.id);
    setRoundType(q.round_type);
    setQText(q.question_text);
    setAnswerKey(q.answer_key);
    setSubject(q.subject || "");
    setCategory(q.category || "general");
    setDifficulty(q.difficulty || "medium");
    setShowForm(true);
  };

  const startEditSprint = (p: SprintProblem) => {
    setEditingId(p.id);
    setRoundType("sprint");
    setSpTitle(p.title);
    setSpStatement(p.statement);
    setSteps([p.step1, p.step2, p.step3, p.step4, p.step5]);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    if (roundType === "sprint") {
      if (!spTitle.trim() || !spStatement.trim()) {
        toast("Title and statement are required", "err");
        setSaving(false);
        return;
      }
      const payload = {
        title: spTitle.trim(),
        statement: spStatement.trim(),
        step1: steps[0],
        step2: steps[1],
        step3: steps[2],
        step4: steps[3],
        step5: steps[4],
      };
      let error;
      if (editingId) {
        ({ error } = await (supabase as any).from("sc_sprint_problems").update(payload).eq("id", editingId));
      } else {
        ({ error } = await (supabase as any).from("sc_sprint_problems").insert(payload));
      }
      if (error) toast(error.message, "err");
      else {
        toast(editingId ? "Sprint problem updated!" : "Sprint problem added!");
        resetForm();
        setShowForm(false);
        fetchAll();
      }
    } else {
      if (!qText.trim() || !answerKey.trim() || !subject.trim()) {
        toast("Question text, answer, and subject are required", "err");
        setSaving(false);
        return;
      }
      const payload = {
        question_text: qText.trim(),
        answer_key: answerKey.trim(),
        round_type: roundType,
        category,
        subject: subject.trim(),
        difficulty,
      };
      let error;
      if (editingId) {
        ({ error } = await (supabase as any).from("sc_questions").update(payload).eq("id", editingId));
      } else {
        ({ error } = await (supabase as any).from("sc_questions").insert(payload));
      }
      if (error) toast(error.message, "err");
      else {
        toast(editingId ? "Question updated!" : "Question added!");
        resetForm();
        setShowForm(false);
        fetchAll();
      }
    }
    setSaving(false);
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    const { error } = await (supabase as any).from("sc_questions").delete().eq("id", id);
    if (error) toast(error.message, "err");
    else {
      toast("Deleted");
      fetchAll();
    }
  };

  const deleteSprint = async (id: string) => {
    if (!confirm("Delete this problem?")) return;
    const { error } = await (supabase as any).from("sc_sprint_problems").delete().eq("id", id);
    if (error) toast(error.message, "err");
    else {
      toast("Deleted");
      fetchAll();
    }
  };

  const filteredQ =
    filter === "all"
      ? questions
      : filter === "sprint"
      ? []
      : questions.filter((q) => q.round_type === filter);
  const showSprint = filter === "all" || filter === "sprint";

  const roundBadge = (rt: string) => {
    const cfg: Record<string, string> = {
      rapid_fire: "bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/30",
      buzzer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      sprint: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    const labels: Record<string, string> = { rapid_fire: "Rapid Fire", buzzer: "Buzzer", sprint: "Sprint" };
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold border rounded-full ${cfg[rt] || ""}`}>
        {labels[rt] || rt}
      </span>
    );
  };

  const totalCount = questions.length + sprintProblems.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-[#0a1628] border border-white/10 rounded-xl p-1">
          {(["all", "rapid_fire", "buzzer", "sprint"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                filter === f ? "bg-[#f5a623] text-[#0a1628] font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              {f === "all"
                ? `All (${totalCount})`
                : f === "rapid_fire"
                ? `Rapid Fire (${questions.filter((q) => q.round_type === "rapid_fire").length})`
                : f === "buzzer"
                ? `Buzzer (${questions.filter((q) => q.round_type === "buzzer").length})`
                : `Sprint (${sprintProblems.length})`}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm((p) => !p);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] text-sm"
        >
          <Plus size={16} /> Add Question
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-xl p-5 mb-5">
          <h3 className="text-sm font-semibold text-[#f5a623] mb-4">
            {editingId ? "Edit" : "New"} Question
          </h3>

          {/* Round type selector */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 block mb-1">Round Type</label>
            <div className="flex gap-2">
              {(["rapid_fire", "buzzer", "sprint"] as const).map((rt) => (
                <button
                  key={rt}
                  onClick={() => setRoundType(rt)}
                  className={`px-4 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                    roundType === rt
                      ? rt === "rapid_fire"
                        ? "bg-[#f5a623] border-[#f5a623] text-[#0a1628]"
                        : rt === "buzzer"
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-purple-500 border-purple-500 text-white"
                      : "bg-white/5 border-white/20 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {rt === "rapid_fire" ? "⚡ Rapid Fire" : rt === "buzzer" ? "🔔 Buzzer" : "🚀 Sprint"}
                </button>
              ))}
            </div>
          </div>

          {roundType !== "sprint" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Question Text *</label>
                <textarea
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  rows={3}
                  placeholder="Type the question here…"
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Answer / Answer Key *</label>
                <input
                  value={answerKey}
                  onChange={(e) => setAnswerKey(e.target.value)}
                  placeholder="Correct answer"
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Subject *</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Biology, History, Physics…"
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                >
                  <option value="science">Science</option>
                  <option value="arts">Arts</option>
                  <option value="commercial">Commercial</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Problem Title *</label>
                <input
                  value={spTitle}
                  onChange={(e) => setSpTitle(e.target.value)}
                  placeholder="e.g. The Water Cycle Challenge"
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Problem Statement *</label>
                <textarea
                  value={spStatement}
                  onChange={(e) => setSpStatement(e.target.value)}
                  rows={3}
                  placeholder="Describe the overall problem scenario…"
                  className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {steps.map((s, i) => (
                  <div key={i}>
                    <label className="text-xs text-slate-400 block mb-1">Step {i + 1} Answer</label>
                    <input
                      value={s}
                      onChange={(e) =>
                        setSteps((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      placeholder={`Answer for step ${i + 1}`}
                      className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingId ? "Save Changes" : "Add Question"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-5 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Questions list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[#f5a623]" size={32} />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredQ.map((q) => (
            <div
              key={q.id}
              className="bg-[#0a1628] border border-white/10 rounded-xl px-5 py-4 flex items-start justify-between gap-4 hover:border-white/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {roundBadge(q.round_type)}
                  <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full capitalize">
                    {q.category}
                  </span>
                  {q.subject && (
                    <span className="text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                      {q.subject}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      q.difficulty === "easy"
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : q.difficulty === "hard"
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                    }`}
                  >
                    {q.difficulty}
                  </span>
                </div>
                <p className="text-sm text-white leading-relaxed line-clamp-2">{q.question_text}</p>
                <p className="text-xs text-[#f5a623]/70 mt-1">✓ {q.answer_key}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(q)}
                  className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => deleteQuestion(q.id)}
                  className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {showSprint &&
            sprintProblems.map((p) => (
              <div
                key={p.id}
                className="bg-[#0a1628] border border-white/10 rounded-xl px-5 py-4 flex items-start justify-between gap-4 hover:border-white/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {roundBadge("sprint")}
                  </div>
                  <p className="text-sm text-white font-medium">{p.title}</p>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">{p.statement}</p>
                  <p className="text-xs text-[#f5a623]/70 mt-1">
                    {[p.step1, p.step2, p.step3, p.step4, p.step5].filter(Boolean).length} steps defined
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startEditSprint(p)}
                    className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => deleteSprint(p.id)}
                    className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

          {filteredQ.length === 0 && !(showSprint && sprintProblems.length > 0) && (
            <div className="text-center py-16 text-slate-500">
              <HelpCircle size={48} className="mx-auto mb-3 opacity-30" />
              <p>No questions found.</p>
              <p className="text-sm mt-1">Click &ldquo;Add Question&rdquo; to create the first question.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION SETS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SetsTab({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [subTab, setSubTab] = useState<"rf" | "bz" | "sp">("rf");

  return (
    <div>
      <div className="flex gap-1 bg-[#0a1628] border border-white/10 rounded-xl p-1 mb-6 w-fit">
        {(
          [
            ["rf", "⚡ Rapid Fire Pools"],
            ["bz", "🔔 Buzzer Sets"],
            ["sp", "🚀 Sprint Sets"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-5 py-2 text-sm rounded-lg transition-colors ${
              subTab === key
                ? "bg-[#f5a623] text-[#0a1628] font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {subTab === "rf" && (
        <PoolManager
          poolType="rapid_fire"
          questionType="rapid_fire"
          label="Rapid Fire Pool"
          isRF
          toast={toast}
        />
      )}
      {subTab === "bz" && (
        <PoolManager
          poolType="buzzer"
          questionType="buzzer"
          label="Buzzer Set"
          isRF={false}
          toast={toast}
        />
      )}
      {subTab === "sp" && (
        <PoolManager
          poolType="sprint"
          questionType="sprint"
          label="Sprint Set"
          isRF={false}
          toast={toast}
        />
      )}
    </div>
  );
}

function PoolManager({
  poolType,
  questionType,
  label,
  isRF,
  toast,
}: {
  poolType: string;
  questionType: string;
  label: string;
  isRF: boolean;
  toast: (m: string, t?: "ok" | "err") => void;
}) {
  const [pools, setPools] = useState<QuestionPool[]>([]);
  const [questions, setQuestions] = useState<(Question | SprintProblem)[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPoolNum, setNewPoolNum] = useState(1);
  const [saving, setSaving] = useState(false);
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const [poolQIds, setPoolQIds] = useState<Record<string, string[]>>({});
  const [loadingPoolQ, setLoadingPoolQ] = useState<string | null>(null);

  const isSprint = poolType === "sprint";

  const fetchPools = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sc_question_pools")
      .select("*")
      .eq("pool_type", poolType)
      .order("pool_number", { ascending: true });
    if (error) {
      toast(error.message, "err");
      setLoading(false);
      return;
    }
    const poolsWithCount = await Promise.all(
      (data || []).map(async (pool: QuestionPool) => {
        let count = 0;
        if (isSprint) {
          try {
            count = pool.problem_ids ? JSON.parse(pool.problem_ids).length : 0;
          } catch {
            count = 0;
          }
        } else {
          const { count: c } = await (supabase as any)
            .from("sc_pool_questions")
            .select("*", { count: "exact", head: true })
            .eq("pool_id", pool.id);
          count = c || 0;
        }
        return { ...pool, questionCount: count };
      })
    );
    setPools(poolsWithCount);
    setLoading(false);
  }, [poolType, isSprint, toast]);

  const fetchQuestions = useCallback(async () => {
    if (isSprint) {
      const { data } = await (supabase as any)
        .from("sc_sprint_problems")
        .select("*")
        .order("title", { ascending: true });
      setQuestions(data || []);
    } else {
      const { data } = await (supabase as any)
        .from("sc_questions")
        .select("id, question_text, answer_key, round_type, subject, difficulty")
        .eq("round_type", questionType)
        .order("created_at", { ascending: false });
      setQuestions(data || []);
    }
  }, [isSprint, questionType]);

  useEffect(() => {
    fetchPools();
    fetchQuestions();
  }, [fetchPools, fetchQuestions]);

  const createPool = async () => {
    if (!newName.trim()) {
      toast("Name is required", "err");
      return;
    }
    setSaving(true);
    // pool_number must be unique and NOT NULL
    // For RF: use the user-supplied pool_number
    // For Buzzer/Sprint: use a timestamp-based unique number (offset by type to avoid collisions)
    let poolNumber: number;
    if (isRF) {
      poolNumber = newPoolNum;
    } else {
      // Use timestamp seconds + type offset to ensure uniqueness
      const offset = poolType === "buzzer" ? 10000 : 20000;
      poolNumber = offset + (Math.floor(Date.now() / 1000) % 9000);
    }

    const { error } = await (supabase as any)
      .from("sc_question_pools")
      .insert({ name: newName.trim(), pool_type: poolType, pool_number: poolNumber });
    if (error) toast(error.message, "err");
    else {
      toast(`${label} created!`);
      setNewName("");
      setNewPoolNum(1);
      setShowForm(false);
      fetchPools();
    }
    setSaving(false);
  };

  const deletePool = async (id: string) => {
    if (!confirm("Delete this pool/set and all its question links?")) return;
    const { error } = await (supabase as any).from("sc_question_pools").delete().eq("id", id);
    if (error) toast(error.message, "err");
    else {
      toast("Deleted");
      fetchPools();
    }
  };

  const openManage = async (pool: QuestionPool) => {
    if (expandedPool === pool.id) {
      setExpandedPool(null);
      return;
    }
    setExpandedPool(pool.id);
    setLoadingPoolQ(pool.id);
    if (isSprint) {
      try {
        setPoolQIds((p) => ({ ...p, [pool.id]: JSON.parse(pool.problem_ids || "[]") }));
      } catch {
        setPoolQIds((p) => ({ ...p, [pool.id]: [] }));
      }
      setLoadingPoolQ(null);
    } else {
      const { data } = await (supabase as any)
        .from("sc_pool_questions")
        .select("question_id")
        .eq("pool_id", pool.id);
      setPoolQIds((p) => ({
        ...p,
        [pool.id]: (data || []).map((r: { question_id: string }) => r.question_id),
      }));
      setLoadingPoolQ(null);
    }
  };

  const toggleQuestion = async (pool: QuestionPool, qid: string) => {
    const current = poolQIds[pool.id] || [];
    const has = current.includes(qid);
    if (isSprint) {
      const next = has ? current.filter((id) => id !== qid) : [...current, qid];
      const { error } = await (supabase as any)
        .from("sc_question_pools")
        .update({ problem_ids: JSON.stringify(next) })
        .eq("id", pool.id);
      if (error) toast(error.message, "err");
      else {
        setPoolQIds((p) => ({ ...p, [pool.id]: next }));
        fetchPools();
      }
    } else {
      if (has) {
        const { error } = await (supabase as any)
          .from("sc_pool_questions")
          .delete()
          .eq("pool_id", pool.id)
          .eq("question_id", qid);
        if (error) toast(error.message, "err");
        else {
          setPoolQIds((p) => ({ ...p, [pool.id]: current.filter((id) => id !== qid) }));
          fetchPools();
        }
      } else {
        const { error } = await (supabase as any)
          .from("sc_pool_questions")
          .insert({ pool_id: pool.id, question_id: qid, order_index: current.length });
        if (error) toast(error.message, "err");
        else {
          setPoolQIds((p) => ({ ...p, [pool.id]: [...current, qid] }));
          fetchPools();
        }
      }
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">{label}s</h2>
        <button
          onClick={() => setShowForm((p) => !p)}
          className="flex items-center gap-2 px-4 py-2 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] text-sm"
        >
          <Plus size={16} /> New {label}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#0a1628] border border-[#f5a623]/30 rounded-xl p-5 mb-5">
          <div className="flex gap-4 items-end flex-wrap">
            {isRF && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">Pool Number</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={newPoolNum}
                  onChange={(e) => setNewPoolNum(Number(e.target.value))}
                  className="w-24 bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
                />
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-400 block mb-1">Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createPool()}
                placeholder={`${label} name`}
                className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f5a623]"
              />
            </div>
            <button
              onClick={createPool}
              disabled={saving}
              className="px-5 py-2 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Create"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[#f5a623]" size={32} />
        </div>
      ) : pools.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Layers size={48} className="mx-auto mb-3 opacity-30" />
          <p>No {label.toLowerCase()}s yet.</p>
          <p className="text-sm mt-1">Create one, then add questions to it.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pools.map((pool) => (
            <div
              key={pool.id}
              className="bg-[#0a1628] border border-white/10 rounded-xl overflow-hidden"
            >
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isRF && (
                    <div className="w-9 h-9 rounded-full bg-[#f5a623]/20 flex items-center justify-center text-[#f5a623] font-bold text-sm border border-[#f5a623]/30">
                      {pool.pool_number}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-white">{pool.name}</p>
                    <p className="text-xs text-slate-400">
                      {pool.questionCount} {isSprint ? "problems" : "questions"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openManage(pool)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-colors"
                  >
                    {expandedPool === pool.id ? "Close" : "Manage"}{" "}
                    {expandedPool === pool.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  <button
                    onClick={() => deletePool(pool.id)}
                    className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expandedPool === pool.id && (
                <div className="border-t border-white/10 bg-[#0d1f3c] px-5 py-4">
                  {loadingPoolQ === pool.id ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="animate-spin text-[#f5a623]" size={20} />
                    </div>
                  ) : questions.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No {isSprint ? "sprint problems" : "questions"} found. Add some in the
                      Questions tab first.
                    </p>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-400 mb-3">
                        ✓ = included in this {label.toLowerCase()}
                      </p>
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {questions.map((q) => {
                          const qid = q.id;
                          const checked = (poolQIds[pool.id] || []).includes(qid);
                          const text = isSprint
                            ? (q as SprintProblem).title
                            : (q as Question).question_text;
                          const sub = isSprint ? "" : (q as Question).subject;
                          return (
                            <label
                              key={qid}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                checked
                                  ? "bg-[#f5a623]/10 border border-[#f5a623]/30"
                                  : "bg-white/5 border border-transparent hover:bg-white/10"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleQuestion(pool, qid)}
                                className="mt-0.5 accent-[#f5a623] shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-sm text-white line-clamp-2">{text}</p>
                                {sub && (
                                  <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCH SETUP TAB
// ═══════════════════════════════════════════════════════════════════════════════

function MatchSetupTab({
  toast,
  router,
}: {
  toast: (m: string, t?: "ok" | "err") => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rfPools, setRfPools] = useState<QuestionPool[]>([]);
  const [bzSets, setBzSets] = useState<QuestionPool[]>([]);
  const [spSets, setSpSets] = useState<QuestionPool[]>([]);
  const [loading, setLoading] = useState(true);

  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [selectedRFPools, setSelectedRFPools] = useState<string[]>([]);
  const [bzSetId, setBzSetId] = useState("");
  const [spSetId, setSpSetId] = useState("");
  const [launching, setLaunching] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: rf }, { data: bz }, { data: sp }] = await Promise.all([
      (supabase as any)
        .from("sc_teams")
        .select("id, team_name, status, total_score")
        .eq("status", "active")
        .order("team_name"),
      (supabase as any)
        .from("sc_question_pools")
        .select("*")
        .eq("pool_type", "rapid_fire")
        .order("pool_number"),
      (supabase as any)
        .from("sc_question_pools")
        .select("*")
        .eq("pool_type", "buzzer")
        .order("name"),
      (supabase as any)
        .from("sc_question_pools")
        .select("*")
        .eq("pool_type", "sprint")
        .order("name"),
    ]);
    setTeams(t || []);
    setRfPools(rf || []);
    setBzSets(bz || []);
    setSpSets(sp || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const goNext = () => {
    if (!teamAId || !teamBId) {
      toast("Select both teams", "err");
      return;
    }
    if (teamAId === teamBId) {
      toast("Teams must be different", "err");
      return;
    }
    setStep(2);
  };

  const launchMatch = () => {
    if (selectedRFPools.length === 0) {
      toast("Select at least one Rapid Fire pool", "err");
      return;
    }
    if (!bzSetId) {
      toast("Select a Buzzer set", "err");
      return;
    }
    if (!spSetId) {
      toast("Select a Sprint set", "err");
      return;
    }
    setLaunching(true);
    const teamA = teams.find((t) => t.id === teamAId)!;
    const teamB = teams.find((t) => t.id === teamBId)!;
    const match = {
      teamA: { id: teamA.id, team_name: teamA.team_name },
      teamB: { id: teamB.id, team_name: teamB.team_name },
      phase: "rf",
      rfScores: [0, 0],
      bzScores: [0, 0],
      spScores: [0, 0],
      rfPoolIds: selectedRFPools,
      bzSetId,
      spSetId,
    };
    sessionStorage.setItem("sc_match", JSON.stringify(match));
    router.push("/dashboard/staff/competition/live/rapid-fire");
  };

  const toggleRFPool = (id: string) => {
    setSelectedRFPools((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-[#f5a623]" size={32} />
      </div>
    );

  const teamA = teams.find((t) => t.id === teamAId);
  const teamB = teams.find((t) => t.id === teamBId);

  return (
    <div className="max-w-2xl">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step >= s ? "bg-[#f5a623] text-[#0a1628]" : "bg-white/10 text-slate-400"
              }`}
            >
              {s}
            </div>
            <span className={`text-sm ${step >= s ? "text-white" : "text-slate-500"}`}>
              {s === 1 ? "Select Teams" : "Configure Rounds"}
            </span>
            {s < 2 && (
              <div className={`w-12 h-0.5 ${step > s ? "bg-[#f5a623]" : "bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Team Selection */}
      {step === 1 && (
        <div className="bg-[#0a1628] border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Select Competing Teams</h2>

          {teams.length === 0 && (
            <div className="mb-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
              ⚠ No active teams found. Register and activate teams in the Teams tab first.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-2">Team A</label>
              <select
                value={teamAId}
                onChange={(e) => setTeamAId(e.target.value)}
                className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]"
              >
                <option value="">— Select Team A —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2">Team B</label>
              <select
                value={teamBId}
                onChange={(e) => setTeamBId(e.target.value)}
                className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]"
              >
                <option value="">— Select Team B —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={goNext}
            disabled={teams.length === 0}
            className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-[#f5a623] text-[#0a1628] font-semibold rounded-lg hover:bg-[#e0941a] disabled:opacity-40 text-sm"
          >
            Next →
          </button>
        </div>
      )}

      {/* Step 2 — Configure Rounds */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Teams preview */}
          <div className="bg-[#0a1628] border border-[#f5a623]/20 rounded-xl p-4 flex items-center">
            <div className="text-center flex-1">
              <p className="text-xs text-slate-400 mb-1">Team A</p>
              <p className="font-bold text-white text-lg">{teamA?.team_name}</p>
            </div>
            <div className="text-2xl font-black text-[#f5a623] px-6">VS</div>
            <div className="text-center flex-1">
              <p className="text-xs text-slate-400 mb-1">Team B</p>
              <p className="font-bold text-white text-lg">{teamB?.team_name}</p>
            </div>
          </div>

          {/* RF Pools */}
          <div className="bg-[#0a1628] border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#f5a623] mb-1">
              ⚡ Rapid Fire Pools *
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Select one or more pools. Questions from all selected pools will be merged.
            </p>
            {rfPools.length === 0 ? (
              <p className="text-sm text-slate-500">
                No RF pools created yet. Go to Question Sets → Rapid Fire Pools.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {rfPools.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer border transition-colors ${
                      selectedRFPools.includes(p.id)
                        ? "bg-[#f5a623]/10 border-[#f5a623]/40"
                        : "bg-white/5 border-transparent hover:bg-white/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRFPools.includes(p.id)}
                      onChange={() => toggleRFPool(p.id)}
                      className="accent-[#f5a623]"
                    />
                    <span className="text-sm text-white">
                      Pool {p.pool_number}: {p.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Buzzer Set */}
          <div className="bg-[#0a1628] border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-400 mb-3">🔔 Buzzer Set *</h3>
            {bzSets.length === 0 ? (
              <p className="text-sm text-slate-500">
                No Buzzer sets created yet. Go to Question Sets → Buzzer Sets.
              </p>
            ) : (
              <select
                value={bzSetId}
                onChange={(e) => setBzSetId(e.target.value)}
                className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]"
              >
                <option value="">— Select Buzzer Set —</option>
                {bzSets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Sprint Set */}
          <div className="bg-[#0a1628] border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-purple-400 mb-3">🚀 Sprint Set *</h3>
            {spSets.length === 0 ? (
              <p className="text-sm text-slate-500">
                No Sprint sets created yet. Go to Question Sets → Sprint Sets.
              </p>
            ) : (
              <select
                value={spSetId}
                onChange={(e) => setSpSetId(e.target.value)}
                className="w-full bg-[#0d1f3c] border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f5a623]"
              >
                <option value="">— Select Sprint Set —</option>
                {spSets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-2.5 bg-white/10 rounded-lg text-sm hover:bg-white/20"
            >
              ← Back
            </button>
            <button
              onClick={launchMatch}
              disabled={launching}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#f5a623] text-[#0a1628] font-bold rounded-lg hover:bg-[#e0941a] disabled:opacity-50 text-sm"
            >
              {launching ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Launch Match →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
