import { NextRequest, NextResponse } from "next/server";
import { okxVerify, okxSettle } from "./okx";

const NETWORK = process.env.PAYMENT_NETWORK ?? "eip155:196";
const ASSET = process.env.PAYMENT_ASSET ?? "";
const PAY_TO = process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
const AMOUNT = process.env.PAYMENT_AMOUNT ?? "10000";

// Payment requirements the client must satisfy.
function requirements(resourceUrl: string) {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: "USD₮0", version: "1" },
    resource: resourceUrl,
  };
}

// Returns null if paid+settled; otherwise a 402 NextResponse to return immediately.
export async function requirePayment(req: NextRequest): Promise<NextResponse | null> {
  const resourceUrl = req.nextUrl.href;
  const paymentHeader = req.headers.get("x-payment");

  // No payment yet -> 402 with requirements
  if (!paymentHeader) {
    return NextResponse.json(
      { x402Version: 2, accepts: [requirements(resourceUrl)] },
      { status: 402 }
    );
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
    paymentRequirements: requirements(resourceUrl),
  };

  // Verify
  const verify = await okxVerify(body);
  if (verify?.code !== "0" || !verify?.data?.isValid) {
    return NextResponse.json(
      { error: "Payment verification failed.", detail: verify?.data ?? verify },
      { status: 402 }
    );
  }

  // Settle
  const settle = await okxSettle(body);
  if (settle?.code !== "0" || !settle?.data?.success) {
    return NextResponse.json(
      { error: "Payment settlement failed.", detail: settle?.data ?? settle },
      { status: 402 }
    );
  }

  return null; // paid — proceed
}