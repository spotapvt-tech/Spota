import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Robust RFC-4180 compliant CSV parser
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i+1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentVal += '"';
          i++; // skip next quote
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }
  
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }
  
  if (rows.length === 0) return [];
  
  // Parse headers
  const headers = rows[0].map(h => h.trim());
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue; // skip incomplete rows
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    data.push(obj);
  }
  
  return data;
}

// Maps CSV category to one of the valid application categories
function mapCategory(csvCat) {
  const cat = (csvCat || '').trim().toLowerCase();
  
  // Café / Coffee
  if (cat.includes('cafe') || cat.includes('coffee')) {
    return 'cafe';
  }
  
  // Food & Drink / Restaurant / Bar / Pub
  if (['restaurant', 'bar', 'brewpub', 'bistro', 'kebab', 'food', 'dining', 'barbecue', 'buffet', 'bakery', 'pub', 'deli', 'eatery', 'lounge', 'sweet shop', 'ice cream'].some(x => cat.includes(x))) {
    return 'cafe';
  }
  
  // Trail / Hiking
  if (['trail', 'hiking', 'trek', 'walk'].some(x => cat.includes(x))) {
    return 'trail';
  }
  
  // Campsite
  if (cat.includes('campsite') || cat.includes('camping')) {
    return 'campsite';
  }
  
  // Waterfall
  if (cat.includes('waterfall') || cat.includes('cascade')) {
    return 'waterfall';
  }
  
  // Mountain
  if (['mountain', 'peak', 'hill', 'ridge'].some(x => cat.includes(x))) {
    return 'mountain';
  }
  
  // Beach
  if (cat.includes('beach') || cat.includes('coast')) {
    return 'beach';
  }
  
  // Lake
  if (['lake', 'pond', 'river', 'reservoir', 'water'].some(x => cat.includes(x))) {
    return 'lake';
  }
  
  // Forest / Park / Garden / Nature
  if (['forest', 'park', 'garden', 'nature', 'zoo', 'sanctuary', 'reserve'].some(x => cat.includes(x))) {
    return 'forest';
  }
  
  // Cave
  if (cat.includes('cave')) {
    return 'cave';
  }
  
  // Street Art
  if (['street art', 'mural', 'graffiti', 'art', 'gallery', 'museum'].some(x => cat.includes(x))) {
    return 'street-art';
  }
  
  // Event
  if (['event', 'exhibition', 'theater', 'cinema', 'auditorium', 'stadium'].some(x => cat.includes(x))) {
    return 'event';
  }
  
  // Viewpoint / Scenic / Landmark / Attractions
  if (['viewpoint', 'scenic', 'observation', 'attraction', 'historical', 'monument', 'tomb', 'fortress', 'palace', 'temple', 'church', 'mosque', 'gurudwara', 'worship', 'landmark', 'shrine', 'archaeological'].some(x => cat.includes(x))) {
    return 'viewpoint';
  }
  
  return 'viewpoint'; // default fallback
}

// Redirect-aware HTTP/HTTPS downloader with user-agent and timeout
function downloadToBuffer(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    };

    const req = client.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        resolve(downloadToBuffer(redirectUrl, maxRedirects - 1));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed with status code: ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Request timeout (8s)'));
    });
  });
}

// Helper to get safe file names for local storage
function getSafeFilename(title, ext) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);
  return `delhi_${slug}_${Date.now()}.${ext}`;
}

// Authenticates using Delhi seeder
async function authenticate() {
  console.log('Authenticating seeder client via Supabase Auth...');
  const email = 'delhi_seeder@spota.app';
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
  console.log('Seeder credentials not found. Registering new Delhi seeder user...');
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: 'delhi_seeder'
      }
    }
  });

  if (signUpError) {
    throw new Error(`Authentication/Registration failed: ${signUpError.message}`);
  }

  console.log('🔑 Registered and authenticated successfully! User ID:', signUpData.user?.id);
  return signUpData.user?.id;
}

// Main logic to parse and seed
async function runSeeding() {
  const scraperDir = path.resolve('../web scraper');
  const filesToProcess = [
    { name: 'spota_delhi_places.csv', path: path.join(scraperDir, 'spota_delhi_places.csv') },
    { name: 'spota_delhi_places test.csv', path: path.join(scraperDir, 'spota_delhi_places test.csv') }
  ];
  
  console.log('--- Starting Delhi Spots Seeding ---');
  
  let creatorUserId = null;
  try {
    creatorUserId = await authenticate();
  } catch (err) {
    console.error('❌ Critical auth error:', err.message);
    process.exit(1);
  }

  // Ensure local directory for seeded assets exists
  const localDir = path.join(process.cwd(), 'public', 'seeded-assets');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  
  for (const fileInfo of filesToProcess) {
    if (!fs.existsSync(fileInfo.path)) {
      console.log(`Warning: File not found at ${fileInfo.path}. Skipping.`);
      continue;
    }
    
    console.log(`\nProcessing file: ${fileInfo.name}...`);
    const content = fs.readFileSync(fileInfo.path, 'utf8');
    const rows = parseCSV(content);
    console.log(`Found ${rows.length} rows in ${fileInfo.name}.`);
    
    for (const row of rows) {
      if (!row.title || !row.latitude || !row.longitude) {
        console.log(`Skipping row with missing key fields (title/lat/lng).`);
        continue;
      }
      
      const title = row.title.trim();
      const lat = parseFloat(row.latitude);
      const lng = parseFloat(row.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        console.log(`Skipping "${title}" due to invalid coordinates: lat=${row.latitude}, lng=${row.longitude}`);
        continue;
      }
      
      totalProcessed++;
      
      // Check if spot already exists in DB
      const { data: existing, error: checkError } = await supabase
        .from('spots')
        .select('id')
        .eq('title', title)
        .limit(1);
        
      if (checkError) {
        console.error(`Error checking existing record for "${title}":`, checkError.message);
        totalFailed++;
        continue;
      }
      
      if (existing && existing.length > 0) {
        console.log(`Skipped (already exists): "${title}"`);
        totalSkipped++;
        continue;
      }
      
      // Parse address JSON to readable string
      let addressStr = '';
      let borough = '';
      if (row.complete_address) {
        try {
          const addrObj = JSON.parse(row.complete_address);
          borough = addrObj.borough || addrObj.street || '';
          
          const parts = [];
          if (addrObj.street) parts.push(addrObj.street);
          if (addrObj.borough) parts.push(addrObj.borough);
          if (addrObj.city) parts.push(addrObj.city);
          if (addrObj.postal_code) parts.push(addrObj.postal_code);
          if (addrObj.state) parts.push(addrObj.state);
          addressStr = parts.join(', ');
        } catch (e) {
          addressStr = row.complete_address;
        }
      }
      if (!addressStr) {
        addressStr = row.complete_address || '';
      }
      
      // Map category
      const appCategory = mapCategory(row.category);
      
      // Parse and build description
      let description = `A popular ${row.category || 'spot'}`;
      if (borough) {
        description += ` located in ${borough}`;
      }
      if (row.review_rating) {
        description += ` with a Google rating of ${parseFloat(row.review_rating).toFixed(1)} stars`;
        if (row.review_count) {
          description += ` (${row.review_count} reviews)`;
        }
      }
      description += '.';
      
      if (row.website) {
        description += ` Website: ${row.website}`;
      }
      
      // Determine image source URL
      let imageSrcUrl = row.thumbnail || null;
      if (!imageSrcUrl && row.images) {
        try {
          const imgList = JSON.parse(row.images);
          if (Array.isArray(imgList) && imgList.length > 0) {
            for (const item of imgList) {
              if (item.image) {
                imageSrcUrl = item.image;
                break;
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }
      
      // Download image and save locally for visual consistency
      let finalImageUrl = imageSrcUrl;
      if (imageSrcUrl) {
        try {
          const imgBuffer = await downloadToBuffer(imageSrcUrl);
          const safeName = getSafeFilename(title, 'jpg');
          const localPath = path.join(localDir, safeName);
          fs.writeFileSync(localPath, imgBuffer);
          finalImageUrl = `/seeded-assets/${safeName}`;
          console.log(`  Downloaded image locally for "${title}" -> ${finalImageUrl}`);
        } catch (err) {
          console.log(`  ⚠️ Failed to download image for "${title}", falling back to original URL. Reason: ${err.message}`);
          // keep original URL
          finalImageUrl = imageSrcUrl;
        }
      }
      
      // Extract google_place_id from maps link
      let googlePlaceId = null;
      if (row.link) {
        const placeIdMatch = row.link.match(/!19s(ChIJ[a-zA-Z0-9_-]+)/);
        if (placeIdMatch) {
          googlePlaceId = placeIdMatch[1];
        }
      }
      
      // Create tags
      const tags = ['delhi'];
      if (row.category) tags.push(row.category);
      if (row.source_category) tags.push(row.source_category);
      if (borough) tags.push(borough);
      
      const cleanTags = [...new Set(
        tags
          .map(t => t.toLowerCase().trim().replace(/[^a-z0-9_-]/g, ''))
          .filter(t => t.length > 0)
      )];
      
      const spotToInsert = {
        title: title,
        description: description,
        category: appCategory,
        latitude: lat,
        longitude: lng,
        image_url: finalImageUrl,
        video_url: null,
        status: 'approved',
        user_id: creatorUserId,
        reactions: {},
        share_count: 0,
        report_count: 0,
        tags: cleanTags,
        address: addressStr,
        verification_score: 100,
        google_place_id: googlePlaceId,
        sandbox_votes_count: 0
      };
      
      // Insert into database
      const { error: insertError } = await supabase
        .from('spots')
        .insert([spotToInsert]);
        
      if (insertError) {
        console.error(`  ❌ Failed to insert "${title}":`, insertError.message);
        totalFailed++;
      } else {
        console.log(`  ✅ Inserted successfully: "${title}" (${appCategory})`);
        totalInserted++;
      }
    }
  }
  
  console.log('\n--- Seeding Summary ---');
  console.log(`Total Rows Processed: ${totalProcessed}`);
  console.log(`Successfully Inserted: ${totalInserted}`);
  console.log(`Skipped (Duplicates): ${totalSkipped}`);
  console.log(`Failed insertions:   ${totalFailed}`);
  console.log('------------------------');
}

runSeeding();
