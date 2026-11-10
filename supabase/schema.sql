-- Caderno de Cozinha: tabelas, permissões (RLS) e criação automática de perfil.
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.

-- Perfis públicos (o @ que aparece nas receitas da comunidade).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,30}$'),
  created_at timestamptz not null default now()
);

-- Receitas: o conteúdo fica em "data" no mesmo formato dos arquivos de recipes/.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  slug text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object' and coalesce(data->>'title', '') <> ''),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, slug)
);
create index if not exists recipes_public_idx on public.recipes (is_public, created_at desc);

create table if not exists public.recipe_likes (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_likes enable row level security;

-- Perfis: todos leem; cada um edita só o seu.
drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles for select using (true);
drop policy if exists "editar o proprio perfil" on public.profiles;
create policy "editar o proprio perfil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Receitas: públicas para todos; privadas só para o dono. Só o dono cria, edita e apaga.
drop policy if exists "ler receitas" on public.recipes;
create policy "ler receitas" on public.recipes for select using (is_public or owner = auth.uid());
drop policy if exists "criar receitas" on public.recipes;
create policy "criar receitas" on public.recipes for insert with check (owner = auth.uid());
drop policy if exists "editar receitas" on public.recipes;
create policy "editar receitas" on public.recipes for update using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "apagar receitas" on public.recipes;
create policy "apagar receitas" on public.recipes for delete using (owner = auth.uid());

-- Curtidas: todos veem; cada um curte e descurte só por si, e só receitas que consegue ver.
drop policy if exists "ver curtidas" on public.recipe_likes;
create policy "ver curtidas" on public.recipe_likes for select using (true);
drop policy if exists "curtir" on public.recipe_likes;
create policy "curtir" on public.recipe_likes for insert with check (
  user_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_id and (r.is_public or r.owner = auth.uid()))
);
drop policy if exists "descurtir" on public.recipe_likes;
create policy "descurtir" on public.recipe_likes for delete using (user_id = auth.uid());

-- Lista usada pelo site: receita + @ do autor + curtidas. security_invoker faz a view respeitar o RLS acima.
create or replace view public.recipe_feed with (security_invoker = true) as
select r.id, r.owner, r.slug, r.data, r.is_public, r.created_at, r.updated_at, p.username,
  (select count(*) from public.recipe_likes l where l.recipe_id = r.id)::int as likes,
  exists (select 1 from public.recipe_likes l where l.recipe_id = r.id and l.user_id = auth.uid()) as liked
from public.recipes r join public.profiles p on p.id = r.owner;

-- Permissões da API. Necessárias se "Automatically expose new tables" estiver desligado no projeto
-- (recomendado); se estiver ligado, não fazem mal. O RLS acima continua decidindo quais linhas cada um vê.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.recipes, public.recipe_likes, public.recipe_feed to anon, authenticated;
grant update (username) on public.profiles to authenticated;
grant insert, update, delete on public.recipes to authenticated;
grant insert, delete on public.recipe_likes to authenticated;

-- Ao criar uma conta, cria o perfil com um @ derivado do nome (sem usar o e-mail, que fica privado).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text; candidate text;
begin
  base := lower(regexp_replace(
    translate(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
    '[^a-zA-Z0-9]+', '', 'g'));
  base := left(coalesce(nullif(base, ''), 'cozinheiro'), 20);
  if length(base) < 3 then base := base || 'chef'; end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || floor(random() * 10000)::int;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
