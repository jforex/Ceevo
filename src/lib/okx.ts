// OKX x402 facilitator access via the official SDK (@okxweb3/x402-core).
//
// We previously hand-rolled the /verify and /settle HTTP calls (manual HMAC signing,
// hand-built request bodies). That is exactly the layer the reference SDK owns, and a
// subtle divergence there made valid signed payments fail verify and re-issue 402.
// Using OKXFacilitatorClient makes request construction, auth signing, and the
// verify/settle contract match the Broker's expectations by construction.
import { OKXFacilitatorClient } from "@okxweb3/x402-core";

// syncSettle:true → settle waits for on-chain confirmation before returning, so we only
// deliver the paid content once payment is actually settled.
const client = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY ?? "",
  secretKey: process.env.OKX_API_SECRET ?? "",
  passphrase: process.env.OKX_API_PASSPHRASE ?? "",
  baseUrl: process.env.OKX_PAYMENT_BASE_URL || undefined,
  syncSettle: true,
});

export type FacilitatorPayload = Parameters<OKXFacilitatorClient["verify"]>[0];
export type FacilitatorRequirements = Parameters<OKXFacilitatorClient["verify"]>[1];

export function okxVerify(payload: FacilitatorPayload, requirements: FacilitatorRequirements) {
  return client.verify(payload, requirements);
}

export function okxSettle(payload: FacilitatorPayload, requirements: FacilitatorRequirements) {
  return client.settle(payload, requirements);
}

export function okxSupported() {
  return client.getSupported();
}

export function okxSettleStatus(txHash: string) {
  return client.getSettleStatus(txHash);
}
