import crypto from "crypto";

const BASE = process.env.OKX_PAYMENT_BASE_URL ?? "https://web3.okx.com";
const KEY = process.env.OKX_API_KEY ?? "";
const SECRET = process.env.OKX_API_SECRET ?? "";
const PASSPHRASE = process.env.OKX_API_PASSPHRASE ?? "";

function sign(timestamp: string, method: string, path: string, body: string) {
  const prehash = timestamp + method + path + body;
  return crypto.createHmac("sha256", SECRET).update(prehash).digest("base64");
}

async function okxRequest(method: "GET" | "POST", path: string, body?: unknown) {
  const timestamp = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = sign(timestamp, method, path, bodyStr);

  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": KEY,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-PASSPHRASE": PASSPHRASE,
      "OK-ACCESS-TIMESTAMP": timestamp,
    },
    body: method === "POST" ? bodyStr : undefined,
  });

  return res.json();
}

export function okxVerify(payload: unknown) {
  return okxRequest("POST", "/api/v6/pay/x402/verify", payload);
}

export function okxSettle(payload: unknown) {
  return okxRequest("POST", "/api/v6/pay/x402/settle", payload);
}

export function okxSupported() {
  return okxRequest("GET", "/api/v6/pay/x402/supported");
}