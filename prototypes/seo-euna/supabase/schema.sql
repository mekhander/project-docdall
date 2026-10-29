-- 러닝메이트 P0 스키마 (docs/specs/seo-euna-runningmate.md)
-- 본문은 저장하지 않는다. 닉네임, 그룹, 날짜, 글자 수, 진행률, 주간 약속만 둔다.
-- 테이블은 RLS로 막고, 브라우저는 아래 함수(rpc)로만 읽고 쓴다.

create table public.groups (
  code text primary key,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid(),
  group_code text not null references public.groups(code) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  target_date date not null,
  toc_done int not null default 0 check (toc_done >= 0),
  toc_total int not null default 0 check (toc_total >= 0),
  created_at timestamptz not null default now(),
  unique (group_code, nickname)
);

create table public.daily_logs (
  member_id uuid not null references public.members(id) on delete cascade,
  day date not null,
  chars int not null check (chars >= 0),
  primary key (member_id, day)
);

create table public.weekly_goals (
  member_id uuid not null references public.members(id) on delete cascade,
  week_start date not null,
  days int not null check (days between 1 and 7),
  primary key (member_id, week_start)
);

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.daily_logs enable row level security;
alter table public.weekly_goals enable row level security;
revoke all on public.groups, public.members, public.daily_logs, public.weekly_goals from anon, authenticated;

-- 쓰기 권한 확인: 내 member id와 그때 받은 token이 맞아야 한다.
create function public.rm_check(p_member uuid, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from members where id = p_member and token = p_token) then
    raise exception 'not_member';
  end if;
end $$;

create function public.create_group() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (code) values (v_code);
  return v_code;
end $$;

-- 최대 7명. 목표일 경고는 브라우저가 보드를 미리 보고 띄운다.
create function public.join_group(p_code text, p_nickname text, p_target_date date) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_member members;
begin
  perform 1 from groups where code = upper(p_code) for update;
  if not found then
    raise exception 'no_group';
  end if;
  if (select count(*) from members where group_code = upper(p_code)) >= 7 then
    raise exception 'group_full';
  end if;
  if exists (select 1 from members where group_code = upper(p_code) and nickname = p_nickname) then
    raise exception 'nickname_taken';
  end if;
  insert into members (group_code, nickname, target_date)
  values (upper(p_code), p_nickname, p_target_date)
  returning * into v_member;
  return json_build_object('member_id', v_member.id, 'token', v_member.token);
end $$;

-- 보드: 본문 없이 기록과 약속만. token은 내보내지 않는다.
create function public.get_board(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where code = upper(p_code)) then
    return null;
  end if;
  return json_build_object(
    'code', upper(p_code),
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id,
        'nickname', m.nickname,
        'target_date', m.target_date,
        'toc_done', m.toc_done,
        'toc_total', m.toc_total,
        'logs', coalesce((select json_agg(json_build_object('day', l.day, 'chars', l.chars) order by l.day)
                          from daily_logs l where l.member_id = m.id), '[]'::json),
        'goals', coalesce((select json_agg(json_build_object('week_start', w.week_start, 'days', w.days) order by w.week_start)
                           from weekly_goals w where w.member_id = m.id), '[]'::json)
      ) order by m.created_at)
      from members m where m.group_code = upper(p_code)), '[]'::json));
end $$;

-- 그날 저장한 글자 수 합계를 올린다 (브라우저가 하루 합계를 계산해서 보낸다).
create function public.upsert_log(p_member uuid, p_token uuid, p_day date, p_chars int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform rm_check(p_member, p_token);
  insert into daily_logs (member_id, day, chars) values (p_member, p_day, p_chars)
  on conflict (member_id, day) do update set chars = excluded.chars;
end $$;

create function public.set_progress(p_member uuid, p_token uuid, p_done int, p_total int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform rm_check(p_member, p_token);
  update members set toc_done = p_done, toc_total = p_total where id = p_member;
end $$;

-- 이번 주에 적용 중인 약속이 없으면 이번 주부터, 있으면(지난주에 정한 것 포함) 다음 주부터 적용한다.
create function public.set_goal(p_member uuid, p_token uuid, p_today date, p_days int) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_week date := p_today - (extract(isodow from p_today)::int - 1);
begin
  perform rm_check(p_member, p_token);
  if exists (select 1 from weekly_goals where member_id = p_member and week_start <= v_week) then
    v_week := v_week + 7;
  end if;
  insert into weekly_goals (member_id, week_start, days) values (p_member, v_week, p_days)
  on conflict (member_id, week_start) do update set days = excluded.days;
  return json_build_object('week_start', v_week, 'days', p_days);
end $$;

revoke all on function public.rm_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_group(), public.join_group(text, text, date), public.get_board(text),
  public.upsert_log(uuid, uuid, date, int), public.set_progress(uuid, uuid, int, int),
  public.set_goal(uuid, uuid, date, int) from public;
grant execute on function public.create_group(), public.join_group(text, text, date), public.get_board(text),
  public.upsert_log(uuid, uuid, date, int), public.set_progress(uuid, uuid, int, int),
  public.set_goal(uuid, uuid, date, int) to anon, authenticated;
