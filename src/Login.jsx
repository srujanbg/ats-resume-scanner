import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Account created. Check your email to confirm, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    }
    setLoading(false);
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.eyebrow}>ATS RESUME SCANNER</div>
        <h1 style={styles.title}>{mode === "signup" ? "Create an account" : "Sign in"}</h1>

        <form onSubmit={handleSubmit}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            placeholder="you@example.com"
          />

          <label style={styles.label}>Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            placeholder="At least 6 characters"
          />

          {error && <div style={styles.error}>{error}</div>}
          {message && <div style={styles.message}>{message}</div>}

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "Please wait..." : mode === "signup" ? "Sign up" : "Sign in"}
          </button>
        </form>

        <button
          style={styles.switchBtn}
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
            setMessage("");
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#10151C",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#161D27",
    border: "1px solid #2B3542",
    borderRadius: 14,
    padding: "32px 28px",
  },
  eyebrow: {
    color: "#E8A33D",
    fontSize: 11,
    letterSpacing: "0.1em",
    marginBottom: 10,
  },
  title: {
    color: "#ECEEE9",
    fontSize: 24,
    fontWeight: 700,
    margin: "0 0 22px",
  },
  label: {
    display: "block",
    color: "#9AA4B2",
    fontSize: 12.5,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    width: "100%",
    background: "transparent",
    border: "1px solid #2B3542",
    borderRadius: 8,
    color: "#DCE1E8",
    fontSize: 14,
    padding: "10px 12px",
    boxSizing: "border-box",
  },
  error: {
    color: "#D98B6E",
    fontSize: 12.5,
    marginTop: 12,
    lineHeight: 1.4,
  },
  message: {
    color: "#3E8E7E",
    fontSize: 12.5,
    marginTop: 12,
    lineHeight: 1.4,
  },
  submitBtn: {
    width: "100%",
    marginTop: 20,
    background: "#E8A33D",
    color: "#1A1206",
    border: "none",
    borderRadius: 8,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  switchBtn: {
    width: "100%",
    marginTop: 16,
    background: "none",
    border: "none",
    color: "#7C8896",
    fontSize: 12.5,
    textDecoration: "underline",
    cursor: "pointer",
  },
};
