import { NextRequest, NextResponse } from "next/server";
import { okxVerify, okxSettle } from "./okx";

const NETWORK = process.env.PAYMENT_NETWORK ?? "eip155:196";
const ASSET = process.env.PAYMENT_ASSET ?? "";
const PAY_TO = process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
const AMOUNT = process.env.PAYMENT_AMOUNT ?? "10000";
// EIP-712 domain fields for the token, verified against the token's on-chain
// DOMAIN_SEPARATOR (name="USD₮0", version="1"). Buyer signs EIP-3009 against these.
const TOKEN_NAME = process.env.PAYMENT_TOKEN_NAME ?? "USD₮0";
const TOKEN_VERSION = process.env.PAYMENT_TOKEN_VERSION ?? "1";

// PaymentRequirements per the Broker spec (HTTP API — One-time Payment, exact/EIP-3009):
// scheme, network, amount, asset, payTo, maxTimeoutSeconds, extra{name,version}.
// This object is the source of truth used in THREE places that must be byte-identical:
//   1. the accepts[] entry in the 402 challenge,
//   2. the paymentRequirements sent to /verify,
//   3. the paymentRequirements sent to /settle.
// The Broker enforces that the buyer's signed `accepted` matches `paymentRequirements`
// (param_mismatch / requirements_mismatch on any drift), so no extra, non-schema fields
// may appear here. `decimals` and `resource` are NOT PaymentRequirements fields — an
// earlier build added them and that is what made valid payments verify-fail and re-402.
// `resource` belongs in PaymentPayload (added by the buyer's client), not here.
function requirements() {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: TOKEN_NAME, version: TOKEN_VERSION },
  };
}

// The 402 Payment Required challenge: status 402 + the accepts array the client signs.
// Method-agnostic, so the GET verification probe and an unpaid POST return the identical
// challenge. `resource` is carried as a sibling of `accepts` (protocol-level metadata),
// not inside the PaymentRequirements entry the buyer signs.
export function paymentChallenge(resourceUrl: string): NextResponse {
  return NextResponse.json(
    {
      x402Version: 2,
      accepts: [requirements()],
      resource: { url: resourceUrl },
    },
    { status: 402 }
  );
}

// Returns null if paid+settled; otherwise a 402 NextResponse to return immediately.
export async function requirePayment(req: NextRequest): Promise<NextResponse | null> {
  const resourceUrl = req.nextUrl.href;
  const paymentHeader = req.headers.get("x-payment");

  // No payment yet -> 402 with requirements
  if (!paymentHeader) {
    return paymentChallenge(resourceUrl);
  }

  // Decode client payload
  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Invalid X-PAYMENT header." }, { status: 400 });
  }

  const body = {
    x402Version: 2,
    paymentPayload,
    paymentRequirements: requirements(),
  };

  // Verify — the Broker validates the signature; data.isValid true/false, reason in
  // data.invalidReason / data.invalidMessage (surfaced so the buyer sees why).
  const verify = await okxVerify(body);
  // Log the full Broker verify response so a failed real-payment attempt leaves the
  // exact invalidReason in the server logs (the buyer's 402 body only carries a summary).
  console.log("[x402:verify]", JSON.stringify({ code: verify?.code, data: verify?.data }));
  if (verify?.code !== "0" || !verify?.data?.isValid) {
    return NextResponse.json(
      {
        error: "Payment verification failed.",
        reason: verify?.data?.invalidReason ?? verify?.msg ?? null,
        message: verify?.data?.invalidMessage ?? null,
      },
      { status: 402 }
    );
  }

  // Settle — syncSettle:true so we wait for on-chain confirmation before delivering the
  // paid content. Per spec, a successful settle returns success:true with status
  // success | pending | timeout; only status:"failed" (or success:false) is a real
  // failure. A timeout means the tx was broadcast — treat it as paid and let the buyer
  // poll /settle/status — rather than re-charging.
  const settle = await okxSettle({ ...body, syncSettle: true });
  console.log("[x402:settle]", JSON.stringify({ code: settle?.code, data: settle?.data }));
  const s = settle?.data;
  const settled = settle?.code === "0" && s?.success === true && s?.status !== "failed";
  if (!settled) {
    return NextResponse.json(
      {
        error: "Payment settlement failed.",
        reason: s?.errorReason ?? settle?.msg ?? null,
        message: s?.errorMessage ?? null,
        status: s?.status ?? null,
      },
      { status: 402 }
    );
  }

  return null; // paid + settled — proceed to deliver the review
}