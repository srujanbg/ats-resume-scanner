import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!adminEmail || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Admin endpoint isn't configured" });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (userData.user.email !== adminEmail) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_pro, scan_count, created_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    return res.status(500).json({ error: "Could not fetch users" });
  }

  res.status(200).json({ users: profiles });
}
