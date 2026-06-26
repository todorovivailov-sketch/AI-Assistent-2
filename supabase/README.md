# Supabase Setup

## First Step

Open Supabase Dashboard -> SQL Editor -> New query, paste:

```text
supabase/migrations/001_initial_ai_receptionist_schema.sql
```

Run it once.

## Important

- Do not put Supabase service role keys in frontend code.
- `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY` is only for server routes and background jobs.
- The frontend uses only `NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- RLS is enabled on all public tables in this schema.

## After Auth User Exists

After the first login user is created in Supabase Auth, create the first organization membership with SQL like this:

```sql
insert into public.organizations (name, slug, industry, owner_name, owner_phone, billing_email)
values ('Demo HVAC Company', 'demo-hvac', 'hvac', 'Owner Name', '+359...', 'owner@example.com')
returning id;

insert into public.organization_members (organization_id, user_id, role)
values ('PASTE_ORGANIZATION_ID', 'PASTE_AUTH_USER_ID', 'owner');
```

Or use the prepared first-client template:

```text
supabase/seeds/001_first_client_template.sql
```

Replace `PASTE_AUTH_USER_ID` before running it.
