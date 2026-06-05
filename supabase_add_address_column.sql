-- Alter spots table to add the address text column
alter table public.spots add column if not exists address text;
