// Pure validator for the agent "Behavior" tab. name + base_prompt are REQUIRED (never blank the agent's
// core behavior). first_message (greeting) and guardrails are optional. The composed system_prompt is
// built elsewhere (prompt-composer) at publish time.

type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function parseAgentBehaviorForm(form: FormLike): {
  error?: string;
  values: { name: string; firstMessage: string; basePrompt: string; guardrails: string } | null;
} {
  const name = text(form.get("name"));
  const basePrompt = text(form.get("base_prompt"));
  if (!name) return { error: "name_required", values: null };
  if (!basePrompt) return { error: "base_prompt_required", values: null };
  return {
    error: undefined,
    values: {
      name,
      firstMessage: text(form.get("first_message")) ?? "",
      basePrompt,
      guardrails: text(form.get("guardrails")) ?? "",
    },
  };
}
