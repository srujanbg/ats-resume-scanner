# ATS Resume Scanner

A resume-vs-job-description match scorer with a Razorpay-powered "Pro" unlock (unlimited scans, one-time payment).

## What's in this project
- `src/App.jsx` — the frontend (React + Vite)
- `api/create-order.js` — Vercel serverless function that creates a Razorpay order
- `api/verify-payment.js` — Vercel serverless function that verifies the payment signature
- `api/job-search.js` — Vercel serverless function that fetches live job listings via the Adzuna API

## New features
- **Job search**: after a scan, users can search live job openings (via Adzuna) matching a title + location
- **Estimated callback likelihood**: a heuristic score blending keyword match with resume structure signals. This is clearly labeled as indicative only — it is not a real hiring-outcome prediction
- **Responsive layout**: input panels, score/callback cards, and keyword columns stack vertically below 720px width

## 1. Local setup
```bash
npm install
npm run dev
