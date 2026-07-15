import React, { useState, useMemo, useRef, useEffect } from "react";
import { Scan, Check, X, RotateCcw, ClipboardPaste, FileText, Briefcase, Upload, Loader2, MapPin, ExternalLink, LogOut, ShieldCheck } from "lucide-react";
import mammoth from "mammoth";
import { supabase, ADMIN_EMAIL } from "./supabaseClient";
import Login from "./Login";
import Admin from "./Admin";

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

function Scanner({ session, profile, onScanUsed, onUpgraded, onOpenAdmin, onLogout }) {
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
  const isPro = !!profile?.is_pro;
  const scanCount = profile?.scan_count ?? 0;
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
        onScanUsed();
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
              await onUpgraded();
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
