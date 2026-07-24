import { NextRequest, NextResponse } from "next/server";
import { okxVerify, okxSettle, type FacilitatorPayload, type FacilitatorRequirements } from "./okx";

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

  // Decode the buyer's signed PaymentPayload (base64 in the X-PAYMENT header).
  let paymentPayload: FacilitatorPayload;
  try {
    paymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8")
    ) as FacilitatorPayload;
  } catch {
    return NextResponse.json({ error: "Invalid X-PAYMENT header." }, { status: 400 });
  }

  const paymentRequirements = requirements() as FacilitatorRequirements;

  // Verify — the SDK client posts to the Broker and returns the unwrapped result
  // (isValid / invalidReason / invalidMessage). Reason is surfaced so the buyer sees why.
  const verify = await okxVerify(paymentPayload, paymentRequirements);
  console.log("[x402:verify]", JSON.stringify(verify));
  if (!verify.isValid) {
    return NextResponse.json(
      {
        error: "Payment verification failed.",
        reason: verify.invalidReason ?? null,
        message: verify.invalidMessage ?? null,
      },
      { status: 402 }
    );
  }

  // Settle — the client is configured syncSettle:true, so it waits for on-chain
  // confirmation. success:true with status success | pending | timeout all mean the
  // payment went through (a timeout means the tx was broadcast); only success:false is a
  // real failure, in which case we surface errorReason rather than silently re-charging.
  const settle = await okxSettle(paymentPayload, paymentRequirements);
  console.log("[x402:settle]", JSON.stringify(settle));
  if (!settle.success) {
    return NextResponse.json(
      {
        error: "Payment settlement failed.",
        reason: settle.errorReason ?? null,
        message: settle.errorMessage ?? null,
        status: settle.status ?? null,
      },
      { status: 402 }
    );
  }

  return null; // paid + settled — proceed to deliver the review
}