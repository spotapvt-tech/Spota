-- Enable UPDATE permissions on spots table for everyone (so reactions, shares, and reports can be synced)
drop policy if exists "Allow anyone to update spots" on public.spots;

create policy "Allow anyone to update spots" 
  on public.spots 
  for update 
  using (true)
  with check (true);
