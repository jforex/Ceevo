import { config } from "dotenv";
config({ path: ".env.local" });
import { x402Client, x402HTTPClient } from "@okxweb3/x402-core/client";
import { registerExactEvmScheme } from "@okxweb3/x402-evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const URL = "https://www.ceevo.xyz/api/review/full";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY!.startsWith("0x")
    ? process.env.DEPLOYER_PRIVATE_KEY! : "0x" + process.env.DEPLOYER_PRIVATE_KEY!;
  const account = privateKeyToAccount(pk as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const httpClient = new x402HTTPClient(client);

  // Buyer sends ONLY the CV — no jobDescription, no jobTitle, no country.
  // This is what "wasn't prompted" would actually look like for an ASP buyer.
  const body = JSON.stringify({
    cvText: "Amara Okafor Backend Developer. Paystack Backend Engineer 2021-2024 Python Django Postgres.",
  });

  console.log("=== probe (expect 402) ===");
  const res1 = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  console.log("status:", res1.status);
  const paymentRequired = httpClient.getPaymentRequiredResponse((n) => res1.headers.get(n));

  console.log("\n=== sign + pay ===");
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const res2 = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  console.log("status:", res2.status);
  console.log("body:", await res2.text());
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
