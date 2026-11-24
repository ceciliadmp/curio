-- curió · banco de dados dos artigos (Supabase)
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → cole → Run.
-- Pode rodar de novo sem problema: tudo é criado só se ainda não existir.

-- 1. Quem pode administrar -------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admin le o proprio registro" on public.admins;
create policy "admin le o proprio registro" on public.admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 2. Artigos ---------------------------------------------------------------
-- O corpo fica em "content" como JSON estruturado (documento do editor), nunca HTML.
create table if not exists public.articles (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid references auth.users (id) default auth.uid(),
  title            text not null default '',
  subtitle         text not null default '',
  content          jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  slug             text unique,
  display_title    text,
  display_subtitle text,
  cover_url        text,
  cover_focal_x    real not null default 50 check (cover_focal_x between 0 and 100),
  cover_focal_y    real not null default 50 check (cover_focal_y between 0 and 100),
  tags             text[] not null default '{}' check (cardinality(tags) <= 3),
  word_count       integer not null default 0,
  reading_minutes  integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz,
  draft            jsonb, -- edições ainda não publicadas de um artigo já publicado
  author_name      text not null default '',
  author_location  text not null default '',
  author_photo_url text
);
alter table public.articles add column if not exists author_name text not null default '';
alter table public.articles add column if not exists author_location text not null default '';
alter table public.articles add column if not exists author_photo_url text;
alter table public.articles add column if not exists author_url text not null default ''; -- site ou LinkedIn do autor(a)
alter table public.articles add column if not exists draft jsonb;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists articles_touch on public.articles;
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

alter table public.articles enable row level security;
drop policy if exists "todos leem publicados" on public.articles;
create policy "todos leem publicados" on public.articles
  for select to anon, authenticated using (status = 'published');
drop policy if exists "admins leem tudo" on public.articles;
create policy "admins leem tudo" on public.articles
  for select to authenticated using (public.is_admin());
drop policy if exists "admins criam" on public.articles;
create policy "admins criam" on public.articles
  for insert to authenticated with check (public.is_admin());
drop policy if exists "admins editam" on public.articles;
create policy "admins editam" on public.articles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins apagam" on public.articles;
create policy "admins apagam" on public.articles
  for delete to authenticated using (public.is_admin());

-- 3. Imagens dos artigos ---------------------------------------------------
-- Bucket público para leitura; só admins enviam, trocam ou apagam.
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

drop policy if exists "admins enviam imagens" on storage.objects;
create policy "admins enviam imagens" on storage.objects
  for insert to authenticated with check (bucket_id = 'article-images' and public.is_admin());
drop policy if exists "admins trocam imagens" on storage.objects;
create policy "admins trocam imagens" on storage.objects
  for update to authenticated using (bucket_id = 'article-images' and public.is_admin());
drop policy if exists "admins apagam imagens" on storage.objects;
create policy "admins apagam imagens" on storage.objects
  for delete to authenticated using (bucket_id = 'article-images' and public.is_admin());

-- 0. Permissões da API (projetos novos do Supabase não liberam tabelas novas sozinhos)
grant usage on schema public to anon, authenticated;
revoke select on public.articles from anon;
grant select (id, slug, title, subtitle, content, status, display_title, display_subtitle, cover_url,
  cover_focal_x, cover_focal_y, tags, word_count, reading_minutes, created_at, updated_at, published_at,
  author_name, author_location, author_photo_url, author_url)
  on public.articles to anon; -- o rascunho de edição (draft) não fica visível para o público
grant select, insert, update, delete on public.articles to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- 4. Torne sua conta admin ---------------------------------------------------
-- Antes: Authentication → Users → Add user (com e-mail e senha).
-- Depois troque o e-mail abaixo pelo seu e rode só esta linha:
-- insert into public.admins (user_id) select id from auth.users where email = 'seu-email@exemplo.com';
