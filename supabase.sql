-- Jalankan sekali di Supabase: SQL Editor -> New query -> Run

create table if not exists profiles(
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  phone text unique,
  email text not null
);
alter table profiles enable row level security;
create policy "profil sendiri" on profiles for select using (auth.uid()=id);

-- buat profil otomatis saat ada akun baru (daftar biasa maupun Google)
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id,username,phone,email) values(
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)||substr(new.id::text,1,4))),
    new.raw_user_meta_data->>'phone',
    new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- akun lama yang sudah ada sebelum tabel ini dibuat
insert into profiles(id,username,email)
  select id, split_part(email,'@',1)||substr(id::text,1,4), email from auth.users on conflict do nothing;

-- login pakai username / no HP: cari email-nya
create or replace function login_email(idf text) returns text language sql stable security definer set search_path=public as $$
  select email from profiles where lower(username)=lower(idf) or phone=idf limit 1 $$;
-- cek username / no HP belum dipakai saat daftar
create or replace function is_available(u text, p text) returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from profiles where lower(username)=lower(u) or phone=p) $$;
grant execute on function login_email(text), is_available(text,text) to anon, authenticated;

-- playlist dan riwayat nonton (tiap akun hanya bisa lihat miliknya)
create table if not exists playlist(
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  movie_id int not null, title text, poster text, added_at timestamptz default now(),
  primary key(user_id,movie_id));
create table if not exists history(
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  movie_id int not null, title text, poster text, watched_at timestamptz default now(),
  primary key(user_id,movie_id));
alter table playlist enable row level security;
alter table history enable row level security;
create policy "playlist sendiri" on playlist for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "riwayat sendiri" on history for all using (auth.uid()=user_id) with check (auth.uid()=user_id);