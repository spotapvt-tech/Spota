import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function authenticate() {
  console.log('Authenticating seeder client via Supabase Auth...');
  const email = 'delhi_seeder@spota.app';
  const password = 'SeedPassword123!';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  console.log('🔑 Authenticated successfully! User ID:', data.user?.id);
  return data.user?.id;
}

async function main() {
  try {
    await authenticate();

    // 1. Verify storage bucket exists
    console.log('Checking storage buckets...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) throw bucketError;

    const hasImagesBucket = buckets && buckets.some(b => b.id === 'spot-images');
    if (!hasImagesBucket) {
      console.error('❌ Error: The "spot-images" bucket was not found in your Supabase project.');
      console.log('Please log in to your Supabase Dashboard, go to "Storage", and create a new public bucket named "spot-images".');
      return;
    }
    console.log('✅ "spot-images" bucket detected. Starting migration...');

    // 2. Scan public/seeded-assets folder
    const assetsDir = path.join(process.cwd(), 'public', 'seeded-assets');
    if (!fs.existsSync(assetsDir)) {
      console.log('No local assets folder found. Nothing to migrate.');
      return;
    }

    const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
    console.log(`Found ${files.length} local images to migrate.`);

    let successCount = 0;
    let failCount = 0;

    for (const filename of files) {
      const localPath = path.join(assetsDir, filename);
      const fileBuffer = fs.readFileSync(localPath);
      const dbUrlPath = `/seeded-assets/${filename}`;

      console.log(`Uploading ${filename}...`);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('spot-images')
        .upload(`spot-images/${filename}`, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.error(`  ❌ Failed to upload ${filename}:`, uploadError.message);
        failCount++;
        continue;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('spot-images')
        .getPublicUrl(`spot-images/${filename}`);
        
      const publicUrl = publicUrlData.publicUrl;
      console.log(`  Uploaded to Supabase: ${publicUrl}`);

      // Update database rows referencing this local image
      const { data: updatedSpots, error: dbError } = await supabase
        .from('spots')
        .update({ image_url: publicUrl })
        .eq('image_url', dbUrlPath)
        .select('id, title');

      if (dbError) {
        console.error(`  ❌ Database update error for ${filename}:`, dbError.message);
        failCount++;
      } else {
        console.log(`  ✅ Database updated! Match count: ${updatedSpots.length}`);
        successCount++;
      }
    }

    console.log('\n--- Migration Complete ---');
    console.log(`Successfully migrated: ${successCount} assets`);
    console.log(`Failed migrations:     ${failCount} assets`);
    console.log('--------------------------');
    console.log('If all assets were successfully migrated, you can delete the local files in "public/seeded-assets" and add them to ".gitignore".');

  } catch (err) {
    console.error('❌ Critical error:', err.message);
  }
}

main();
