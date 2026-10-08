-- Executar uma única vez no SQL Editor do Supabase do projeto Financeiro.
-- Bucket PRIVADO: anexos são carregados pelo usuário autenticado e lidos pelo backend.
insert into storage.buckets (id,name,public,file_size_limit)
values ('email-anexos-temporarios','email-anexos-temporarios',false,23068672)
on conflict (id) do update set public=false,file_size_limit=23068672;

drop policy if exists "v347_email_upload_proprio" on storage.objects;
create policy "v347_email_upload_proprio" on storage.objects
for insert to authenticated
with check (bucket_id='email-anexos-temporarios' and (storage.foldername(name))[1]=auth.uid()::text);

-- A exclusão e a leitura são feitas exclusivamente pelo backend com service_role.
-- Configurar uma rotina de limpeza para objetos órfãos com mais de 24 horas.
