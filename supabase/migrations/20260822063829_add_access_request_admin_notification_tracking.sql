alter table public.access_requests
  add column if not exists admin_notified_at timestamptz;

comment on column public.access_requests.admin_notified_at is
  'Timestamp recorded after the family editor has been successfully emailed about this access request.';

create index if not exists access_requests_pending_unnotified_idx
  on public.access_requests(created_at)
  where status = 'pending' and admin_notified_at is null;
