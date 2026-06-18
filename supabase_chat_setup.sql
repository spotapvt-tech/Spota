-- 1. Create chats table representing conversations between two users
create table if not exists public.chats (
  id serial primary key,
  user1_id uuid references public.profiles(id) on delete cascade not null,
  user2_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Prevent duplicate rooms between the same two users
  constraint unique_users unique (user1_id, user2_id),
  -- Enforce consistent user ordering (user1_id < user2_id) to simplify querying and insertion
  constraint user_ordering check (user1_id < user2_id)
);

-- 2. Create chat_messages table
create table if not exists public.chat_messages (
  id serial primary key,
  chat_id integer references public.chats(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Enable Row Level Security (RLS)
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

-- 4. Create RLS Policies for chats
drop policy if exists "Users can view chats they are part of." on public.chats;
create policy "Users can view chats they are part of." 
  on public.chats 
  for select 
  using (auth.uid() = user1_id or auth.uid() = user2_id);

drop policy if exists "Users can create chats they are part of." on public.chats;
create policy "Users can create chats they are part of." 
  on public.chats 
  for insert 
  with check (auth.uid() = user1_id or auth.uid() = user2_id);

-- 5. Create RLS Policies for chat_messages
drop policy if exists "Users can view messages in their chats." on public.chat_messages;
create policy "Users can view messages in their chats." 
  on public.chat_messages 
  for select 
  using (
    exists (
      select 1 from public.chats 
      where chats.id = chat_messages.chat_id 
      and (chats.user1_id = auth.uid() or chats.user2_id = auth.uid())
    )
  );

drop policy if exists "Users can send messages in their chats." on public.chat_messages;
create policy "Users can send messages in their chats." 
  on public.chat_messages 
  for insert 
  with check (
    auth.uid() = sender_id 
    and exists (
      select 1 from public.chats 
      where chats.id = chat_messages.chat_id 
      and (chats.user1_id = auth.uid() or chats.user2_id = auth.uid())
    )
  );

-- 6. Enable real-time replication for chats and chat_messages
do $$
begin
  -- Ensure publication exists
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Check and add public.chats
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;

  -- Check and add public.chat_messages
  if not exists (
    select 1 
    from pg_publication_rel pr
    join pg_class c on pr.prrelid = c.oid
    join pg_publication p on pr.prpubid = p.oid
    where p.pubname = 'supabase_realtime' and c.relname = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
