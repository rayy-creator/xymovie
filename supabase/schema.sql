-- XYWAIFU fresh Supabase project schema
-- Run this only in the NEW XYWAIFU project, not the old XYMovie project.
create extension if not exists pgcrypto;
create table if not exists public.characters (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,
 personality text default '',
 reference_images text[] not null default '{}',
 model_url text,
 created_at timestamptz not null default now()
);
create table if not exists public.voice_samples (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 storage_path text not null,
 original_name text,
 created_at timestamptz not null default now()
);
create table if not exists public.conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 title text default 'Percakapan baru',
 created_at timestamptz not null default now()
);
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('user','assistant','system')),
 content text not null,
 emotion text,
 created_at timestamptz not null default now()
);
alter table public.characters enable row level security;
alter table public.voice_samples enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy "Users manage own characters" on public.characters for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users manage own voice samples" on public.voice_samples for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users manage own conversations" on public.conversations for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users manage own messages" on public.messages for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('character-images','character-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('voice-samples','voice-samples',false,52428800,array['audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/flac','audio/x-m4a'])
on conflict (id) do nothing;
create policy "Users upload own character images" on storage.objects for insert to authenticated with check (bucket_id='character-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users read own character images" on storage.objects for select to authenticated using (bucket_id='character-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users delete own character images" on storage.objects for delete to authenticated using (bucket_id='character-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users upload own voice samples" on storage.objects for insert to authenticated with check (bucket_id='voice-samples' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users read own voice samples" on storage.objects for select to authenticated using (bucket_id='voice-samples' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Users delete own voice samples" on storage.objects for delete to authenticated using (bucket_id='voice-samples' and (storage.foldername(name))[1]=auth.uid()::text);
