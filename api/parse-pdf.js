import pdf from "pdf-parse";

export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const buffer = await readRawBody(req);
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "No file received" });
    }
    const data = await pdf(buffer);
    res.status(200).json({ text: data.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not read that PDF. It may be scanned/image-based rather than text-based." });
  }
}
