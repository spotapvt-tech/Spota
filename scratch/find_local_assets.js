import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Searching for any "/seeded-assets" references in other tables...');
  
  // 1. Check profiles table
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url');
  
  if (profError) {
    console.error('Error fetching profiles:', profError);
  } else {
    const localAvatars = profiles.filter(p => p.avatar_url && p.avatar_url.includes('/seeded-assets'));
    console.log(`Profiles with local avatar_url: ${localAvatars.length}`);
    if (localAvatars.length > 0) {
      console.log('Sample local avatars:', localAvatars.slice(0, 5));
    }
  }

  // 2. Check comments table
  const { data: comments, error: commError } = await supabase
    .from('comments')
    .select('id, user_id, spot_id');
  if (commError) {
    console.error('Error fetching comments:', commError);
  } else {
    console.log(`Total comments: ${comments.length}`);
  }
}

main();
