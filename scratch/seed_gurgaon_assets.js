import { createClient } from '@supabase/supabase-js';
import https from 'https';
import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const spots = [
  {
    title: "Roots – Café in the Park",
    category: "cafe",
    description: "A popular solar-powered cafe nestled inside Rajiv Gandhi Renewable Energy Park. Earthy vibe, rustic wood styling, comforting Indian snacks, and outdoor setting.",
    latitude: 28.4651,
    longitude: 77.0622,
    image_url_src: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80",
    video_url_src: "https://www.w3schools.com/html/movie.mp4",
    status: "approved",
    user_id: null,
    tags: ["outdoor", "rustic", "breakfast", "nature", "eco-friendly"],
    address: "Rajiv Gandhi Renewable Energy Park, Leisure Valley Road, Sector 29, Gurugram, Haryana 122001",
    filename_prefix: "roots_cafe"
  },
  {
    title: "Di Ghent Café",
    category: "cafe",
    description: "A high-end Belgian bistro offering authentic sourdough paninis, golden waffles, and strong espresso in a warm, dark-wood library ambiance.",
    latitude: 28.4682,
    longitude: 77.0864,
    image_url_src: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
    video_url_src: "https://www.w3schools.com/html/mov_bbb.mp4",
    status: "approved",
    user_id: null,
    tags: ["belgian", "waffles", "cozy", "aesthetic", "brunch"],
    address: "208, Level 2, Cross Point Mall, DLF Phase 4, Gurugram, Haryana 122002",
    filename_prefix: "di_ghent_cafe"
  },
  {
    title: "Guftagu Café",
    category: "cafe",
    description: "India's first poetry-centric cafe, lit by magical fairy lights under a dense tree canopy. Known for open mics, live acoustic sessions, and romantic dates.",
    latitude: 28.4774,
    longitude: 77.0832,
    image_url_src: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
    video_url_src: "https://www.w3schools.com/html/movie.mp4",
    status: "approved",
    user_id: null,
    tags: ["romantic", "poetry", "livemusic", "outdoors", "canopy"],
    address: "Opposite DLF City Court, DLF City Phase 2, Gurugram, Haryana 122002",
    filename_prefix: "guftagu_cafe"
  },
  {
    title: "Under The Neem",
    category: "cafe",
    description: "A beautiful farm-to-table restaurant in Sector 80. Dine on colorful chairs under a historic Neem tree, featuring fresh organic ingredients from their backyard.",
    latitude: 28.3881,
    longitude: 76.9042,
    image_url_src: "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=800&q=80",
    video_url_src: "https://www.w3schools.com/html/mov_bbb.mp4",
    status: "approved",
    user_id: null,
    tags: ["farm-to-table", "nature", "peaceful", "luxury", "organic"],
    address: "Karma Lakelands, NH-8, Sector 80, Gurugram, Haryana 122001",
    filename_prefix: "under_the_neem"
  },
  {
    title: "Hamoni: Cafe by the Greens",
    category: "cafe",
    description: "Tucked inside Hamoni Golf Camp, this cafe overlooks lush golf range fairways. Enjoy peaceful breakfasts and evening tea surrounded by greenery.",
    latitude: 28.5029,
    longitude: 77.0425,
    image_url_src: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&w=800&q=80",
    video_url_src: "https://www.w3schools.com/html/movie.mp4",
    status: "approved",
    user_id: null,
    tags: ["golfcourse", "greenery", "quiet", "breakfast", "chic"],
    address: "Hamoni Golf Camp, Sector 23A, Gurugram, Haryana 122017",
    filename_prefix: "hamoni_cafe"
  },
  {
    title: "Greenr Café (32nd Avenue)",
    category: "cafe",
    description: "A gorgeous plant-based cafe offering vegetarian, vegan, and gluten-free meals. Features tall glass windows, natural plants, and a vibrant community workspace.",
    latitude: 28.4602,
    longitude: 77.0453,
    image_url_src: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["vegan", "plantbased", "healthy", "coworking", "minimalist"],
    address: "32nd Avenue, Sector 15 Part 2, Gurugram, Haryana 122001",
    filename_prefix: "greenr_cafe"
  },
  {
    title: "Aravalli Biodiversity Park",
    category: "trail",
    description: "A reclaimed mining site transformed into a pristine 380-acre forest. Perfect for early morning trail running, bird watching, and cycling through native Aravalli flora.",
    latitude: 28.4832,
    longitude: 77.1119,
    image_url_src: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["hiking", "cycling", "nature", "birds", "morning"],
    address: "Near Guru Dronacharya Metro Station, MG Road, DLF Phase 3, Gurugram, Haryana 122002",
    filename_prefix: "aravalli_park"
  },
  {
    title: "Damdama Lake",
    category: "lake",
    description: "A scenic natural lake nestled in the rocky folds of the Aravalli hills. An ideal spot for boating, sunset views, and camping on the weekends.",
    latitude: 28.2936,
    longitude: 77.0428,
    image_url_src: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["lake", "boating", "sunset", "hills", "picnic"],
    address: "Damdama Lake, Off Sohna Road, Gurugram, Haryana 122102",
    filename_prefix: "damdama_lake"
  },
  {
    title: "Sultanpur Bird Sanctuary",
    category: "trail",
    description: "A famous bird sanctuary home to over 250 species of resident and migratory birds. Offers a 4km circular walking trail around a peaceful lake with watchtowers.",
    latitude: 28.4615,
    longitude: 76.8920,
    image_url_src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["birds", "wildlife", "trail", "lake", "winter"],
    address: "Gurgaon-Farukh Nagar Road, Sultanpur, Gurugram, Haryana 122505",
    filename_prefix: "sultanpur_sanctuary"
  },
  {
    title: "Camp Mustang",
    category: "campsite",
    description: "An outdoor adventure campsite offering rustic luxury tents, climbing walls, obstacle courses, night treks, and bonfire evenings in the Aravali foothills.",
    latitude: 28.3245,
    longitude: 77.0984,
    image_url_src: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["camping", "adventure", "bonfire", "outdoor", "stars"],
    address: "Garlan Road, Near Badshahpur, Gurugram, Haryana 122101",
    filename_prefix: "camp_mustang"
  },
  {
    title: "Leisure Valley Park",
    category: "viewpoint",
    description: "A massive green oasis featuring rose gardens, musical water fountains, and sprawling lawns. Great spot to catch the sunset or read a book under the shade.",
    latitude: 28.4680,
    longitude: 77.0665,
    image_url_src: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["park", "sunset", "fountains", "relax", "family"],
    address: "Sector 29, Gurugram, Haryana 122001",
    filename_prefix: "leisure_valley"
  },
  {
    title: "Cyber Hub (DLF Cyber City)",
    category: "event",
    description: "Gurgaon's premier food, retail, and social zone. Features outdoor musical concerts, food festivals, microbreweries, and high-energy social lounges.",
    latitude: 28.4950,
    longitude: 77.0890,
    image_url_src: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["cyberhub", "nightlife", "lounge", "gourmet", "citylife"],
    address: "DLF Cyber City, DLF Phase 3, Gurugram, Haryana 122002",
    filename_prefix: "cyber_hub"
  },
  {
    title: "32nd Avenue (Milestone)",
    category: "street-art",
    description: "A premium high-street district famous for its cobblestone pathways, vintage streetlights, beautiful graffiti, fairy-lit arches, and boutique dining.",
    latitude: 28.4600,
    longitude: 77.0450,
    image_url_src: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["aesthetic", "fairylights", "cobblestone", "streetart", "cafes"],
    address: "NH-48, Sector 15 Part 2, Gurugram, Haryana 122001",
    filename_prefix: "32nd_avenue"
  },
  {
    title: "Leopard Trail (Aravalli Hills)",
    category: "trail",
    description: "A popular, winding road through the rugged Aravalli hills, lined with local tea stalls, hills, and greenery. A favorite weekend route for bikers and hikers.",
    latitude: 28.3512,
    longitude: 76.9458,
    image_url_src: "https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["bikers", "hiking", "aravalli", "hills", "chai"],
    address: "Leopard Trail, Aravali Hills, Gurugram, Haryana 122102",
    filename_prefix: "leopard_trail"
  },
  {
    title: "Mangar Bani Forest",
    category: "forest",
    description: "A sacred forest grove located in the Aravalli hills between Gurgaon and Faridabad. Retains dense, untouched native trees and forms an ecological sanctuary.",
    latitude: 28.4230,
    longitude: 77.1950,
    image_url_src: "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=800&q=80",
    video_url_src: null,
    status: "approved",
    user_id: null,
    tags: ["sacredforest", "dense", "aravalli", "peaceful", "trekking"],
    address: "Faridabad-Gurugram Road, Mangar Valley, Gurugram, Haryana 121004",
    filename_prefix: "mangar_forest"
  }
];

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status Code: ${res.statusCode})`));
        return;
      }
      const data = [];
      res.on('data', (chunk) => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', reject);
  });
}

async function authenticate() {
  console.log('Authenticating seeder client via Supabase Auth...');
  const email = 'gurgaon_seeder@spota.app';
  const password = 'SeedPassword123!';

  // Attempt login first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (!signInError) {
    console.log('🔑 Authenticated successfully! User ID:', signInData.user?.id);
    return signInData.user?.id;
  }

  // If login fails, attempt signup
  console.log('Auth credentials not found. Registering new seeder user...');
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: 'gurgaon_seeder'
      }
    }
  });

  if (signUpError) {
    throw new Error(`Authentication/Registration failed: ${signUpError.message}`);
  }

  console.log('🔑 Registered and authenticated successfully! User ID:', signUpData.user?.id);
  return signUpData.user?.id;
}

async function main() {
  try {
    const creatorUserId = await authenticate();

    console.log('Detecting Supabase Storage bucket configurations...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    const hasImagesBucket = buckets && buckets.some(b => b.id === 'spot-images');
    const hasVideosBucket = buckets && buckets.some(b => b.id === 'spot-videos');
    
    if (hasImagesBucket && hasVideosBucket) {
      console.log('✅ Supabase storage buckets detected. Assets will be uploaded to Supabase Storage.');
    } else {
      console.log('⚠️ Supabase storage buckets NOT found. Falling back to local "public/seeded-assets/" directory.');
      // Ensure local directory exists
      const localDir = path.join(process.cwd(), 'public', 'seeded-assets');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
    }

    for (const spot of spots) {
      // Check if spot already exists in the database
      const { data: existing, error: fetchError } = await supabase
        .from('spots')
        .select('id')
        .eq('title', spot.title)
        .limit(1);

      if (fetchError) {
        console.error(`Error checking existence of "${spot.title}":`, fetchError);
        continue;
      }

      if (existing && existing.length > 0) {
        console.log(`Spot "${spot.title}" already exists. Skipping.`);
        continue;
      }

      console.log(`Processing "${spot.title}"...`);
      let finalImageUrl = spot.image_url_src;
      let finalVideoUrl = spot.video_url_src ? spot.video_url_src : null;

      try {
        // 1. Download image
        console.log(`  Downloading image...`);
        const imgBuffer = await downloadToBuffer(spot.image_url_src);
        const imgExt = 'jpg';
        const imgFilename = `${spot.filename_prefix}_${Date.now()}.${imgExt}`;

        if (hasImagesBucket) {
          // Upload to Supabase
          const { data, error } = await supabase.storage
            .from('spot-images')
            .upload(`spot-images/${imgFilename}`, imgBuffer, {
              contentType: 'image/jpeg'
            });
          if (error) throw error;
          
          const { data: publicUrlData } = supabase.storage
            .from('spot-images')
            .getPublicUrl(`spot-images/${imgFilename}`);
          finalImageUrl = publicUrlData.publicUrl;
          console.log(`  Uploaded image to Supabase: ${finalImageUrl}`);
        } else {
          // Save locally
          const localPath = path.join(process.cwd(), 'public', 'seeded-assets', imgFilename);
          fs.writeFileSync(localPath, imgBuffer);
          finalImageUrl = `/seeded-assets/${imgFilename}`;
          console.log(`  Saved image locally: ${finalImageUrl}`);
        }

        // 2. Download video if exists
        if (spot.video_url_src) {
          console.log(`  Downloading video vibe...`);
          const vidBuffer = await downloadToBuffer(spot.video_url_src);
          const vidExt = 'mp4';
          const vidFilename = `${spot.filename_prefix}_${Date.now()}.${vidExt}`;

          if (hasVideosBucket) {
            // Upload to Supabase
            const { data, error } = await supabase.storage
              .from('spot-videos')
              .upload(`spot-videos/${vidFilename}`, vidBuffer, {
                contentType: 'video/mp4'
              });
            if (error) throw error;

            const { data: publicUrlData } = supabase.storage
              .from('spot-videos')
              .getPublicUrl(`spot-videos/${vidFilename}`);
            finalVideoUrl = publicUrlData.publicUrl;
            console.log(`  Uploaded video to Supabase: ${finalVideoUrl}`);
          } else {
            // Save locally
            const localPath = path.join(process.cwd(), 'public', 'seeded-assets', vidFilename);
            fs.writeFileSync(localPath, vidBuffer);
            finalVideoUrl = `/seeded-assets/${vidFilename}`;
            console.log(`  Saved video locally: ${finalVideoUrl}`);
          }
        }

        // 3. Save spot to DB
        const dbSpot = {
          title: spot.title,
          category: spot.category,
          description: spot.description,
          latitude: spot.latitude,
          longitude: spot.longitude,
          image_url: finalImageUrl,
          video_url: finalVideoUrl,
          status: spot.status,
          user_id: creatorUserId,
          tags: spot.tags,
          address: spot.address,
          share_count: 0,
          report_count: 0,
          reactions: {}
        };

        const { error: insertError } = await supabase
          .from('spots')
          .insert([dbSpot]);

        if (insertError) {
          console.error(`  ❌ Failed to insert "${spot.title}":`, insertError);
        } else {
          console.log(`  ✅ Successfully inserted: "${spot.title}"`);
        }
      } catch (err) {
        console.error(`  ❌ Error processing spot "${spot.title}":`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Critical auth or seeder error:', err.message);
  }

  console.log('\nAll Gurgaon spots process completed!');
}

main();
