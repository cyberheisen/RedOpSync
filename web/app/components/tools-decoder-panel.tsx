"use client";

import { useState, useCallback, useMemo } from "react";
import bs58 from "bs58";

// RFC 4648 Base32 alphabet
const B32_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(bytes: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += B32_ALPHA[(value >>> bits) & 31];
    }
  }
  if (bits > 0) result += B32_ALPHA[(value << (5 - bits)) & 31];
  return result;
}
function base32Decode(str: string): Uint8Array {
  const clean = str.replace(/\s/g, "").toUpperCase();
  const bits: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = B32_ALPHA.indexOf(clean[i]!);
    if (idx < 0) continue;
    for (let b = 4; b >= 0; b--) bits.push((idx >> b) & 1);
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    out.push(byte);
  }
  return new Uint8Array(out);
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function base64EncodeUtf8(s: string): string {
  const bytes = utf8Encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(bytes).toString("base64");
}
function base64DecodeUtf8(b64: string): string {
  try {
    const binary = typeof atob !== "undefined" ? atob(b64.replace(/-/g, "+").replace(/_/g, "/")) : Buffer.from(b64, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return utf8Decode(bytes);
  } catch {
    return "";
  }
}

type BaseVariant = "base32" | "base58" | "base64";

type ToolsDecoderPanelProps = {
  variant: "base" | "xor" | "jwt";
};

export function ToolsDecoderPanel({ variant }: ToolsDecoderPanelProps) {
  if (variant === "base") return <BaseDecoder />;
  if (variant === "xor") return <XorDecoder />;
  return <JwtDecoder />;
}

function BaseDecoder() {
  const [base, setBase] = useState<BaseVariant>("base64");
  const [decodeInput, setDecodeInput] = useState("");
  const [encodeInput, setEncodeInput] = useState("");

  const decoded = useCallback((): string => {
    const s = decodeInput.trim();
    if (!s) return "";
    try {
      if (base === "base64") return base64DecodeUtf8(s);
      if (base === "base32") return utf8Decode(base32Decode(s));
      if (base === "base58") return utf8Decode(bs58.decode(s));
    } catch {
      return "(decode error)";
    }
    return "";
  }, [decodeInput, base]);

  const encoded = useCallback((): string => {
    const s = encodeInput.trim();
    if (!s) return "";
    try {
      const bytes = utf8Encode(s);
      if (base === "base64") return base64EncodeUtf8(s);
      if (base === "base32") return base32Encode(bytes);
      if (base === "base58") return bs58.encode(bytes);
    } catch {
      return "(encode error)";
    }
    return "";
  }, [encodeInput, base]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Base encoder / decoder</h2>
      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8, fontSize: 14 }}>Encoding</label>
        <select className="theme-select" value={base} onChange={(e) => setBase(e.target.value as BaseVariant)} style={{ padding: "6px 10px" }}>
          <option value="base32">Base32</option>
          <option value="base58">Base58</option>
          <option value="base64">Base64</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Decode (encoded → text)</div>
          <textarea
            className="theme-input"
            value={decodeInput}
            onChange={(e) => setDecodeInput(e.target.value)}
            placeholder="Paste encoded string…"
            rows={4}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{decoded() || "—"}</div>
        </div>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Encode (text → encoded)</div>
          <textarea
            className="theme-input"
            value={encodeInput}
            onChange={(e) => setEncodeInput(e.target.value)}
            placeholder="Type or paste text…"
            rows={4}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{encoded() || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function hexToBytes(hex: string): Uint8Array {
  const s = hex.replace(/\s/g, "").replace(/^0x/i, "");
  if (s.length % 2) return new Uint8Array(0);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function XorDecoder() {
  const [key, setKey] = useState("");
  const [keyEncoding, setKeyEncoding] = useState<"utf8" | "hex">("utf8");
  const [singleByte, setSingleByte] = useState(false);
  const [decodeInput, setDecodeInput] = useState("");
  const [encodeInput, setEncodeInput] = useState("");
  const [outputFormat, setOutputFormat] = useState<"hex" | "base64">("hex");

  const keyBytes = useCallback((): Uint8Array => {
    if (keyEncoding === "hex") return hexToBytes(key);
    return utf8Encode(key);
  }, [key, keyEncoding]);

  const xor = useCallback(
    (inputBytes: Uint8Array): Uint8Array => {
      const k = keyBytes();
      if (k.length === 0) return inputBytes;
      const out = new Uint8Array(inputBytes.length);
      for (let i = 0; i < inputBytes.length; i++) {
        const keyByte = singleByte ? k[0]! : k[i % k.length]!;
        out[i] = inputBytes[i]! ^ keyByte;
      }
      return out;
    },
    [keyBytes, singleByte]
  );

  const decoded = useCallback((): string => {
    const s = decodeInput.trim();
    if (!s || keyBytes().length === 0) return "";
    try {
      let bytes: Uint8Array;
      if (/^[0-9a-fA-F\s]+$/.test(s.replace(/\s/g, ""))) bytes = hexToBytes(s);
      else {
        try {
          bytes = new Uint8Array(Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/"))).map((c) => c.charCodeAt(0)));
        } catch {
          bytes = utf8Encode(s);
        }
      }
      return utf8Decode(xor(bytes));
    } catch {
      return "(decode error)";
    }
  }, [decodeInput, keyBytes, xor]);

  const encoded = useCallback((): string => {
    const s = encodeInput.trim();
    if (!s || keyBytes().length === 0) return "";
    try {
      const bytes = xor(utf8Encode(s));
      if (outputFormat === "hex") return bytesToHex(bytes);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      return btoa(binary);
    } catch {
      return "(encode error)";
    }
  }, [encodeInput, keyBytes, xor, outputFormat]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>XOR encoder / decoder</h2>
      <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <div>
          <label style={{ marginRight: 6, fontSize: 13 }}>Key</label>
          <input
            type="text"
            className="theme-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Key"
            style={{ width: 200, padding: "6px 10px" }}
          />
        </div>
        <div>
          <label style={{ marginRight: 6, fontSize: 13 }}>Key encoding</label>
          <select className="theme-select" value={keyEncoding} onChange={(e) => setKeyEncoding(e.target.value as "utf8" | "hex")} style={{ padding: "6px 10px" }}>
            <option value="utf8">UTF-8</option>
            <option value="hex">Hex</option>
          </select>
        </div>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={singleByte} onChange={(e) => setSingleByte(e.target.checked)} style={{ marginRight: 6 }} />
          Single-byte XOR
        </label>
        <div>
          <label style={{ marginRight: 6, fontSize: 13 }}>Output format</label>
          <select className="theme-select" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as "hex" | "base64")} style={{ padding: "6px 10px" }}>
            <option value="hex">Hex</option>
            <option value="base64">Base64</option>
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Decode (hex/base64 + key → text)</div>
          <textarea
            className="theme-input"
            value={decodeInput}
            onChange={(e) => setDecodeInput(e.target.value)}
            placeholder="Paste hex or base64…"
            rows={4}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{decoded() || "—"}</div>
        </div>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Encode (text + key → hex/base64)</div>
          <textarea
            className="theme-input"
            value={encodeInput}
            onChange={(e) => setEncodeInput(e.target.value)}
            placeholder="Type or paste text…"
            rows={4}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{encoded() || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function JwtDecoder() {
  const [jwtInput, setJwtInput] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyAlg, setVerifyAlg] = useState<"HS256" | "HS384" | "HS512">("HS256");
  const [encodePayload, setEncodePayload] = useState('{"sub":"user","iat":1516239022}');
  const [encodeSecret, setEncodeSecret] = useState("");
  const [encodeAlg, setEncodeAlg] = useState<"HS256" | "HS384" | "HS512">("HS256");
  const [encodedJwt, setEncodedJwt] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [encodeError, setEncodeError] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);

  const { decoded, decodeError } = useMemo(() => {
    const s = jwtInput.trim();
    if (!s) return { decoded: null, decodeError: "" };
    const parts = s.split(".");
    if (parts.length !== 3) {
      return { decoded: null, decodeError: "Invalid JWT format (expected 3 parts)" };
    }
    try {
      const b64url = (p: string) => p.replace(/-/g, "+").replace(/_/g, "/");
      const json = (p: string) => {
        const bin = atob(b64url(p));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return JSON.parse(utf8Decode(bytes));
      };
      const header = json(parts[0]!);
      const payload = json(parts[1]!);
      return { decoded: { header, payload, signature: parts[2], verified: null as boolean | null }, decodeError: "" };
    } catch (e) {
      return { decoded: null, decodeError: String(e) };
    }
  }, [jwtInput]);

  const doVerify = useCallback(async () => {
    const s = jwtInput.trim();
    if (!s || !secret) return;
    setVerifyError("");
    setVerified(null);
    try {
      const { jwtVerify } = await import("jose");
      const key = utf8Encode(secret);
      await jwtVerify(s, key);
      setVerified(true);
    } catch (e) {
      setVerifyError("Verify failed: " + (e as Error).message);
      setVerified(false);
    }
  }, [jwtInput, secret]);

  const doEncode = useCallback(async () => {
    setEncodeError("");
    setEncodedJwt("");
    const payloadStr = encodePayload.trim();
    if (!payloadStr || !encodeSecret) {
      setEncodeError("Payload and secret are required.");
      return;
    }
    try {
      let payload: object;
      try {
        payload = JSON.parse(payloadStr);
      } catch {
        setEncodeError("Payload must be valid JSON.");
        return;
      }
      const { SignJWT } = await import("jose");
      const key = utf8Encode(encodeSecret);
      const jwt = await new SignJWT(payload as Record<string, unknown>).setProtectedHeader({ alg: encodeAlg, typ: "JWT" }).sign(key);
      setEncodedJwt(jwt);
    } catch (e) {
      setEncodeError((e as Error).message);
    }
  }, [encodePayload, encodeSecret, encodeAlg]);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>JSON Web Token</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Decode JWT</div>
          <textarea
            className="theme-input"
            value={jwtInput}
            onChange={(e) => setJwtInput(e.target.value)}
            placeholder="Paste JWT…"
            rows={3}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }}
          />
          {(decodeError || verifyError) && <div style={{ marginTop: 8, fontSize: 13, color: "var(--error, #ef4444)" }}>{decodeError || verifyError}</div>}
          {decoded && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Header</strong>
                <pre style={{ margin: "4px 0 0", padding: 8, background: "var(--accent-bg)", borderRadius: 4, overflow: "auto", fontSize: 12 }}>{JSON.stringify(decoded.header, null, 2)}</pre>
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Payload</strong>
                <pre style={{ margin: "4px 0 0", padding: 8, background: "var(--accent-bg)", borderRadius: 4, overflow: "auto", fontSize: 12 }}>{JSON.stringify(decoded.payload, null, 2)}</pre>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ marginRight: 8, fontSize: 13 }}>Verify with secret</label>
                <input type="text" className="theme-input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret" style={{ width: 180, padding: "6px 10px", marginRight: 8 }} />
                <select className="theme-select" value={verifyAlg} onChange={(e) => setVerifyAlg(e.target.value as "HS256" | "HS384" | "HS512")} style={{ padding: "6px 10px", marginRight: 8 }}>
                  <option value="HS256">HS256</option>
                  <option value="HS384">HS384</option>
                  <option value="HS512">HS512</option>
                </select>
                <button type="button" className="theme-btn theme-btn-ghost" style={{ padding: "6px 12px" }} onClick={doVerify}>
                  Verify
                </button>
                {verified === true && <span style={{ marginLeft: 8, color: "var(--success, #22c55e)" }}>Valid</span>}
                {verified === false && <span style={{ marginLeft: 8, color: "var(--error, #ef4444)" }}>Invalid</span>}
              </div>
            </div>
          )}
        </div>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Encode JWT</div>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Payload (JSON)</label>
          <textarea
            className="theme-input"
            value={encodePayload}
            onChange={(e) => setEncodePayload(e.target.value)}
            placeholder='{"sub":"user",…}'
            rows={4}
            style={{ width: "100%", resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
          />
          <div style={{ marginTop: 8 }}>
            <label style={{ marginRight: 8, fontSize: 13 }}>Secret</label>
            <input type="text" className="theme-input" value={encodeSecret} onChange={(e) => setEncodeSecret(e.target.value)} placeholder="Secret" style={{ width: 200, padding: "6px 10px", marginRight: 8 }} />
            <select className="theme-select" value={encodeAlg} onChange={(e) => setEncodeAlg(e.target.value as "HS256" | "HS384" | "HS512")} style={{ padding: "6px 10px" }}>
              <option value="HS256">HS256</option>
              <option value="HS384">HS384</option>
              <option value="HS512">HS512</option>
            </select>
          </div>
          <button type="button" className="theme-btn theme-btn-primary" style={{ marginTop: 12, padding: "8px 16px" }} onClick={doEncode}>
            Sign JWT
          </button>
          {encodeError && <div style={{ marginTop: 8, fontSize: 13, color: "var(--error, #ef4444)" }}>{encodeError}</div>}
          {encodedJwt && <div style={{ marginTop: 12, fontSize: 12, wordBreak: "break-all", color: "var(--text-muted)" }}>{encodedJwt}</div>}
        </div>
      </div>
    </div>
  );
}
