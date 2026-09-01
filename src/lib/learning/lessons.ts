// Self-learning — distill discrete outcomes into evidence-backed lessons.
// Ported from Draymond's learning-store model (pattern + lesson + evidenceCount)
// into a pure, deterministic function. No LLM: lessons are clustered from real
// outcome rows, so a lesson's evidence count is always the number of recorded
// outcomes behind it.

export interface LearningOutcomeInput {
  kind: string;
  summary: string;
  detail: string;
  success: boolean;
}

export interface LessonDraft {
  id: string; // ls_<slug>
  agent_id: string;
  pattern: string;
  lesson: string;
  evidence_count: number;
}

const MAX_SLUG = 64;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SLUG);
}

export function lessonId(kind: string, summary: string, success: boolean): string {
  return `ls_${slugify(`${kind}_${summary}_${success ? "ok" : "issue"}`)}`;
}

// Cluster outcomes by (kind, summary, success). Each cluster becomes one lesson.
// evidenceCount = the real number of outcomes in the cluster.
export function distillLessons(
  outcomes: LearningOutcomeInput[],
  agentId = "flip-system"
): LessonDraft[] {
  const clusters = new Map<string, { summary: string; kind: string; success: boolean; details: string[] }>();

  for (const o of outcomes) {
    const key = `${o.kind}|${o.summary}|${o.success}`;
    const c = clusters.get(key) ?? { summary: o.summary, kind: o.kind, success: o.success, details: [] };
    c.details.push(o.detail);
    clusters.set(key, c);
  }

  return [...clusters.values()]
    .sort((a, b) => b.details.length - a.details.length)
    .map((c) => ({
      id: lessonId(c.kind, c.summary, c.success),
      agent_id: agentId,
      pattern: `${c.summary} — ${c.success ? "within tolerance" : "outside tolerance"} (${c.details.length} case${c.details.length === 1 ? "" : "s"})`,
      lesson: c.details.slice(0, 5).join("\n"),
      evidence_count: c.details.length,
    }));
}
