import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jtyfkglqkklgmewyjpde.supabase.co';
const supabaseAnonKey = 'sb_publishable__s4STCV4LT07PBtz4gYubA_E0ZQAMt6';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Testing SignUp...');
  const email = `seeder_${Date.now()}@spota.app`;
  const password = 'SeedPassword123!';
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: 'seeder_bot'
      }
    }
  });

  if (signUpError) {
    console.error('SignUp failed:', signUpError.message);
  } else {
    console.log('SignUp successful! User ID:', signUpData.user?.id);
    
    console.log('Testing SignIn...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (signInError) {
      console.error('SignIn failed:', signInError.message);
    } else {
      console.log('SignIn successful! Access Token exists:', !!signInData.session?.access_token);
    }
  }
}

main();
