import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CVChain — On-chain CV verification",
  description:
    "Get your CV graded against the job, rewritten to country hiring norms, and verified on-chain on X Layer.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
