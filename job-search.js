export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { what = "", where = "India" } = req.query;

  if (!what.trim()) {
    return res.status(400).json({ error: "Missing 'what' (job title/keywords) parameter" });
  }

  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return res.status(500).json({ error: "Job search isn't configured yet (missing Adzuna credentials)" });
  }

  try {
    const url = new URL("https://api.adzuna.com/v1/api/jobs/in/search/1");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("app_key", appKey);
    url.searchParams.set("what", what);
    url.searchParams.set("where", where);
    url.searchParams.set("results_per_page", "8");
    url.searchParams.set("content-type", "application/json");

    const adzunaRes = await fetch(url.toString());
    if (!adzunaRes.ok) {
      throw new Error(`Adzuna returned ${adzunaRes.status}`);
    }
    const data = await adzunaRes.json();

    const jobs = (data.results || []).map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company?.display_name || "Unknown company",
      location: job.location?.display_name || where,
      salaryMin: job.salary_min || null,
      salaryMax: job.salary_max || null,
      url: job.redirect_url,
      snippet: (job.description || "").slice(0, 160),
    }));

    res.status(200).json({ jobs, count: data.count || jobs.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch job listings right now" });
  }
}
