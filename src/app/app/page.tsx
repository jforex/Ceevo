import Link from "next/link";

export default function Landing() {
  return (
    <main>
      {/* NAV */}
      <nav
        style={{
          maxWidth: 1120, margin: "0 auto", padding: "24px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/ceevo-logo.png" alt="Ceevo" width={38} height={38} style={{ borderRadius: 9 }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>
            Ceevo
          </span>
        </div>
        <Link
          href="/app"
          style={{
            fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text)",
            border: "1px solid var(--line)", padding: "9px 16px", borderRadius: 8, textDecoration: "none",
          }}
        >
          Open app →
        </Link>
      </nav>

      {/* HERO */}
      <section
        style={{
          maxWidth: 1120, margin: "0 auto", padding: "clamp(40px,9vw,110px) 20px clamp(30px,6vw,70px)",
          display: "grid", gridTemplateColumns: "1fr", gap: 48, alignItems: "center",
        }}
        className="hero-grid"
      >
        <div>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 22,
              fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)",
              border: "1px solid var(--line)", padding: "6px 12px", borderRadius: 999,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--lime)", display: "inline-block" }} />
            Built on X Layer · pay-per-review with USDC
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)", fontSize: "clamp(40px,7vw,74px)", fontWeight: 700,
              lineHeight: 1.0, letterSpacing: -2.5, margin: 0,
            }}
          >
            Your CV,
            <br />
            <span style={{ color: "var(--blue)" }}>graded</span> and{" "}
            <span style={{ color: "var(--lime)" }}>verified</span>.
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 19, lineHeight: 1.5, maxWidth: 520, marginTop: 22 }}>
            Ceevo reads your CV, scores it against the exact job, rewrites it to the target
            country&apos;s hiring norms, and mints a verifiable on-chain credential.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            <Link
              href="/app"
              style={{
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--bg)",
                background: "var(--lime)", padding: "15px 28px", borderRadius: 10, textDecoration: "none",
              }}
            >
              Score my CV — free →
            </Link>
            <a
              href="#how"
              style={{
                fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, color: "var(--text)",
                border: "1px solid var(--line)", padding: "15px 24px", borderRadius: 10, textDecoration: "none",
              }}
            >
              How it works
            </a>
          </div>
        </div>

        {/* logo showcase */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              position: "relative", width: "min(360px, 80vw)", aspectRatio: "1",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute", inset: 0, borderRadius: 28,
                background: "radial-gradient(circle at 50% 40%, rgba(45,91,255,.35), transparent 65%)",
                filter: "blur(20px)",
              }}
            />
            <img
              src="/ceevo-logo.png"
              alt="Ceevo"
              style={{ position: "relative", width: "78%", borderRadius: 24, boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(40px,7vw,90px) 20px" }}>
        <h2 style={sectionLabel}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }} className="steps-grid">
          {[
            ["01", "Read", "We parse your PDF or DOCX and detect your field, seniority, and target role — automatically."],
            ["02", "Score", "An ATS-style match score against the exact job, with matched and missing keywords and concrete fixes."],
            ["03", "Rewrite", "A truthful rewrite tuned to the target country's hiring norms — never inventing skills you don't have."],
            ["04", "Verify", "Mint a soulbound on-chain credential on X Layer proving your CV was reviewed."],
          ].map(([n, t, d]) => (
            <div key={n} style={card}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--blue)", marginBottom: 12 }}>{n}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{t}</div>
              <div style={{ color: "var(--muted)", fontSize: 14.5, lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING SPLIT */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(20px,4vw,50px) 20px clamp(50px,8vw,100px)" }}>
        <h2 style={sectionLabel}>Free vs full</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }} className="price-grid">
          <div style={card}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Free review</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>$0 · no wallet needed</div>
            {["Field + seniority detection", "ATS match score", "Matched / missing keywords", "Top fixes to make"].map((f) => (
              <div key={f} style={featRow}><span style={{ color: "var(--lime)" }}>✓</span> {f}</div>
            ))}
          </div>
          <div style={{ ...card, borderColor: "var(--blue)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              Full unlock
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--blue)", marginBottom: 20 }}>pay-per-use · USDC on X Layer</div>
            {[
              "Everything in free",
              "Full country-tailored rewrite",
              "Personalized job leads + where to apply",
              "Soulbound on-chain credential",
            ].map((f) => (
              <div key={f} style={featRow}><span style={{ color: "var(--blue)" }}>✓</span> {f}</div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 48 }}>
          <Link
            href="/app"
            style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--bg)",
              background: "var(--lime)", padding: "16px 36px", borderRadius: 10, textDecoration: "none",
            }}
          >
            Start free →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid var(--line)", padding: "28px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
          Ceevo · on-chain CV verification on X Layer
        </span>
      </footer>

      <style>{`
        @media (min-width: 900px) {
          .hero-grid { grid-template-columns: 1.1fr .9fr !important; }
          .steps-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .price-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </main>
  );
}

const sectionLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 2, color: "var(--muted)",
  textTransform: "uppercase", marginBottom: 28, fontWeight: 400,
};
const card: React.CSSProperties = {
  background: "var(--bg-panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24,
};
const featRow: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", fontSize: 14.5, color: "var(--text)",
  padding: "7px 0", fontFamily: "var(--font-body)",
};
