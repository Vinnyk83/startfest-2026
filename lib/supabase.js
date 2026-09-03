const { createClient } = require('@supabase/supabase-js');

// Server-side client using the secret key — only ever used to verify a
// magic-link access token handed to us by the browser (auth.getUser), never
// exposed to clients. The publishable key is what the browser uses directly.
let adminClient = null;
function getAdminClient() {
  if (!adminClient) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY not set — magic-link login is unavailable.');
    }
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

async function verifySupabaseAccessToken(accessToken) {
  const sb = getAdminClient();
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user; // { id, email, ... }
}

module.exports = { getAdminClient, verifySupabaseAccessToken };
