-- 1. Create storage buckets if they do not exist
insert into storage.buckets (id, name, public)
values ('spot-images', 'spot-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('spot-videos', 'spot-videos', true)
on conflict (id) do nothing;

-- 2. Create policies to allow public access for uploads and reads
-- Policy for inserting/uploading files into spot-images bucket
drop policy if exists "Allow public uploads to spot-images" on storage.objects;
create policy "Allow public uploads to spot-images"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'spot-images');

-- Policy for reading files from spot-images bucket
drop policy if exists "Allow public reads from spot-images" on storage.objects;
create policy "Allow public reads from spot-images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'spot-images');

-- Policy for inserting/uploading files into spot-videos bucket
drop policy if exists "Allow public uploads to spot-videos" on storage.objects;
create policy "Allow public uploads to spot-videos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'spot-videos');

-- Policy for reading files from spot-videos bucket
drop policy if exists "Allow public reads from spot-videos" on storage.objects;
create policy "Allow public reads from spot-videos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'spot-videos');
