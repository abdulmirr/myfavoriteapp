-- profile settings: a standing note that steers the weekly AI recommendations
alter table public.profiles
  add column if not exists taste_note text not null default '';
