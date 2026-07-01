-- Phase 4b: system_prompt becomes a COMPOSED value (base + business context + guardrails).
-- Store the two composer inputs separately; seed base_prompt from the current prompt so the
-- live behavior is preserved (no regression) on first publish.
alter table public.assistants add column if not exists base_prompt text;
alter table public.assistants add column if not exists guardrails text;

update public.assistants set base_prompt = system_prompt
where base_prompt is null and system_prompt is not null;
