-- QR Tools / HypnoRaffle schema for Neon (Data API, anonymous access).
--
-- Transcribed on 2026-11-14 from the live Supabase catalogs (information_schema.columns,
-- pg_constraint, pg_indexes, pg_get_functiondef) of project "HypnoRaffle Web".
-- Run on a database whose Data API is already enabled (that creates the `anonymous`
-- role), then refresh the Data API schema cache.
--
-- Access model: the whole app runs signed-out. Every request carries an anonymous JWT
-- (role claim "anonymous"), and the anonymous role can read and write the app tables,
-- matching the open Supabase policies this replaces. Images are stored in the rows as
-- data: URLs (raffle_images.url, qr_refs.logo_url).

-- ---------------------------------------------------------------- tables

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  is_active boolean default true,
  name text
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  last_name text not null,
  display_name text not null,
  created_at timestamptz default now(),
  session_id uuid references public.sessions(id) on delete cascade,
  email text,
  won boolean default false
);
create index idx_participants_session_id on public.participants (session_id);
create unique index idx_participants_unique_email_per_session
  on public.participants (email, session_id) where email is not null;

create table public.raffle_qr_refs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  short_code text not null unique,
  created_at timestamptz default now()
);
create index idx_raffle_qr_refs_session on public.raffle_qr_refs (session_id);
create index idx_raffle_qr_refs_short_code on public.raffle_qr_refs (short_code);

create table public.qr_refs (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  slug varchar(50) not null unique,
  target_url text not null,
  description text,
  category varchar(50) default 'personal',
  scan_count integer default 0,
  last_scanned_at timestamptz,
  is_active boolean default true,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  display_title varchar(100),
  display_message text,
  logo_url text
);
create index idx_qr_refs_active on public.qr_refs (is_active) where is_active = true;
create index idx_qr_refs_slug on public.qr_refs (slug);

create table public.raffle_images (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------- functions

create or replace function public.generate_short_code(length integer default 6)
returns text
language plpgsql
as $function$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..length loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$function$;

create or replace function public.create_session_with_qr(session_name text default null)
returns table(session_id uuid, short_code text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_session_id uuid;
  new_short_code text;
begin
  insert into public.sessions (name, is_active) values (session_name, true) returning id into new_session_id;

  -- Generate a unique short code
  loop
    new_short_code := public.generate_short_code(6);
    begin
      insert into public.raffle_qr_refs (session_id, short_code) values (new_session_id, new_short_code);
      exit;
    exception when unique_violation then
      -- try again with a new code
    end;
  end loop;

  return query select new_session_id, new_short_code;
end;
$function$;

create or replace function public.update_qr_refs_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create trigger trigger_qr_refs_updated_at
  before update on public.qr_refs
  for each row execute function public.update_qr_refs_updated_at();

-- ---------------------------------------------------------------- access

alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.raffle_qr_refs enable row level security;
alter table public.qr_refs enable row level security;
alter table public.raffle_images enable row level security;

create policy anonymous_all on public.sessions for all to anonymous using (true) with check (true);
create policy anonymous_all on public.participants for all to anonymous using (true) with check (true);
create policy anonymous_all on public.raffle_qr_refs for all to anonymous using (true) with check (true);
create policy anonymous_all on public.qr_refs for all to anonymous using (true) with check (true);
create policy anonymous_all on public.raffle_images for all to anonymous using (true) with check (true);

grant usage on schema public to anonymous;
grant select, insert, update, delete on
  public.sessions, public.participants, public.raffle_qr_refs, public.qr_refs, public.raffle_images
  to anonymous;
grant execute on function public.create_session_with_qr(text) to anonymous;
