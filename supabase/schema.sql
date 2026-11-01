-- Candle Wish database. Paste this whole file into the Supabase SQL editor and run it once.
-- Browsers can only call the functions below. They can't read the tables directly,
-- except party_live, which holds nothing private and is what the live audience listens to.

create table if not exists public.parties (
  id text primary key,
  config jsonb not null,
  code text not null,
  plan_key text not null,
  live_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.star_tokens (
  party_id text not null references public.parties on delete cascade,
  token text not null,
  primary key (party_id, token)
);

create table if not exists public.candle_messages (
  party_id text not null references public.parties on delete cascade,
  candle int not null,
  sender text not null,
  body text not null,
  created_at timestamptz not null default now(),
  primary key (party_id, candle)
);

create table if not exists public.rate_limits (
  key text primary key,
  count int not null,
  until timestamptz not null
);

-- Found by a key that can't be turned back into a party link, so listing this table reveals no parties.
create table if not exists public.party_live (
  live_key text primary key,
  state jsonb not null,
  taken jsonb not null default '[]',
  revision int not null default 0
);

alter table public.parties enable row level security;
alter table public.star_tokens enable row level security;
alter table public.candle_messages enable row level security;
alter table public.rate_limits enable row level security;
alter table public.party_live enable row level security;

drop policy if exists "Anyone can watch" on public.party_live;
create policy "Anyone can watch" on public.party_live for select to anon, authenticated using (true);

grant select on public.party_live to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'party_live') then
    alter publication supabase_realtime add table public.party_live;
  end if;
end $$;

-- Helpers. Browsers can't call these.

create or replace function public.random_hex(length int) returns text
language sql volatile set search_path = '' as $$
  select left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), length)
$$;

create or replace function public.make_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  hex text := replace(gen_random_uuid()::text, '-', '');
  result text := '';
begin
  for i in 0..5 loop
    result := result || substr(alphabet, 1 + (('x' || substr(hex, i * 4 + 1, 4))::bit(16)::int % length(alphabet)), 1);
  end loop;
  return result;
end $$;

create or replace function public.visitor() returns text
language sql stable set search_path = '' as $$
  select coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown')
$$;

-- Counts an action and returns false once the limit for this window is used up.
create or replace function public.allow(limit_key text, max_count int, window_minutes int) returns boolean
language plpgsql volatile set search_path = '' as $$
declare
  used int;
begin
  insert into public.rate_limits as r (key, count, until)
  values (limit_key, 1, now() + make_interval(mins => window_minutes))
  on conflict (key) do update
    set count = case when r.until < now() then 1 else r.count + 1 end,
        until = case when r.until < now() then excluded.until else r.until end
  returning count into used;
  return used <= max_count;
end $$;

create or replace function public.clean_text(value jsonb, max_length int) returns text
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) = 'string' then left(btrim(value #>> '{}'), max_length) else '' end
$$;

create or replace function public.is_color(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'string' and (value #>> '{}') ~* '^#[0-9a-f]{6}$'
$$;

create or replace function public.clean_config(body jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  name text := public.clean_text(body -> 'name', 40);
  age_value jsonb := body -> 'age';
  age int;
begin
  if name = '' then raise exception 'Add the birthday person''s name.'; end if;
  if jsonb_typeof(body -> 'tiers') is distinct from 'number' or (body ->> 'tiers') !~ '^[1-3]$' then
    raise exception 'Tiers must be 1 to 3.';
  end if;
  if jsonb_typeof(body -> 'candles') is distinct from 'number' or (body ->> 'candles') !~ '^[0-9]{1,2}$'
     or (body ->> 'candles')::int not between 1 and 30 then
    raise exception 'Candles must be 1 to 30.';
  end if;
  if not coalesce(public.is_color(body -> 'frosting') and public.is_color(body -> 'sponge')
     and jsonb_typeof(body -> 'candleColors') = 'array' and jsonb_array_length(body -> 'candleColors') = 2
     and public.is_color(body -> 'candleColors' -> 0) and public.is_color(body -> 'candleColors' -> 1), false) then
    raise exception 'Pick a color for each part of the cake.';
  end if;
  if jsonb_typeof(age_value) = 'number' and (age_value #>> '{}') ~ '^[0-9]{1,3}$'
     and (age_value #>> '{}')::int between 1 and 149 then
    age := (age_value #>> '{}')::int;
  end if;
  return jsonb_build_object(
    'name', name,
    'age', age,
    'message', public.clean_text(body -> 'message', 120),
    'tiers', (body ->> 'tiers')::int,
    'candles', (body ->> 'candles')::int,
    'frosting', body -> 'frosting',
    'sponge', body -> 'sponge',
    'candleColors', body -> 'candleColors'
  );
end $$;

create or replace function public.fresh_state(candles int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'stage', 'waiting',
    'lit', (select jsonb_agg(true) from generate_series(1, candles)),
    'gust', 0
  )
$$;

create or replace function public.taken_list(party text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('candle', candle, 'from', sender) order by candle), '[]'::jsonb)
  from public.candle_messages where party_id = party
$$;

create or replace function public.is_star(party text, star_token text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.star_tokens where party_id = party and token = star_token)
$$;

-- What browsers can call.

create or replace function public.create_party(body jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  config jsonb := public.clean_config(body);
  new_id text := public.random_hex(12);
  new_code text := public.make_code();
  new_key text := public.random_hex(32);
  new_live text := encode(sha256(convert_to(public.random_hex(32) || new_id, 'UTF8')), 'hex');
begin
  if not public.allow('create:' || public.visitor(), 30, 60) then
    raise exception 'That''s a lot of cakes. Try again in a while.';
  end if;
  insert into public.parties (id, config, code, plan_key, live_key) values (new_id, config, new_code, new_key, new_live);
  insert into public.party_live (live_key, state) values (new_live, public.fresh_state((config ->> 'candles')::int));
  return jsonb_build_object('id', new_id, 'code', new_code, 'planKey', new_key);
end $$;

create or replace function public.read_plan(party text, key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  found public.parties;
begin
  select * into found from public.parties where id = party and plan_key = key;
  if found.id is null then return null; end if;
  return jsonb_build_object(
    'config', found.config,
    'code', found.code,
    'messageCount', (select count(*) from public.candle_messages where party_id = party)
  );
end $$;

create or replace function public.update_party(party text, key text, body jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  new_config jsonb := public.clean_config(body);
  found public.parties;
  last_used int;
begin
  select * into found from public.parties where id = party and plan_key = key;
  if found.id is null then raise exception 'This planner link isn''t valid.'; end if;
  select max(candle) into last_used from public.candle_messages where party_id = party;
  if (new_config ->> 'candles')::int <= coalesce(last_used, -1) then
    raise exception 'Candle % has a message, so keep at least % candles.', last_used + 1, last_used + 1;
  end if;
  update public.parties set config = new_config where id = party;
  update public.party_live
    set state = public.fresh_state((new_config ->> 'candles')::int), revision = revision + 1
    where live_key = found.live_key;
end $$;

create or replace function public.read_party(party text, star_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  found public.parties;
  live public.party_live;
begin
  select * into found from public.parties where id = party;
  if found.id is null then return null; end if;
  select * into live from public.party_live where live_key = found.live_key;
  return jsonb_build_object(
    'config', found.config,
    'state', live.state,
    'taken', live.taken,
    'revision', live.revision,
    'liveKey', found.live_key,
    'role', case when public.is_star(party, star_token) then 'star' else 'audience' end
  );
end $$;

create or replace function public.unlock_party(party text, entered text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  found public.parties;
  attempts_key text := 'code:' || party;
  used int;
  new_token text := public.random_hex(32);
begin
  select * into found from public.parties where id = party;
  if found.id is null then raise exception 'This cake doesn''t exist.'; end if;
  select count into used from public.rate_limits where key = attempts_key and until > now();
  if coalesce(used, 0) >= 10 then raise exception 'Too many tries. Wait a few minutes.'; end if;
  if regexp_replace(upper(left(entered, 20)), '[^A-Z0-9]', '', 'g') <> found.code then
    -- Returns instead of raising, because raising would also undo this count.
    perform public.allow(attempts_key, 10, 10);
    return null;
  end if;
  delete from public.rate_limits where key = attempts_key;
  insert into public.star_tokens (party_id, token) values (party, new_token);
  return new_token;
end $$;

create or replace function public.set_party_state(party text, star_token text, new_state jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  found public.parties;
  lit jsonb := new_state -> 'lit';
  gust numeric;
begin
  select * into found from public.parties where id = party;
  if found.id is null or not public.is_star(party, star_token) then
    raise exception 'Only the birthday person can do that.';
  end if;
  if (new_state ->> 'stage') is null or (new_state ->> 'stage') not in ('waiting', 'blowing', 'done')
     or jsonb_typeof(lit) is distinct from 'array'
     or jsonb_array_length(lit) <> (found.config ->> 'candles')::int
     or exists (select 1 from jsonb_array_elements(lit) item where jsonb_typeof(item) <> 'boolean')
     or jsonb_typeof(new_state -> 'gust') is distinct from 'number' then
    raise exception 'Invalid state.';
  end if;
  gust := least(1, greatest(0, (new_state ->> 'gust')::numeric));
  update public.party_live
    set state = jsonb_build_object('stage', new_state ->> 'stage', 'lit', lit, 'gust', gust)
    where live_key = found.live_key;
end $$;

create or replace function public.add_candle_message(party text, candle_number int, sender_name jsonb, message jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  found public.parties;
  sender_clean text := public.clean_text(sender_name, 40);
  body_clean text := public.clean_text(message, 280);
  existing text;
begin
  select * into found from public.parties where id = party;
  if found.id is null then raise exception 'This cake doesn''t exist.'; end if;
  if candle_number is null or candle_number < 0 or candle_number >= (found.config ->> 'candles')::int then
    raise exception 'That candle doesn''t exist.';
  end if;
  if sender_clean = '' or body_clean = '' then raise exception 'Add your name and a message.'; end if;
  select sender into existing from public.candle_messages where party_id = party and candle = candle_number;
  if existing is not null then raise exception '% just wrote on that candle. Pick another one.', existing; end if;
  if not public.allow('message:' || party || ':' || public.visitor(), 12, 10) then
    raise exception 'That''s a lot of messages. Try again in a few minutes.';
  end if;
  insert into public.candle_messages (party_id, candle, sender, body) values (party, candle_number, sender_clean, body_clean);
  update public.party_live set taken = public.taken_list(party) where live_key = found.live_key;
end $$;

create or replace function public.read_candle_messages(party text, star_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_star(party, star_token) then
    raise exception 'Only the birthday person can read these.';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('candle', candle, 'from', sender, 'text', body) order by candle), '[]'::jsonb)
    from public.candle_messages where party_id = party
  );
end $$;

-- Lock everything down, then open only the functions above.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_party(jsonb),
  public.read_plan(text, text),
  public.update_party(text, text, jsonb),
  public.read_party(text, text),
  public.unlock_party(text, text),
  public.set_party_state(text, text, jsonb),
  public.add_candle_message(text, int, jsonb, jsonb),
  public.read_candle_messages(text, text)
to anon, authenticated;
