const dns = require("node:dns").promises;
const net = require("node:net");

function isPrivateAddress(ip) {
  if (net.isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  if (net.isIP(ip) === 6) {
    const s = ip.toLowerCase();
    return s === "::" || s === "::1" || s.startsWith("fc") ||
      s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") ||
      s.startsWith("fea") || s.startsWith("feb") || s.startsWith("::ffff:127.") ||
      s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
  }
  return true;
}

async function validateTarget(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error("URL tidak valid."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Hanya URL HTTP/HTTPS yang didukung.");
  if (u.username || u.password) throw new Error("URL dengan kredensial tidak diizinkan.");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Alamat lokal tidak diizinkan.");
  }
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("Alamat IP privat tidak diizinkan.");
  } else {
    let records;
    try { records = await Promise.race([dns.lookup(host, { all: true, verbatim: true }), new Promise((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), 2500))]); }
    catch { throw new Error("Domain tidak dapat ditemukan."); }
    if (!records.length || records.some(r => isPrivateAddress(r.address))) {
      throw new Error("Host mengarah ke alamat jaringan privat.");
    }
  }
  return u;
}


function decodeEntities(s) {
  return String(s || "").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function parseFirstForm(html, base) {
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  for (const m of forms) {
    const attrs=m[1], body=m[2];
    const action=(attrs.match(/\baction\s*=\s*["']([^"']*)["']/i)||[])[1]||base;
    const method=((attrs.match(/\bmethod\s*=\s*["']([^"']*)["']/i)||[])[1]||"get").toLowerCase();
    const fields=new URLSearchParams();
    for(const el of body.matchAll(/<input\b([^>]*)>/gi)){
      const a=el[1], name=(a.match(/\bname\s*=\s*["']([^"']+)["']/i)||[])[1];
      if(!name) continue;
      const type=((a.match(/\btype\s*=\s*["']([^"']+)["']/i)||[])[1]||"text").toLowerCase();
      if(["submit","button","file","image"].includes(type)) continue;
      const value=(a.match(/\bvalue\s*=\s*["']([^"']*)["']/i)||[])[1]||"";
      fields.append(name,decodeEntities(value));
    }
    if([...fields.keys()].length) return {action:new URL(decodeEntities(action),base).toString(),method,fields};
  }
  return null;
}
async function postForm(form, referer) {
  if(form.method==="get") {
    const u=await validateTarget(form.action);
    for(const [k,v] of form.fields) u.searchParams.append(k,v);
    const r=await fetch(u,{redirect:"manual",headers:{"user-agent":"Mozilla/5.0 Chrome/124 Safari/537.36","referer"},signal:AbortSignal.timeout(3500)});
    const loc=r.headers.get("location");
    return loc?new URL(loc,u).toString():null;
  }
  const target=await validateTarget(form.action);
  const r=await fetch(target,{method:"POST",redirect:"manual",headers:{"user-agent":"Mozilla/5.0 Chrome/124 Safari/537.36","accept":"application/json, text/plain, */*","referer","origin":new URL(referer).origin,"content-type":"application/x-www-form-urlencoded; charset=UTF-8","x-requested-with":"XMLHttpRequest"},body:form.fields.toString(),signal:AbortSignal.timeout(10000)});
  const raw=(await r.text()).slice(0,120000);
  try {
    const d=JSON.parse(raw), v=d.url||d.destination||d.link||d.data?.url||d.redirect;
    if(typeof v==="string" && /^https?:\/\//i.test(v)) return v;
  } catch {}
  const loc=r.headers.get("location");
  if(loc) return new URL(loc,target).toString();
  const m=raw.match(/https?:\/\/[^"'\s<>]+/i);
  return m?decodeEntities(m[0]):null;
}

async function resolve(url) {
  let current = url;
  for (let i = 0; i < 6; i++) {
    const u = await validateTarget(current);
    const response = await fetch(u, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(4500),
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Provider mengirim redirect tanpa alamat tujuan.");
      current = new URL(location, u).toString();
      continue;
    }
    const type = response.headers.get("content-type") || "";
    if (type.includes("text/html")) {
      const html = (await response.text()).slice(0, 250000);
      const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"' >]+)/i);
      const script = html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i);
      const target = meta?.[1] || script?.[1];
      if (target) {
        current = new URL(decodeEntities(target), u).toString();
        continue;
      }
      const form=parseFirstForm(html,u);
      if(form) {
        const submitted=await postForm(form,u.toString());
        if(submitted) { current=new URL(submitted,u).toString(); continue; }
      }
      const token=html.match(/(?:url|target|redirect|destination)=([^&"'\s<>]+)/i);
      if(token) {
        try {
          const value=decodeURIComponent(token[1]);
          if(/^https?:\/\//i.test(value)) return value;
        } catch {}
      }
    }
    if (response.ok && current !== url) return current;
    throw new Error("Provider tidak memberikan redirect otomatis. Mungkin membutuhkan captcha, timer, atau proses khusus yang belum didukung.");
  }
  throw new Error("Terlalu banyak redirect.");
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ success: true, service: "XYBYPASS Node API", status: "online", method: "POST" });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, error: "Method tidak didukung." });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const input = body && body.url;
    if (typeof input !== "string" || input.length > 2048) {
      return res.status(400).json({ success: false, error: "URL tidak valid atau terlalu panjang." });
    }
    const destination = await resolve(input);
    return res.status(200).json({ success: true, destination });
  } catch (error) {
    return res.status(422).json({ success: false, error: error?.message || "Bypass gagal." });
  }
};
