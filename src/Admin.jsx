import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Admin({ session, onBack }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/admin-users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load users");
        setUsers(data.users);
      } catch (err) {
        setError(err.message || "Something went wrong.");
      }
      setLoading(false);
    };
    fetchUsers();
  }, [session]);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.eyebrow}>ADMIN ONLY</div>
            <h1 style={styles.title}>Registered users</h1>
          </div>
          <button style={styles.backBtn} onClick={onBack}>← Back to scanner</button>
        </div>

        {loading && <div style={styles.info}>Loading...</div>}
        {error && <div style={styles.error}>{error}</div>}

        {users && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Pro</th>
                  <th style={styles.th}>Scans used</th>
                  <th style={styles.th}>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>{u.is_pro ? "Yes" : "No"}</td>
                    <td style={styles.td}>{u.scan_count}</td>
                    <td style={styles.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <div style={styles.info}>No users yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#10151C",
    padding: "40px 20px",
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  container: { maxWidth: 800, margin: "0 auto" },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    flexWrap: "wrap",
    gap: 12,
  },
  eyebrow: { color: "#E8A33D", fontSize: 11, letterSpacing: "0.1em", marginBottom: 8 },
  title: { color: "#ECEEE9", fontSize: 26, fontWeight: 700, margin: 0 },
  backBtn: {
    background: "transparent",
    border: "1px solid #2B3542",
    borderRadius: 8,
    color: "#9AA4B2",
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  info: { color: "#7C8896", fontSize: 13.5 },
  error: { color: "#D98B6E", fontSize: 13.5 },
  tableWrap: {
    background: "#161D27",
    border: "1px solid #2B3542",
    borderRadius: 10,
    overflow: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    color: "#7C8896",
    fontSize: 11.5,
    letterSpacing: "0.06em",
    padding: "12px 16px",
    borderBottom: "1px solid #2B3542",
  },
  td: {
    color: "#DCE1E8",
    fontSize: 13.5,
    padding: "12px 16px",
    borderBottom: "1px solid #232B36",
  },
};
