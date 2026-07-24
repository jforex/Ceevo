import { NextRequest, NextResponse } from "next/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  type HTTPAdapter,
} from "@okxweb3/x402-core/server";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";

// The SDK types Network as a `${string}:${string}` CAIP-2 literal; our env value is a
// plain string, so narrow it once here (validated at runtime by the SDK).
type Network = `${string}:${string}`;

// Full x402 handling via the official SDK. Previously we hand-built the 402 challenge
// AND the /verify + /settle calls. The buyer's client is the SDK, which derives the
// exact accepts entry (asset, atomic amount, EIP-712 domain) from `price` + `network`
// via the facilitator's /supported endpoint. Our hand-built challenge used different
// derived values, so the buyer signed over one shape and our paymentRequirements was
// another → verify mismatch → endless 402. Driving the challenge AND verification from
// the SAME SDK guarantees they match.

const NETWORK = (process.env.PAYMENT_NETWORK ?? "eip155:196") as Network;
const PAY_TO = process.env.PAYMENT_RECEIVER_ADDRESS ?? "";
// USD price string (e.g. "$0.01"); the SDK converts it to the network's stablecoin.
const PRICE = process.env.PAYMENT_PRICE ?? "$0.01";
const ROUTE = "POST /api/review/full";

const facilitator = new OKXFacilitatorClient({
  apiKey: process.env.OKX_API_KEY ?? "",
  secretKey: process.env.OKX_API_SECRET ?? "",
  passphrase: process.env.OKX_API_PASSPHRASE ?? "",
  baseUrl: process.env.OKX_PAYMENT_BASE_URL || undefined,
  syncSettle: true, // wait for on-chain confirmation before delivering the paid content
});

// Built once per warm instance; initialize() fetches facilitator support (the /supported
// call) so the challenge's accepts entry matches what the Broker expects.
let httpServerPromise: Promise<x402HTTPResourceServer> | null = null;
function getHttpServer(): Promise<x402HTTPResourceServer> {
  if (!httpServerPromise) {
    httpServerPromise = (async () => {
      const resourceServer = new x402ResourceServer(facilitator);
      resourceServer.register(NETWORK, new ExactEvmScheme());
      const http = new x402HTTPResourceServer(resourceServer, {
        [ROUTE]: {
          accepts: [{ scheme: "exact", network: NETWORK, payTo: PAY_TO, price: PRICE }],
          description: "CV Review and Rewrite",
          mimeType: "application/json",
        },
      });
      await http.initialize();
      return http;
    })().catch((e) => {
      httpServerPromise = null; // allow retry on next request if init failed
      throw e;
    });
  }
  return httpServerPromise;
}

// Minimal HTTPAdapter over a Next.js request. The SDK only needs headers, method, path,
// and url to process the payment (the CV body is read by the route itself afterward).
function adapter(req: NextRequest): HTTPAdapter {
  return {
    getHeader: (name: string) => req.headers.get(name) ?? undefined,
    getMethod: () => req.method,
    getPath: () => req.nextUrl.pathname,
    getUrl: () => req.nextUrl.href,
    getAcceptHeader: () => req.headers.get("accept") ?? "",
    getUserAgent: () => req.headers.get("user-agent") ?? "",
  };
}

function toResponse(instr: { status: number; headers: Record<string, string>; body?: unknown }): NextResponse {
  const body = typeof instr.body === "string" ? instr.body : JSON.stringify(instr.body ?? {});
  return new NextResponse(body, { status: instr.status, headers: instr.headers });
}

/**
 * The bare 402 challenge for a GET verification probe (agent x402-check sends GET).
 * Built by the SDK by running processHTTPRequest with no payment header.
 */
export async function paymentChallenge(req: NextRequest): Promise<NextResponse> {
  const http = await getHttpServer();
  const noPayment = { ...adapter(req), getHeader: (n: string) => (n.toLowerCase() === "x-payment" ? undefined : req.headers.get(n) ?? undefined) };
  const result = await http.processHTTPRequest({
    adapter: noPayment,
    path: req.nextUrl.pathname,
    method: "POST", // match the protected route pattern so the SDK emits its 402
    routePattern: ROUTE,
  });
  if (result.type === "payment-error") return toResponse(result.response);
  // Should not happen (route always requires payment); fall back to a generic 402.
  return NextResponse.json({ x402Version: 2 }, { status: 402 });
}

/**
 * Runs the x402 gate. Returns:
 *  - a NextResponse to return immediately (402 challenge, or a payment error), or
 *  - a `settle` continuation: call it AFTER producing the paid content to settle on-chain;
 *    it returns null on success (deliver) or a NextResponse on settlement failure.
 */
export async function requirePayment(
  req: NextRequest
): Promise<{ response: NextResponse } | { settle: () => Promise<NextResponse | null> }> {
  const http = await getHttpServer();
  const ctx = { adapter: adapter(req), path: req.nextUrl.pathname, method: req.method, routePattern: ROUTE };

  const result = await http.processHTTPRequest(ctx);

  if (result.type === "payment-error") {
    return { response: toResponse(result.response) };
  }
  if (result.type === "no-payment-required") {
    // Not expected for this route, but treat as free-pass rather than blocking.
    return { settle: async () => null };
  }

  // payment-verified — signature is valid. Settle after the content is produced.
  const { paymentPayload, paymentRequirements, declaredExtensions } = result;
  return {
    settle: async () => {
      const settle = await http.processSettlement(
        paymentPayload,
        paymentRequirements,
        declaredExtensions
      );
      console.log("[x402:settle]", JSON.stringify({ success: settle.success, status: settle.status }));
      if (!settle.success) {
        return toResponse(settle.response);
      }
      return null; // settled — deliver
    },
  };
}
