-- Jalankan sekali di Supabase SQL Editor (setelah supabase.sql): foto profil dan banner
alter table profiles add column if not exists avatar text, add column if not exists banner text;
revoke update on profiles from anon, authenticated;
grant update(avatar,banner) on profiles to authenticated;
create policy "ubah profil sendiri" on profiles for update using (auth.uid()=id) with check (auth.uid()=id);