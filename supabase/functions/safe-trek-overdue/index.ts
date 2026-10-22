// Marks missed Safe Treks overdue and pushes a reminder to the explorer's own device(s).
// The emergency contact is NOT notified: they are a name/phone/email, not an app user.
// Secrets: CRON_SECRET, FCM_SERVICE_ACCOUNT (Firebase service-account JSON).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);

async function fcmAccessToken(): Promise<string> {
  const key = await importPKCS8(sa.private_key, 'RS256');
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('55m')
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Active treks past their deadline become overdue
  const { data: active } = await db.from('safe_treks').select('id,last_checked_in,check_in_interval_hours').eq('status', 'active');
  const lateIds = (active ?? [])
    .filter((t) => new Date(t.last_checked_in).getTime() + t.check_in_interval_hours * 3600_000 < Date.now())
    .map((t) => t.id);
  if (lateIds.length) await db.from('safe_treks').update({ status: 'overdue' }).in('id', lateIds);

  // Push once per overdue trek
  const { data: treks } = await db.from('safe_treks').select('id,user_id,destination_name').eq('status', 'overdue').is('overdue_push_sent_at', null);
  if (!treks?.length) return Response.json({ sent: 0 });

  const accessToken = await fcmAccessToken();
  let sent = 0;
  for (const trek of treks) {
    const { data: tokens } = await db.from('device_tokens').select('token').eq('user_id', trek.user_id);
    for (const { token } of tokens ?? []) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: 'Safe Trek check-in overdue',
              body: `Open Spota and check in for ${trek.destination_name}. Your emergency contact is not alerted automatically.`,
            },
            android: { priority: 'HIGH' },
          },
        }),
      });
      if (res.ok) sent++;
      else if (res.status === 404) await db.from('device_tokens').delete().eq('token', token); // uninstalled
    }
    await db.from('safe_treks').update({ overdue_push_sent_at: new Date().toISOString() }).eq('id', trek.id);
  }
  return Response.json({ sent });
});
