const dns = require("node:dns").promises;
const net = require("node:net");

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function privateIp(ip) {
  if (net.isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || p[0] >= 224;
  }
  if (net.isIP(ip) === 6) {
    const s = ip.toLowerCase();
    return s === "::" || s === "::1" || s.startsWith("fc") ||
      s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") ||
      s.startsWith("fea") || s.startsWith("feb");
  }
  return true;
}

async function checkUrl(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error("Format URL tidak valid."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Hanya URL HTTP/HTTPS yang didukung.");
  if (u.username || u.password) throw new Error("URL dengan username/password tidak diizinkan.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Alamat lokal tidak diizinkan.");
  }
  if (net.isIP(host)) {
    if (privateIp(host)) throw new Error("Alamat IP privat tidak diizinkan.");
  } else {
    const records = await dns.lookup(host, { all: true });
    if (!records.length || records.some(x => privateIp(x.address))) {
      throw new Error("Domain mengarah ke alamat jaringan privat.");
    }
  }
  return u;
}

async function resolveLink(value) {
  let current = value;
  for (let i = 0; i < 8; i++) {
    const u = await checkUrl(current);
    const r = await fetch(u, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,*/*"
      }
    });
    if ([301,302,303,307,308].includes(r.status)) {
      const loc = r.headers.get("location");
      if (!loc) throw new Error("Redirect tidak memiliki alamat tujuan.");
      current = new URL(loc, u).toString();
      continue;
    }
    const type = r.headers.get("content-type") || "";
    if (type.includes("text/html")) {
      const html = (await r.text()).slice(0, 180000);
      const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"' >]+)/i);
      const js = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i);
      const candidate = meta?.[1] || js?.[1];
      if (candidate) {
        current = new URL(candidate.replace(/&amp;/g, "&"), u).toString();
        continue;
      }
    }
    throw new Error("Provider tidak memberikan redirect langsung. Provider ini mungkin membutuhkan captcha, timer, atau token khusus.");
  }
  throw new Error("Redirect terlalu banyak.");
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 200, { success: true });
    if (req.method === "GET") return send(res, 200, {
      success: true, service: "XYBYPASS API", status: "online", runtime: "nodejs"
    });
    if (req.method !== "POST") return send(res, 405, { success: false, error: "Gunakan GET atau POST." });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return send(res, 400, { success: false, error: "Body harus berupa JSON valid." }); }
    }
    if (!body && req.headers["content-type"]?.includes("application/json")) {
      return send(res, 400, { success: false, error: "Body JSON kosong." });
    }
    const input = body && body.url;
    if (typeof input !== "string" || input.length > 2048) {
      return send(res, 400, { success: false, error: "Masukkan URL yang valid (maksimal 2048 karakter)." });
    }
    const destination = await resolveLink(input);
    return send(res, 200, { success: true, destination });
  } catch (err) {
    return send(res, 422, { success: false, error: err && err.message ? err.message : "Proses bypass gagal." });
  }
};
