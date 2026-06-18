import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Connecting to Supabase...');
  const { data, error } = await supabase.from('spots').select('*');
  if (error) {
    console.error('Error fetching spots:', error);
  } else {
    console.log('Fetched spots count:', data.length);
    if (data.length > 0) {
      console.log('Sample spot keys:', Object.keys(data[0]));
      console.log('Sample spot data:', JSON.stringify(data[0], null, 2));
    } else {
      console.log('No spots found in the database.');
    }
  }
}

main();
