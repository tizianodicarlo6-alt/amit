-- Amit · messaggi tra i soci (Supabase). Da incollare in SQL Editor → Run.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_user text not null,
  to_user text not null,
  kind text not null default 'text',
  body text not null default '',
  payload jsonb,
  file_path text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_to_idx on public.messages (to_user, created_at desc);
create index if not exists messages_from_idx on public.messages (from_user, created_at desc);

-- chi sei: "kraken" se entri con kraken@amit-studio.app (solo i soci)
create or replace function public.member_id() returns text
language sql stable as $$
  select case
    when (auth.jwt() ->> 'email') like '%@amit-studio.app'
     and split_part(auth.jwt() ->> 'email', '@', 1) in ('kraken', 'shower')
    then split_part(auth.jwt() ->> 'email', '@', 1)
  end
$$;

alter table public.messages enable row level security;
create policy "leggo i miei messaggi" on public.messages for select to authenticated
  using (to_user = public.member_id() or from_user = public.member_id());
create policy "mando a nome mio" on public.messages for insert to authenticated
  with check (from_user = public.member_id() and to_user in ('kraken', 'shower'));
create policy "segno come letto" on public.messages for update to authenticated
  using (to_user = public.member_id()) with check (to_user = public.member_id());
create policy "cancello i miei" on public.messages for delete to authenticated
  using (to_user = public.member_id() or from_user = public.member_id());

-- file (beat, voci, provini) mandati tra soci
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
create policy "i soci caricano file" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.member_id() is not null);
create policy "i soci leggono i file" on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.member_id() is not null);

-- messaggi in arrivo in tempo reale
alter publication supabase_realtime add table public.messages;

-- permessi per gli utenti che hanno fatto l'accesso (le regole sopra decidono COSA vede ognuno)
grant select, insert, update, delete on public.messages to authenticated;
grant execute on function public.member_id() to authenticated;
