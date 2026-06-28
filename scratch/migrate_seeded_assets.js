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
  if (error) {
    console.log('Delhi seeder login failed, trying Gurgaon seeder...');
    const { data: data2, error: error2 } = await supabase.auth.signInWithPassword({
      email: 'gurgaon_seeder@spota.app',
      password: 'SeedPassword123!'
    });
    if (error2) throw error2;
    console.log('🔑 Authenticated successfully as gurgaon_seeder! User ID:', data2.user?.id);
    return data2.user?.id;
  }
  console.log('🔑 Authenticated successfully as delhi_seeder! User ID:', data.user?.id);
  return data.user?.id;
}

async function createBucketsIfNotExist() {
  console.log('Checking and creating storage buckets...');
  
  // Try to create spot-images
  try {
    const { data, error } = await supabase.storage.createBucket('spot-images', {
      public: true,
      fileSizeLimit: 10485760 // 10MB
    });
    if (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log('✅ spot-images bucket already exists.');
      } else {
        console.warn('⚠️ Warning creating spot-images bucket:', error.message);
      }
    } else {
      console.log('🎉 Successfully created spot-images bucket!');
    }
  } catch (err) {
    console.warn('⚠️ Exception creating spot-images bucket:', err.message);
  }

  // Try to create spot-videos
  try {
    const { data, error } = await supabase.storage.createBucket('spot-videos', {
      public: true,
      fileSizeLimit: 20971520 // 20MB
    });
    if (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log('✅ spot-videos bucket already exists.');
      } else {
        console.warn('⚠️ Warning creating spot-videos bucket:', error.message);
      }
    } else {
      console.log('🎉 Successfully created spot-videos bucket!');
    }
  } catch (err) {
    console.warn('⚠️ Exception creating spot-videos bucket:', err.message);
  }
}

async function main() {
  try {
    await authenticate();
    await createBucketsIfNotExist();

    const assetsDir = path.join(process.cwd(), 'public', 'seeded-assets');
    if (!fs.existsSync(assetsDir)) {
      console.log('No local assets directory found at:', assetsDir);
      return;
    }

    const files = fs.readdirSync(assetsDir);
    console.log(`Found ${files.length} total files in public/seeded-assets.`);

    let imageSuccess = 0;
    let imageFail = 0;
    let videoSuccess = 0;
    let videoFail = 0;

    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png'].includes(ext);
      const isVideo = ['.mp4'].includes(ext);

      if (!isImage && !isVideo) {
        continue;
      }

      const localPath = path.join(assetsDir, filename);
      const fileBuffer = fs.readFileSync(localPath);
      const dbUrlPath = `/seeded-assets/${filename}`;

      const bucketName = isImage ? 'spot-images' : 'spot-videos';
      const folderPrefix = isImage ? 'spot-images' : 'spot-videos';
      const storagePath = `${folderPrefix}/${filename}`;

      console.log(`Uploading ${filename} to bucket ${bucketName}...`);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, fileBuffer, {
          contentType: isImage ? 'image/jpeg' : 'video/mp4',
          upsert: true
        });

      if (uploadError) {
        console.error(`  ❌ Failed to upload ${filename}:`, uploadError.message);
        if (isImage) imageFail++; else videoFail++;
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;
      console.log(`  Uploaded! Public URL: ${publicUrl}`);

      // Update spots table
      const updateField = isImage ? { image_url: publicUrl } : { video_url: publicUrl };
      const matchField = isImage ? 'image_url' : 'video_url';

      const { data: updatedSpots, error: dbError } = await supabase
        .from('spots')
        .update(updateField)
        .eq(matchField, dbUrlPath)
        .select('id, title');

      if (dbError) {
        console.error(`  ❌ Database update error for ${filename}:`, dbError.message);
        if (isImage) imageFail++; else videoFail++;
      } else {
        console.log(`  ✅ Database updated! Match count: ${updatedSpots.length}`);
        if (isImage) imageSuccess++; else videoSuccess++;
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Images - Migrated: ${imageSuccess}, Failed: ${imageFail}`);
    console.log(`Videos - Migrated: ${videoSuccess}, Failed: ${videoFail}`);
    console.log('-------------------------');

  } catch (err) {
    console.error('❌ Critical migration error:', err);
  }
}

main();
