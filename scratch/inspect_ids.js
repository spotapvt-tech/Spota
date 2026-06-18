import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tables = [
  'spots',
  'profiles',
  'comments',
  'vibe_ratings',
  'playlists',
  'chats',
  'chat_messages',
  'trips',
  'trip_members',
  'trip_spots',
  'trip_spot_votes',
  'safe_treks',
  'agency_profiles',
  'agency_leads'
];

async function inspect() {
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table "${table}": Error - ${error.message}`);
    } else {
      console.log(`Table "${table}": Columns -`, data.length > 0 ? Object.keys(data[0]) : 'Empty table');
      if (data.length > 0) {
        console.log(`Table "${table}": Sample row -`, data[0]);
      }
    }
  }
}

inspect();
