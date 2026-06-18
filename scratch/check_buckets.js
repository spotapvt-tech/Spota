import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Attempting to create "spot-images" bucket...');
  const { data: imgData, error: imgError } = await supabase.storage.createBucket('spot-images', {
    public: true,
    fileSizeLimit: 10485760, // 10MB
  });
  if (imgError) {
    console.error('Failed to create spot-images bucket:', imgError);
  } else {
    console.log('Successfully created spot-images bucket:', imgData);
  }

  console.log('Attempting to create "spot-videos" bucket...');
  const { data: vidData, error: vidError } = await supabase.storage.createBucket('spot-videos', {
    public: true,
    fileSizeLimit: 20971520, // 20MB
  });
  if (vidError) {
    console.error('Failed to create spot-videos bucket:', vidError);
  } else {
    console.log('Successfully created spot-videos bucket:', vidData);
  }
}

main();
