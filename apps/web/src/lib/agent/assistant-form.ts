// Pure validator for the assistant editor form. name + system_prompt are REQUIRED (never let the user
// blank the agent's brain); the greeting (first_message) is optional.

type FormLike = { get(name: string): unknown };
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function parseAssistantForm(form: FormLike): {
  error?: string;
  values: { name: string; firstMessage: string; systemPrompt: string } | null;
} {
  const name = text(form.get("name"));
  const systemPrompt = text(form.get("system_prompt"));
  if (!name) return { error: "name_required", values: null };
  if (!systemPrompt) return { error: "prompt_required", values: null };
  return {
    error: undefined,
    values: { name, firstMessage: text(form.get("first_message")) ?? "", systemPrompt },
  };
}
