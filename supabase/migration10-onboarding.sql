-- onboarding: track whether an owner has been through /welcome.
-- Null = show the flow on next sign-in; set once at the reveal (or on skip).

do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profile_private'
                   and column_name = 'onboarded_at') then
    alter table public.profile_private add column onboarded_at timestamptz;

    -- accounts that predate the flow never see it: make sure every owned
    -- profile has a private row, then stamp them all as already onboarded
    insert into public.profile_private (profile_id)
    select p.id from public.profiles p where p.user_id is not null
    on conflict (profile_id) do nothing;

    update public.profile_private pp
       set onboarded_at = now()
      from public.profiles p
     where p.id = pp.profile_id and p.user_id is not null;
  end if;
end $$;
