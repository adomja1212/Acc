-- =====================================================================
--  نظام المحاسب — إعداد قاعدة بيانات Supabase (يُشغَّل مرة واحدة من SQL Editor)
--  جدول واحد للوثائق + قواعد حماية على الخادم + دوال إدارة كلمات المرور
-- =====================================================================

create table if not exists public.docs (
  path       text primary key,              -- مثل salesInvoices/abc123 أو meta/settings
  coll       text not null,                 -- اسم الجدول (أول جزء من المسار)
  body       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists docs_coll_idx on public.docs (coll);
create index if not exists docs_authid_idx on public.docs ((body->>'authId')) where coll = 'appUsers';

-- من عدّل آخر مرة ومتى (يكتبه الخادم، لا يمكن تزويره من المتصفح)
create or replace function public.docs_stamp() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.coll := split_part(new.path, '/', 1);
  return new;
end $$;
drop trigger if exists docs_stamp on public.docs;
create trigger docs_stamp before insert or update on public.docs for each row execute function public.docs_stamp();

-- ----- هوية المستخدم داخل البرنامج -----
create or replace function public.acc_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select body from public.docs
  where coll = 'appUsers' and body->>'authId' = auth.uid()::text
    and coalesce((body->>'active')::boolean, true)
  limit 1
$$;
create or replace function public.acc_is_member() returns boolean
language sql stable security definer set search_path = public as $$ select public.acc_me() is not null $$;
create or replace function public.acc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.acc_me()->>'role' = 'admin', false) $$;
create or replace function public.acc_has_users() returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.docs where coll = 'appUsers') $$;

-- من يحق له الكتابة في مسار معين
create or replace function public.acc_can_write(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select case split_part(p, '/', 1)
    -- المستخدمون: المدير فقط (أو إنشاء أول مدير عندما لا يوجد أي مستخدم)
    when 'appUsers' then public.acc_is_admin() or not public.acc_has_users()
    -- دليل الحسابات والإعدادات: المدير فقط
    when 'accounts' then public.acc_is_admin()
    when 'meta'     then public.acc_is_admin()
    -- تفضيلات كل مستخدم: صاحبها فقط
    when 'data'     then public.acc_is_member() and p like 'data/users/' || auth.uid()::text || '/%'
    -- باقي الجداول (الحركات والبيانات الأساسية): أي مستخدم نشط
    else public.acc_is_member()
  end
$$;

-- ----- قواعد الحماية (Row Level Security) -----
alter table public.docs enable row level security;
drop policy if exists docs_read on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
-- القراءة: المستخدمون النشطون فقط (حساب جديد غير مسجّل في البرنامج لا يرى شيئاً)
create policy docs_read   on public.docs for select to authenticated using ((select public.acc_is_member()) or (not (select public.acc_has_users())));
create policy docs_insert on public.docs for insert to authenticated with check (public.acc_can_write(path));
create policy docs_update on public.docs for update to authenticated using (public.acc_can_write(path)) with check (public.acc_can_write(path));
create policy docs_delete on public.docs for delete to authenticated using (public.acc_can_write(path));

revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant execute on function public.acc_has_users() to anon, authenticated;
grant execute on function public.acc_me(), public.acc_is_member(), public.acc_is_admin(), public.acc_can_write(text) to authenticated;

-- ----- إدارة كلمات المرور (المدير فقط) -----
create or replace function public.acc_admin_set_password(target uuid, new_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.acc_is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(new_password) < 8 then raise exception 'password too short'; end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now() where id = target;
  -- إنهاء الجلسات المفتوحة لهذا المستخدم
  delete from auth.refresh_tokens where user_id::text = target::text;
  delete from auth.sessions where user_id = target;
end $$;

create or replace function public.acc_admin_set_login(target uuid, new_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.acc_is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update auth.users set email = lower(new_email), updated_at = now() where id = target;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', lower(new_email)), updated_at = now()
    where user_id = target and provider = 'email';
end $$;

revoke all on function public.acc_admin_set_password(uuid, text) from public, anon;
revoke all on function public.acc_admin_set_login(uuid, text) from public, anon;
grant execute on function public.acc_admin_set_password(uuid, text) to authenticated;
grant execute on function public.acc_admin_set_login(uuid, text) to authenticated;

-- ----- المزامنة اللحظية -----
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

select 'تم إعداد قاعدة البيانات بنجاح ✅' as result;
