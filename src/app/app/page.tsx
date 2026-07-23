"use client";

import { useState } from "react";
import Link from "next/link";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { wrapFetchWithPayment } from "x402-fetch";
import { activeChain } from "@/lib/chain";
import { COUNTRY_LABELS } from "@/data/countryRules";
import type { FieldDetection } from "@/agent/detectField";
import type { CVScore } from "@/agent/scoreCV";
import type { ChangePlan } from "@/agent/changePlan";
import type { JobLeads } from "@/agent/recommendJobs";

// Free tier — /api/review/basic returns detection + score only.
type BasicResult = {
  field: FieldDetection;
  score: CVScore;
};

type FullResult = BasicResult & {
  plan: ChangePlan;
  rewritten: string;
  letter: string;
  jobs: JobLeads | null;
  // Sections the server had to drop to stay inside the time budget.
  partial?: { rewritten: boolean; letter: boolean; jobs: boolean };
};

// Max the client will auto-pay, in base units. Endpoint charges 10000 (0.01 USDT).
const MAX_PAYMENT = BigInt(100000);

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [country, setCountry] = useState("US");

  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "wallet" | "basic" | "review">(null);
  const [error, setError] = useState<string | null>(null);
  const [basic, setBasic] = useState<BasicResult | null>(null);
  const [result, setResult] = useState<FullResult | null>(null);
  const [planApproved, setPlanApproved] = useState(false);

  // The paid result supersedes the free one; show whichever score we have.
  const shown = result ?? basic;

  function validate(): string | null {
    if (!file) return "Upload your CV first.";
    if (!jobDescription.trim()) return "Paste the job description first.";
    return null;
  }

  async function runFreeScore() {
    const invalid = validate();
    if (invalid) return setError(invalid);

    setError(null);
    setResult(null);
    setBasic(null);
    setPlanApproved(false);
    setBusy("basic");

    try {
      const form = new FormData();
      form.append("cv", file!);
      form.append("jobTitle", jobTitle);
      form.append("jobDescription", jobDescription);

      const res = await fetch("/api/review/basic", { method: "POST", body: form });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error ?? `Scoring failed (${res.status}).`);
      }
      setBasic(await res.json() as BasicResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scoring failed.");
    } finally {
      setBusy(null);
    }
  }

  async function connectWallet() {
    setError(null);
    if (!window.ethereum) {
      setError("No wallet found. Install OKX Wallet or MetaMask to pay for a full review.");
      return;
    }
    setBusy("wallet");
    try {
      const [addr] = await window.ethereum.request({
        method: "eth_requestAccounts",
      }) as string[];
      setAddress(addr);
    } catch {
      setError("Wallet connection was rejected.");
    } finally {
      setBusy(null);
    }
  }

  async function runFullReview() {
    const invalid = validate();
    if (invalid) return setError(invalid);
    if (!window.ethereum || !address) return setError("Connect your wallet first.");

    setError(null);
    setResult(null);
    setPlanApproved(false);
    setBusy("review");

    try {
      const wallet = createWalletClient({
        account: address as `0x${string}`,
        chain: activeChain,
        transport: custom(window.ethereum),
      });

      // Ensure the wallet is on X Layer before signing a payment for it.
      const current = await window.ethereum.request({ method: "eth_chainId" }) as string;
      if (parseInt(current, 16) !== activeChain.id) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${activeChain.id.toString(16)}` }],
        });
      }

      const form = new FormData();
      form.append("cv", file!);
      form.append("jobTitle", jobTitle);
      form.append("jobDescription", jobDescription);
      form.append("country", country);

      // wrapFetchWithPayment handles the 402: it reads the requirements,
      // signs the payment, and replays the request with the X-PAYMENT header.
      const payFetch = wrapFetchWithPayment(
        fetch,
        // viem's WalletClient satisfies the x402 Signer shape at runtime.
        wallet as never,
        MAX_PAYMENT
      );

      const res = await payFetch("/api/review/full", { method: "POST", body: form });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error ?? `Review failed (${res.status}).`);
      }

      setResult(await res.json() as FullResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment or review failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px 90px" }}>
      {/* NAV */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "var(--text)" }}>
          <img src="/ceevo-logo.png" alt="Ceevo" width={34} height={34} style={{ borderRadius: 8 }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 700, letterSpacing: -0.5 }}>
            Ceevo
          </span>
        </Link>
        <button onClick={connectWallet} disabled={busy === "wallet" || !!address} style={address ? pillConnected : pill}>
          {address
            ? `${address.slice(0, 6)}…${address.slice(-4)}`
            : busy === "wallet" ? "Connecting…" : "Connect wallet"}
        </button>
      </nav>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px,5vw,44px)", fontWeight: 700, letterSpacing: -1.5, margin: "0 0 10px" }}>
        Full review
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.5, margin: "0 0 34px" }}>
        Score, change plan, country-tailored rewrite, cover letter, and job leads — one payment of{" "}
        <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>0.01 USDT</span> on {activeChain.name}.
      </p>

      {/* FORM */}
      <div style={{ ...card, display: "grid", gap: 18 }}>
        <label style={labelStyle}>
          Your CV
          <input
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ ...input, padding: 12 }}
          />
          <span style={hint}>PDF, DOCX, or TXT</span>
        </label>

        <label style={labelStyle}>
          Job title
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Backend Engineer"
            style={input}
          />
        </label>

        <label style={labelStyle}>
          Job description
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job posting here…"
            rows={7}
            style={{ ...input, resize: "vertical", fontFamily: "var(--font-body)" }}
          />
        </label>

        <label style={labelStyle}>
          Target country
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={input}>
            {Object.entries(COUNTRY_LABELS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>

        <button
          onClick={runFreeScore}
          disabled={!!busy}
          style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}
        >
          {busy === "basic" ? "Scoring…" : "Score my CV — free →"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)" }}>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: 1 }}>OR</span>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        <button
          onClick={runFullReview}
          disabled={!!busy}
          style={{ ...secondaryBtn, opacity: busy ? 0.6 : 1 }}
        >
          {busy === "review" ? "Paying & reviewing — this takes a moment…" : "Pay 0.01 USDT & run full review →"}
        </button>

        {!address && (
          <span style={{ ...hint, textAlign: "center" }}>
            The full review needs a connected wallet on {activeChain.name}. The score is free — no wallet.
          </span>
        )}

        {error && (
          <div style={{ background: "rgba(255,92,122,.1)", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: 10, padding: "12px 14px", fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>

      {/* RESULTS — staged reveal */}
      {shown && (
        <div style={{ display: "grid", gap: 20, marginTop: 34 }}>
          {/* 1 · SCORE — free tier stops here */}
          <section style={card}>
            <div style={sectionTag}>01 · Match score</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 700, color: scoreColor(shown.score.score), lineHeight: 1 }}>
                {shown.score.score}
              </span>
              <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 14 }}>/ 100</span>
            </div>
            <p style={{ fontSize: 15.5, lineHeight: 1.55, margin: "0 0 18px" }}>{shown.score.summary}</p>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
              {shown.field.field} · {shown.field.seniority} · {shown.field.target_role}
            </div>
            <KeywordRow label="Matched" items={shown.score.matched_keywords} color="var(--lime)" />
            <KeywordRow label="Missing" items={shown.score.missing_keywords} color="var(--danger)" />
            {shown.score.gaps.length > 0 && (
              <ul style={{ margin: "14px 0 0", paddingLeft: 20, color: "var(--text)", fontSize: 14.5, lineHeight: 1.6 }}>
                {shown.score.gaps.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            )}
          </section>

          {/* Free tier upsell — only when there is no paid result yet */}
          {!result && (
            <section style={{ ...card, borderColor: "var(--blue)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, marginBottom: 8 }}>
                Unlock the full review
              </div>
              <p style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.55, margin: "0 0 18px" }}>
                Get a change plan, a country-tailored rewrite, a matching cover letter, and
                personalized job leads — one payment of 0.01 USDT.
              </p>
              <button onClick={runFullReview} disabled={!!busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
                {busy === "review" ? "Paying & reviewing…" : "Pay 0.01 USDT & unlock →"}
              </button>
            </section>
          )}

          {/* 2 · CHANGE PLAN — paid only */}
          {result && (
          <section style={card}>
            <div style={sectionTag}>02 · Change plan</div>
            <p style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.5, margin: "0 0 18px" }}>
              What the rewrite will change, and why. Nothing here invents experience you don&apos;t have.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              {result.plan.changes.map((c, i) => (
                <div key={i} style={{ background: "var(--bg-elev)", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 5, lineHeight: 1.45 }}>{c.change}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>{c.reason}</div>
                </div>
              ))}
            </div>

            {!planApproved && (
              <button onClick={() => setPlanApproved(true)} style={{ ...primaryBtn, marginTop: 20 }}>
                Approve &amp; show rewrite →
              </button>
            )}
          </section>
          )}

          {/* 3-5 · revealed after approval — already paid for, no second payment */}
          {result && planApproved && (
            <>
              {result.partial?.rewritten && result.partial?.letter && result.partial?.jobs && (
                <section style={{ ...card, borderColor: "var(--danger)" }}>
                  <div style={{ color: "var(--danger)", fontSize: 14.5, lineHeight: 1.55 }}>
                    The rewrite, cover letter, and job leads timed out. Your score and change plan
                    are above — rerun the full review to try the rest again.
                  </div>
                </section>
              )}

              {!result.partial?.rewritten && (
              <section style={card}>
                <div style={sectionTag}>03 · Rewritten CV</div>
                <pre style={pre}>{result.rewritten}</pre>
                <CopyButton text={result.rewritten} label="Copy CV" />
              </section>
              )}

              {!result.partial?.letter && (
              <section style={card}>
                <div style={sectionTag}>04 · Cover letter</div>
                <pre style={pre}>{result.letter}</pre>
                <CopyButton text={result.letter} label="Copy letter" />
              </section>
              )}

              {result.jobs && (
              <section style={card}>
                <div style={sectionTag}>05 · Job leads</div>
                <div style={{ display: "grid", gap: 12 }}>
                  {result.jobs.leads.map((l, i) => (
                    <div key={i} style={{ background: "var(--bg-elev)", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 5 }}>{l.role}</div>
                      <div style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 9 }}>{l.why}</div>
                      <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--blue)", wordBreak: "break-word" }}>
                        {l.search_query}
                      </code>
                    </div>
                  ))}
                </div>
                {result.jobs.where_to_search.length > 0 && (
                  <>
                    <div style={{ ...sectionTag, marginTop: 22, marginBottom: 10 }}>Where to search</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {result.jobs.where_to_search.map((w, i) => (
                        <span key={i} style={chip}>{w}</span>
                      ))}
                    </div>
                  </>
                )}
              </section>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}

function KeywordRow({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)", marginBottom: 7, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {items.map((k, i) => (
          <span key={i} style={{ ...chip, borderColor: color, color }}>{k}</span>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      style={{ ...pill, marginTop: 14 }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

function scoreColor(n: number) {
  if (n >= 75) return "var(--lime)";
  if (n >= 50) return "var(--blue)";
  return "var(--danger)";
}

const card: React.CSSProperties = {
  background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24,
};
const sectionTag: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 1.5, color: "var(--muted)",
  textTransform: "uppercase", marginBottom: 16,
};
const labelStyle: React.CSSProperties = {
  display: "grid", gap: 8, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-body)",
};
const input: React.CSSProperties = {
  background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 10,
  padding: "12px 14px", color: "var(--text)", fontSize: 15, fontFamily: "var(--font-body)", width: "100%",
};
const hint: React.CSSProperties = {
  fontSize: 12.5, color: "var(--muted)", fontWeight: 400, fontFamily: "var(--font-mono)",
};
const primaryBtn: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--bg)",
  background: "var(--lime)", padding: "15px 24px", borderRadius: 10, border: "none",
  cursor: "pointer", width: "100%",
};
const secondaryBtn: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text)",
  background: "transparent", padding: "15px 24px", borderRadius: 10,
  border: "1px solid var(--blue)", cursor: "pointer", width: "100%",
};
const pill: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text)", background: "transparent",
  border: "1px solid var(--line)", padding: "9px 16px", borderRadius: 8, cursor: "pointer",
};
const pillConnected: React.CSSProperties = {
  ...pill, borderColor: "var(--lime)", color: "var(--lime)", cursor: "default",
};
const chip: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 12, border: "1px solid var(--line)",
  color: "var(--muted)", padding: "5px 10px", borderRadius: 999,
};
const pre: React.CSSProperties = {
  whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-body)",
  fontSize: 15, lineHeight: 1.62, margin: 0, color: "var(--text)",
};
