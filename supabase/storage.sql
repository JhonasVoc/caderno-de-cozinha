-- Caderno de Cozinha: espaço para as fotos das receitas (Supabase Storage).
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- As fotos ficam em recipe-images/<id da conta>/<arquivo>.jpg. Qualquer pessoa com o link vê a foto
-- (o bucket é público, como uma imagem de site), mas só o dono da pasta envia, troca ou apaga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- O Storage exige permissão de leitura na API para apagar (sem ela, apagar "dá certo" mas não apaga nada).
-- Isso não muda quem vê as fotos: o link público continua funcionando para todos.
drop policy if exists "fotos: ver as proprias" on storage.objects;
create policy "fotos: ver as proprias" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: enviar na propria pasta" on storage.objects;
create policy "fotos: enviar na propria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: trocar as proprias" on storage.objects;
create policy "fotos: trocar as proprias" on storage.objects for update to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: apagar as proprias" on storage.objects;
create policy "fotos: apagar as proprias" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
