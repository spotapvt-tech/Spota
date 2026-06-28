import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error } = await supabase.from('spots').select('id, title, image_url, video_url');
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Total spots: ${data.length}`);
  const localImages = data.filter(s => s.image_url && s.image_url.startsWith('/'));
  const supabaseImages = data.filter(s => s.image_url && s.image_url.includes('supabase.co'));
  const unsplashImages = data.filter(s => s.image_url && s.image_url.includes('unsplash.com'));
  const otherImages = data.filter(s => s.image_url && !s.image_url.startsWith('/') && !s.image_url.includes('supabase.co') && !s.image_url.includes('unsplash.com'));
  
  console.log(`\nImage URL Stats:`);
  console.log(`- Local paths (starts with /): ${localImages.length}`);
  console.log(`- Supabase Storage URLs: ${supabaseImages.length}`);
  console.log(`- Unsplash URLs: ${unsplashImages.length}`);
  console.log(`- Other URLs: ${otherImages.length}`);
  
  const localVideos = data.filter(s => s.video_url && s.video_url.startsWith('/'));
  const supabaseVideos = data.filter(s => s.video_url && s.video_url.includes('supabase.co'));
  const w3schoolsVideos = data.filter(s => s.video_url && s.video_url.includes('w3schools.com'));
  const otherVideos = data.filter(s => s.video_url && !s.video_url.startsWith('/') && !s.video_url.includes('supabase.co') && !s.video_url.includes('w3schools.com'));
  
  console.log(`\nVideo URL Stats:`);
  console.log(`- Local paths: ${localVideos.length}`);
  console.log(`- Supabase Storage URLs: ${supabaseVideos.length}`);
  console.log(`- w3schools URLs: ${w3schoolsVideos.length}`);
  console.log(`- Other URLs: ${otherVideos.length}`);
  
  if (localImages.length > 0) {
    console.log('\nSample Local Image:', localImages[0]);
  }
  if (supabaseImages.length > 0) {
    console.log('\nSample Supabase Image:', supabaseImages[0]);
  }
  if (localVideos.length > 0) {
    console.log('\nSample Local Video:', localVideos[0]);
  }
  if (w3schoolsVideos.length > 0) {
    console.log('\nSample w3schools Video:', w3schoolsVideos[0]);
  }
}

main();
