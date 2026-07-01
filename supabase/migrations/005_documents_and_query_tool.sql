-- Phase 4c: documents (Vapi Knowledge Base metadata) + the org's query-tool id on assistants.
-- Bytes live in Vapi; this table stores only metadata + the Vapi file id.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'general',        -- 'general' | 'price_list'
  vapi_file_id text,
  bytes bigint,
  mimetype text,
  status text not null default 'active',        -- 'active' | 'archived'
  created_at timestamptz not null default now()
);

create index if not exists documents_org_idx on public.documents(organization_id);

alter table public.documents enable row level security;

drop policy if exists "members can read documents" on public.documents;
create policy "members can read documents"
on public.documents for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "admins can manage documents" on public.documents;
create policy "admins can manage documents"
on public.documents for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

alter table public.assistants add column if not exists vapi_query_tool_id text;
