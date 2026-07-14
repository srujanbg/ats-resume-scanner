import React, { useState, useMemo, useRef, useEffect } from "react";
import { Scan, Check, X, RotateCcw, ClipboardPaste, FileText, Briefcase, Upload, Loader2, MapPin, ExternalLink } from "lucide-react";
import mammoth from "mammoth";

// ---------- Keyword engine ----------
const STOPWORDS = new Set(
  ("a about above after again against all am an and any are aren't as at be because been before being below " +
  "between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from " +
  "further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how " +
  "how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off " +
  "on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some " +
  "such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've " +
  "this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when " +
  "when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've " +
  "your yours yourself yourselves will able etc using use used able strong good great excellent looking seeking apply " +
  "role work job company team years year experience across various including within also within will must should day " +
  "please note above").split(" ")
);

const clean = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function extractKeywords(text, topN = 20) {
  const words = clean(text).split(" ").filter(Boolean);
  const uniFreq = new Map();
  const biFreq = new Map();

  words.forEach((w, i) => {
    if (w.length > 2 && !STOPWORDS.has(w)) {
      uniFreq.set(w, (uniFreq.get(w) || 0) + 1);
    }
    if (i < words.length - 1) {
      const w2 = words[i + 1];
      if (
        w.length > 2 &&
        w2.length > 2 &&
        !STOPWORDS.has(w) &&
        !STOPWORDS.has(w2)
      ) {
        const phrase = `${w} ${w2}`;
        biFreq.set(phrase, (biFreq.get(phrase) || 0) + 1);
      }
    }
  });

  const candidates = [];
  biFreq.forEach((count, phrase) => {
    if (count >= 2) candidates.push({ term: phrase, count: count * 1.6, isPhrase: true });
  });
  uniFreq.forEach((count, term) => {
    candidates.push({ term, count, isPhrase: false });
  });

  candidates.sort((a, b) => b.count - a.count || b.term.length - a.term.length);

  const kept = [];
  const phraseTerms = candidates.filter((c) => c.isPhrase).map((c) => c.term);
  for (const c of candidates) {
    if (!c.isPhrase && phraseTerms.some((p) => p.split(" ").includes(c.term))) continue;
    kept.push(c);
    if (kept.length >= topN) break;
  }
  return kept;
}

function termInText(term, text) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(text);
}

function scoreResume(resumeText, jdText) {
  const keywords = extractKeywords(jdText, 22);
  if (keywords.length === 0) return null;

  const cleanedResume = clean(resumeText);
  let totalWeight = 0;
  let matchedWeight = 0;
  const matched = [];
  const missing = [];

  keywords.forEach((k) => {
    totalWeight += k.count;
    if (termInText(k.term, cleanedResume)) {
      matchedWeight += k.count;
      matched.push(k.term);
    } else {
      missing.push(k.term);
    }
  });

  const score = Math.round((matchedWeight / totalWeight) * 100);
  return { score, matched, missing };
}

function verdict(score) {
  if (score >= 80) return { label: "Strong match", color: "#3E8E7E" };
  if (score >= 55) return { label: "Moderate match", color: "#C98A2E" };
  return { label: "Weak match", color: "#B34A3A" };
}

function estimateCallbackLikelihood(resumeText, matchScore) {
  const text = resumeText.toLowerCase();
  let structureScore = 0;
  const maxStructure = 4;

  if (/\d+%|\d+\s*(crore|lakh|users|clients|projects|years)/.test(text)) structureScore += 1;
  if (/(skills|technical skills|core competencies)/.test(text)) structureScore += 1;
  if (/(experience|work history|employment)/.test(text)) structureScore += 1;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 120 && wordCount <= 900) structureScore += 1;

  const structurePct = (structureScore / maxStructure) * 100;
  const blended = matchScore * 0.75 + structurePct * 0.25;
  return Math.max(5, Math.min(95, Math.round(blended)));
}

const ROLE_WORDS = new Set(["developer", "engineer", "consultant", "analyst", "architect", "manager", "designer", "specialist", "lead", "administrator"]);

function suggestRoleFromResume(resumeText) {
  const keywords = extractKeywords(resumeText, 25);
  if (keywords.length === 0) return "";

  const roleMatch = keywords.find((k) => k.isPhrase && k.term.split(" ").some((w) => ROLE_WORDS.has(w)));
  if (roleMatch) return roleMatch.term;

  const anyPhrase = keywords.find((k) => k.isPhrase);
  if (anyPhrase) return anyPhrase.term;

  return keywords[0]?.term || "";
}

const SAMPLE_JD = `We are looking for a Senior SAP ABAP Developer with strong experience in OData services, SEGW, and Fiori/UI5 integration. Hands-on knowledge of CDS Views, RAP (RESTful ABAP Programming), and AMDP is required. Experience with SAP BTP, ABAP debugging, and CRM development is a strong plus. Familiarity with performance tuning and clean code practices is expected. Bonus: exposure to REST APIs and cloud integration.`;

const SAMPLE_RESUME = `Senior Analyst with 4+ years in SAP ABAP development. Built OData services using SEGW and implemented Fiori-based UI5 applications. Strong debugging skills across CRM modules. Currently learning CDS Views and exploring SAP BTP ABAP Environment trial for RAP-based development. Comfortable with performance tuning of ABAP reports.`;

// ---------- UI ----------
export default function AtsScanner() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef(null);
  const timeoutRef = useRef(null);

  const canScan = resume.trim().length > 20 && jd.trim().length > 20;

  const handleFile = async (file) => {
    if (!file) return;
    setUploadError("");
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".txt")) {
      setUploadingFile(true);
      const text = await file.text();
      setResume(text);
      setFileName(file.name);
      setUploadingFile(false);
      return;
    }

    if (lower.endsWith(".docx")) {
      setUploadingFile(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        setResume(value);
        setFileName(file.name);
      } catch (err) {
        setUploadError("Couldn't read that .docx file. Try pasting the text instead.");
      }
      setUploadingFile(false);
      return;
    }

    if (lower.endsWith(".pdf")) {
      setUploadingFile(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: arrayBuffer,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not read PDF");
        setResume(data.text);
        setFileName(file.name);
      } catch (err) {
        setUploadError(err.message || "Couldn't read that PDF. Try pasting the text instead.");
      }
      setUploadingFile(false);
      return;
    }

    setUploadError("Unsupported file type. Use .pdf, .docx, or .txt.");
  };

  const FREE_SCAN_LIMIT = 3;
  const [isPro, setIsPro] = useState(() => localStorage.getItem("ats_is_pro") === "true");
  const [scanCount, setScanCount] = useState(() => Number(localStorage.getItem("ats_scan_count") || 0));
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  const runScan = () => {
    if (!canScan || scanning) return;
    if (!isPro && scanCount >= FREE_SCAN_LIMIT) {
      setShowUpgrade(true);
      return;
    }
    setResult(null);
    setScanning(true);
    timeoutRef.current = setTimeout(() => {
      const r = scoreResume(resume, jd);
      setResult(r);
      setScanning(false);
      if (!isPro) {
        const next = scanCount + 1;
        setScanCount(next);
        localStorage.setItem("ats_scan_count", String(next));
      }
    }, 1100);
  };

  const startPayment = async () => {
    setPayError("");
    setPayLoading(true);
    try {
      const orderRes = await fetch("/api/create-order", { method: "POST" });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || "Could not start payment");

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "ATS Resume Scanner",
        description: "Unlimited scans — one-time unlock",
        order_id: order.orderId,
        handler: async (response) => {
          try {
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.verified) {
              setIsPro(true);
              localStorage.setItem("ats_is_pro", "true");
              setShowUpgrade(false);
            } else {
              setPayError("Payment could not be verified. If you were charged, contact support.");
            }
          } catch {
            setPayError("Verification failed. If you were charged, contact support.");
          }
        },
        theme: { color: "#E8A33D" },
      });
      rzp.on("payment.failed", () => setPayError("Payment failed. Please try again."));
      rzp.open();
    } catch (err) {
      setPayError(err.message || "Something went wrong starting payment.");
    }
    setPayLoading(false);
  };

  const [jobTitle, setJobTitle] = useState("");
  const [jobTitleTouched, setJobTitleTouched] = useState(false);
  const [jobLocation, setJobLocation] = useState("India");
  const [jobs, setJobs] = useState(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");

  useEffect(() => {
    if (jobTitleTouched) return;
    if (resume.trim().length < 40) return;
    const suggestion = suggestRoleFromResume(resume);
    if (suggestion) setJobTitle(suggestion);
  }, [resume, jobTitleTouched]);

  const findJobs = async () => {
    if (!jobTitle.trim()) return;
    setJobsLoading(true);
    setJobsError("");
    setJobs(null);
    try {
      const params = new URLSearchParams({ what: jobTitle, where: jobLocation || "India" });
      const res = await fetch(`/api/job-search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not fetch jobs");
      setJobs(data.jobs || []);
    } catch (err) {
      setJobsError(err.message || "Something went wrong fetching jobs.");
    }
    setJobsLoading(false);
  };

  const loadSample = () => {
    setResume(SAMPLE_RESUME);
    setJd(SAMPLE_JD);
    setResult(null);
  };

  const reset = () => {
    setResume("");
    setJd("");
    setResult(null);
    setScanning(false);
  };

  const v = result ? verdict(result.score) : null;

  return (
    <div className="ats-page-pad" style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; }
        .ats-root { font-family: 'IBM Plex Sans', sans-serif; }
        .ats-display { font-family: 'IBM Plex Sans Condensed', sans-serif; letter-spacing: -0.01em; }
        .ats-mono { font-family: 'IBM Plex Mono', monospace; }
        **Part 2 of 3 — paste this right after Part 1 (same box, keep going):**

```javascript
        @keyframes sweep {
          0% { top: -6%; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #E8A33D 20%, #E8A33D 80%, transparent);
          box-shadow: 0 0 14px 3px rgba(232,163,61,0.65);
          animation: sweep 1.1s linear;
          pointer-events: none;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        @keyframes rowIn {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .kw-row { animation: rowIn 0.28s ease both; }

        @keyframes ringIn {
          from { stroke-dashoffset: 283; }
        }
        .ring-fg { animation: ringIn 0.9s cubic-bezier(0.22,1,0.36,1) both; }

        textarea.ats-input::placeholder { color: #8A93A0; }
        textarea.ats-input:focus { outline: none; border-color: #E8A33D; box-shadow: 0 0 0 3px rgba(232,163,61,0.18); }
        button:focus-visible, textarea:focus-visible { outline: 2px solid #E8A33D; outline-offset: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .scan-line, .kw-row, .ring-fg { animation: none !important; }
        }

        /* ---- Responsive layout ---- */
        .ats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ats-score-row { display: flex; gap: 20px; align-items: stretch; }
        .ats-kw-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .job-search-row { display: flex; gap: 10px; margin: 12px 0 16px; flex-wrap: wrap; }
        .job-search-row input { flex: 1 1 160px; min-width: 0; }
        .job-search-row button { flex: 0 0 auto; }

        .job-card { transition: border-color 0.15s ease, transform 0.15s ease; }
        .job-card:hover { border-color: #E8A33D; transform: translateY(-1px); }

        @media (max-width: 720px) {
          .ats-grid { grid-template-columns: 1fr; }
          .ats-score-row { flex-direction: column; }
          .ats-kw-columns { grid-template-columns: 1fr; gap: 24px; }
        }

        @media (max-width: 480px) {
          .job-search-row { flex-direction: column; }
          .job-search-row input, .job-search-row button { width: 100%; }
          .ats-page-pad { padding: 28px 14px 48px !important; }
          .ats-h1 { font-size: 30px !important; }
        }
      `}</style>

      <div className="ats-root" style={styles.container}>
        <div style={styles.eyebrow} className="ats-mono">RESUME · JOB DESCRIPTION · MATCH</div>
        <h1 className="ats-display ats-h1" style={styles.h1}>ATS Resume Scanner</h1>
        <p style={styles.sub}>
          Paste your resume and a job description. We'll extract what the job actually asks for
          and show you exactly which terms are missing before a recruiter — or the bot — ever sees it.
        </p>

        <div className="ats-grid" style={styles.grid}>
          <div
            style={styles.panel}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <div style={styles.panelLabelRow}>
              <div style={styles.panelLabel}>
                <FileText size={15} strokeWidth={2} />
                <span>YOUR RESUME</span>
              </div>
              <button
                style={styles.uploadBtn}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {uploadingFile ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <Upload size={13} strokeWidth={2} />
                )}
                {fileName ? fileName : "Upload .pdf / .docx / .txt"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.docx,.pdf"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            <textarea
              className="ats-input"
              style={styles.textarea}
              placeholder="Paste your resume text here, or drag a .pdf/.docx/.txt file in..."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
            {uploadError && <div style={styles.uploadError}>{uploadError}</div>}
            {scanning && <div className="scan-line" />}
          </div>

          <div style={styles.panel}>
            <div style={styles.panelLabel}>
              <Briefcase size={15} strokeWidth={2} />
              <span>JOB DESCRIPTION</span>
            </div>
            <textarea
              className="ats-input"
              style={styles.textarea}
              placeholder="Paste the job description here..."
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
            {scanning && <div className="scan-line" style={{ animationDelay: "0.15s" }} />}
          </div>
        </div>

        <div style={styles.actionsRow}>
          <button
            style={{ ...styles.primaryBtn, opacity: canScan ? 1 : 0.45, cursor: canScan ? "pointer" : "not-allowed" }}
            onClick={runScan}
            disabled={!canScan || scanning}
          >
            <Scan size={16} strokeWidth={2.2} />
            {scanning ? "Scanning..." : "Run Scan"}
          </button>
          <button style={styles.ghostBtn} onClick={loadSample}>
            <ClipboardPaste size={14} strokeWidth={2} />
            Load sample
          </button>
          <button style={styles.ghostBtn} onClick={reset}>
            <RotateCcw size={14} strokeWidth={2} />
            Clear
          </button>
          {!isPro && (
            <span className="ats-mono" style={styles.scanCounter}>
              {Math.max(FREE_SCAN_LIMIT - scanCount, 0)} free scans left
            </span>
          )}
          {isPro && <span className="ats-mono" style={styles.proBadge}>PRO — UNLIMITED</span>}
        </div>

        {result && (
          <div style={styles.resultsWrap}>
            <div className="score-row ats-score-row">
              <div style={styles.scoreCard}>
                <svg width="132" height="132" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#232B36" strokeWidth="8" />
                  <circle
                    className="ring-fg"
                    cx="50" cy="50" r="45" fill="none"
                    stroke={v.color} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray="283"
                    strokeDashoffset={283 - (283 * result.score) / 100}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div style={styles.scoreNumWrap}>
                  <div className="ats-display" style={{ ...styles.scoreNum, color: v.color }}>{result.score}%</div>
                  <div style={{ ...styles.scoreVerdict, color: v.color }} className="ats-mono">{v.label.toUpperCase()}</div>
                </div>
              </div>

              <div style={styles.callbackCard}>
                <div style={styles.callbackLabel}>ESTIMATED CALLBACK LIKELIHOOD</div>
                <div className="ats-display" style={styles.callbackNum}>
                  {estimateCallbackLikelihood(resume, result.score)}%
                </div>
                <p style={styles.callbackNote}>
                  Indicative only — based on keyword match and resume structure, not an actual
                  hiring prediction. Real outcomes depend on the recruiter, company, and market.
                </p>
              </div>
            </div>

            <div className="ats-kw-columns" style={styles.kwColumns}>
              <div style={styles.kwCol}>
                <div style={styles.kwHeader}>
                  <Check size={14} color="#3E8E7E" strokeWidth={2.5} />
                  <span>MATCHED ({result.matched.length})</span>
                </div>
                <div className="ats-mono" style={styles.kwList}>
                  {result.matched.length === 0 && <div style={styles.kwEmpty}>No terms matched yet.</div>}
                  {result.matched.map((t, i) => (
                    <div className="kw-row" key={t} style={{ ...styles.kwRow, animationDelay: `${i * 0.04}s` }}>
                      <span style={{ color: "#3E8E7E" }}>✓</span> {t}
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.kwCol}>
                <div style={styles.kwHeader}>
                  <X size={14} color="#B34A3A" strokeWidth={2.5} />
                  <span>MISSING ({result.missing.length})</span>
                </div>
                <div className="ats-mono" style={styles.kwList}>
                  {result.missing.length === 0 && <div style={styles.kwEmpty}>Nothing missing — excellent coverage.</div>}
                  {result.missing.map((t, i) => (
                    <div className="kw-row" key={t} style={{ ...styles.kwRow, animationDelay: `${i * 0.04}s` }}>
                      <span style={{ color: "#B34A3A" }}>✕</span> {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {result.missing.length > 0 && (
              <div style={styles.suggestBox}>
                <div style={styles.suggestTitle}>How to improve your score</div>
                <p style={styles.suggestText}>
                  Work the missing terms above into your resume naturally — ideally in your skills
                  section or recent experience bullets, using the same wording as the job description.
                  ATS systems match on exact phrasing, so "CDS Views" scores differently than "CDS views experience."
                </p>
              </div>
            )}
          </div>
        )}

        {resume.trim().length > 20 && (
          <div style={{ ...styles.jobSearchBox, marginTop: result ? 0 : 28 }}>
            <div style={styles.suggestTitle}>
              {result ? "Find similar job openings" : "Explore roles based on your resume"}
            </div>
            <p style={styles.suggestText}>
              {result
                ? "Search live listings for roles like this one."
                : "We've picked a likely role from your resume — search live listings, or refine the title yourself."}
            </p>
            <div className="job-search-row">
              <input
                className="ats-input"
                style={styles.jobInput}
                placeholder="Job title, e.g. SAP ABAP Developer"
                value={jobTitle}
                onChange={(e) => {
                  setJobTitle(e.target.value);
                  setJobTitleTouched(true);
                }}
              />
              <input
                className="ats-input"
                style={styles.jobInput}
                placeholder="Location, e.g. Bengaluru"
                value={jobLocation}
                onChange={(e) => setJobLocation(e.target.value)}
              />
              <button style={styles.ghostBtnSolid} onClick={findJobs} disabled={jobsLoading || !jobTitle.trim()}>
                {jobsLoading ? "Searching..." : "Find jobs"}
              </button>
            </div>

            {jobsError && <div style={styles.uploadError}>{jobsError}</div>}

            {jobs && jobs.length === 0 && !jobsError && (
              <div style={styles.kwEmpty}>No live listings found for that search — try a broader title or location.</div>
            )}

            {jobs && jobs.length > 0 && (
              <div style={styles.jobList}>
                {jobs.map((job) => (
                  <a
                    key={job.id}
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.jobCard}
                    className="job-card"
                  >
                    <div style={styles.jobCardTop}>
                      <div style={styles.jobCardTitle}>{job.title}</div>
                      <ExternalLink size={13} color="#7C8896" />
                    </div>
                    <div style={styles.jobCardMeta}>
                      <span>{job.company}</span>
                      <span style={styles.jobCardDot}>·</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <MapPin size={11} /> {job.location}
                      </span>
                    </div>
                    {(job.salaryMin || job.salaryMax) && (
                      <div style={styles.jobCardSalary}>
                        ₹{Math.round((job.salaryMin || 0) / 1000)}k–₹{Math.round((job.salaryMax || 0) / 1000)}k / year (est.)
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {!result && !scanning && (
          <div style={styles.emptyState}>
            Paste both fields above and run a scan to see your match score.
          </div>
        )}
      </div>

      {showUpgrade && (
        <div style={styles.modalOverlay} onClick={() => !payLoading && setShowUpgrade(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className="ats-mono" style={styles.modalEyebrow}>FREE LIMIT REACHED</div>
            <h2 className="ats-display" style={styles.modalTitle}>Unlock unlimited scans</h2>
            <p style={styles.modalText}>
              You've used your {FREE_SCAN_LIMIT} free scans. Go Pro for unlimited resume-to-JD
              matching, one-time payment, no subscription.
            </p>
            <div style={styles.modalPrice}>₹199 <span style={styles.modalPriceSub}>one-time</span></div>
            <button style={styles.primaryBtn} onClick={startPayment} disabled={payLoading}>
              {payLoading ? "Starting..." : "Pay & Unlock"}
            </button>
            {payError && <div style={styles.uploadError}>{payError}</div>}
            <button style={styles.modalClose} onClick={() => setShowUpgrade(false)}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    background: "#10151C",
    padding: "48px 20px 64px",
    display: "flex",
```

**Say "Next" for Part 3 (the final part).**
**Part 3 of 3 — final part, paste right after Part 2:**

```javascript
    justifyContent: "center",
  },
  container: { width: "100%", maxWidth: 860 },
  eyebrow: {
    color: "#E8A33D",
    fontSize: 12,
    letterSpacing: "0.12em",
    marginBottom: 10,
  },
  h1: {
    color: "#ECEEE9",
    fontSize: 40,
    fontWeight: 700,
    margin: "0 0 12px",
    lineHeight: 1.05,
  },
  sub: {
    color: "#9AA4B2",
    fontSize: 15.5,
    lineHeight: 1.55,
    maxWidth: 560,
    margin: "0 0 32px",
  },
  grid: {
    marginBottom: 18,
  },
  panel: {
    position: "relative",
    background: "#161D27",
    border: "1px solid #232B36",
    borderRadius: 10,
    padding: 14,
    overflow: "hidden",
  },
  panelLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  panelLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#7C8896",
    fontSize: 11.5,
    letterSpacing: "0.08em",
    fontWeight: 600,
  },
  uploadBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "1px dashed #384252",
    borderRadius: 6,
    color: "#8A93A0",
    fontSize: 11,
    padding: "5px 9px",
    cursor: "pointer",
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  uploadError: {
    color: "#D98B6E",
    fontSize: 11.5,
    marginTop: 8,
    lineHeight: 1.4,
  },
  textarea: {
    width: "100%",
    height: 180,
    resize: "vertical",
    background: "transparent",
    border: "1px solid #2B3542",
    borderRadius: 8,
    color: "#DCE1E8",
    fontSize: 13.5,
    lineHeight: 1.5,
    padding: 12,
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  scanCounter: {
    color: "#7C8896",
    fontSize: 11.5,
    marginLeft: "auto",
  },
  proBadge: {
    color: "#3E8E7E",
    fontSize: 11.5,
    marginLeft: "auto",
    letterSpacing: "0.06em",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(8,11,16,0.72)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  modalCard: {
    background: "#161D27",
    border: "1px solid #2B3542",
    borderRadius: 14,
    padding: "28px 26px",
    maxWidth: 380,
    width: "100%",
    textAlign: "center",
  },
  modalEyebrow: {
    color: "#E8A33D",
    fontSize: 11,
    letterSpacing: "0.1em",
    marginBottom: 10,
  },
  modalTitle: {
    color: "#ECEEE9",
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 10px",
  },
  modalText: {
    color: "#9AA4B2",
    fontSize: 13.5,
    lineHeight: 1.55,
    margin: "0 0 18px",
  },
  modalPrice: {
    color: "#ECEEE9",
    fontSize: 30,
    fontWeight: 700,
    marginBottom: 18,
  },
  modalPriceSub: {
    color: "#7C8896",
    fontSize: 13,
    fontWeight: 400,
  },
  modalClose: {
    display: "block",
    margin: "14px auto 0",
    background: "none",
    border: "none",
    color: "#7C8896",
    fontSize: 12.5,
    cursor: "pointer",
    textDecoration: "underline",
  },
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  primaryBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#E8A33D",
    color: "#1A1206",
    border: "none",
    borderRadius: 8,
    padding: "11px 20px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  ghostBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    color: "#8A93A0",
    border: "1px solid #2B3542",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: "pointer",
  },
  resultsWrap: {
    marginTop: 28,
    borderTop: "1px solid #232B36",
    paddingTop: 28,
  },
  scoreCard: {
    display: "flex",
    alignItems: "center",
    gap: 22,
    marginBottom: 28,
  },
  scoreNumWrap: { display: "flex", flexDirection: "column", gap: 4 },
  scoreNum: { fontSize: 34, fontWeight: 700 },
  scoreVerdict: { fontSize: 11.5, letterSpacing: "0.1em" },
  kwColumns: {
    marginBottom: 20,
  },
  kwCol: {},
  kwHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#7C8896",
    fontSize: 11.5,
    letterSpacing: "0.06em",
    fontWeight: 600,
    marginBottom: 10,
  },
  kwList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 13,
    color: "#C4CBD4",
    maxHeight: 260,
    overflowY: "auto",
  },
  kwRow: { display: "flex", gap: 8 },
  kwEmpty: { color: "#5A6472", fontSize: 12.5, fontStyle: "italic" },
  suggestBox: {
    background: "#161D27",
    border: "1px solid #2B3542",
    borderLeft: "3px solid #E8A33D",
    borderRadius: 8,
    padding: "16px 18px",
  },
  suggestTitle: {
    color: "#ECEEE9",
    fontSize: 13.5,
    fontWeight: 600,
    marginBottom: 6,
  },
  suggestText: {
    color: "#9AA4B2",
    fontSize: 13.5,
    lineHeight: 1.6,
    margin: 0,
  },
  callbackCard: {
    flex: 1,
    background: "#161D27",
    border: "1px solid #232B36",
    borderRadius: 10,
    padding: "16px 18px",
    minWidth: 200,
  },
  callbackLabel: {
    color: "#7C8896",
    fontSize: 11,
    letterSpacing: "0.08em",
    fontWeight: 600,
    marginBottom: 8,
  },
  callbackNum: {
    color: "#E8A33D",
    fontSize: 30,
    fontWeight: 700,
    marginBottom: 8,
  },
  callbackNote: {
    color: "#7C8896",
    fontSize: 11.5,
    lineHeight: 1.5,
    margin: 0,
  },
  jobSearchBox: {
    background: "#161D27",
    border: "1px solid #2B3542",
    borderRadius: 8,
    padding: "16px 18px",
    marginTop: 20,
  },
  jobInput: {
    background: "transparent",
    border: "1px solid #2B3542",
    borderRadius: 8,
    color: "#DCE1E8",
    fontSize: 13.5,
    padding: "10px 12px",
  },
  ghostBtnSolid: {
    background: "#232B36",
    color: "#ECEEE9",
    border: "1px solid #384252",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 13,
    fontFamily: "'IBM Plex Sans', sans-serif",
    cursor: "pointer",
  },
  jobList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  jobCard: {
    display: "block",
    background: "#10151C",
    border: "1px solid #232B36",
    borderRadius: 8,
    padding: "12px 14px",
    textDecoration: "none",
  },
  jobCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  jobCardTitle: {
    color: "#ECEEE9",
    fontSize: 14,
    fontWeight: 600,
  },
  jobCardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "#8A93A0",
    fontSize: 12.5,
  },
  jobCardDot: { color: "#3A4452" },
  jobCardSalary: {
    color: "#3E8E7E",
    fontSize: 12,
    marginTop: 6,
  },
  emptyState: {
    color: "#5A6472",
    fontSize: 13.5,
    fontStyle: "italic",
    borderTop: "1px solid #232B36",
    paddingTop: 24,
    marginTop: 8,
  },
};
```

That's the complete file — now scroll up, tap **Commit changes**, then confirm. Once that's done, check Vercel's Deployments tab to make sure it redeploys and builds successfully, then try uploading a PDF resume to test both new features.
