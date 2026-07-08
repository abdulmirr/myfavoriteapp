-- Grid reorder: one call persists a whole new "my order". Invoker rights on
-- purpose — the UPDATE runs through the items RLS policy, so ids the caller
-- doesn't own are silently skipped rather than trusted. Idempotent.

create or replace function public.reorder_items(p_ids uuid[])
returns void
language sql as $$
  update public.items i
     set sort_order = u.ord - 1
    from unnest(p_ids) with ordinality as u(id, ord)
   where i.id = u.id;
$$;

revoke all on function public.reorder_items(uuid[]) from public, anon;
grant execute on function public.reorder_items(uuid[]) to authenticated;
