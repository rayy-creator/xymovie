const http = require("node:http");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 8192;
const ALLOWED = ["instagram.com", "tiktok.com", "youtube.com", "youtu.be"];

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store"
  });
  res.end(body);
}
function validUrl(value) {
  let u;
  try { u = new URL(value); } catch { return false; }
  return ["http:", "https:"].includes(u.protocol) &&
    ALLOWED.some(d => u.hostname === d || u.hostname.endsWith("." + d));
}
const CLUTCH_BASE = "https://api.clutch.web.id";
const CLUTCH_KEY = process.env.CLUTCH_API_KEY || "alipaiapikeybaru";

async function clutchGet(path, url, extra = "") {
  const endpoint = `${CLUTCH_BASE}/download/${path}?apikey=${encodeURIComponent(CLUTCH_KEY)}&url=${encodeURIComponent(url)}${extra}`;
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(45000),
    headers: { "user-agent": "Mozilla/5.0", "accept": "application/json" }
  });
  const raw = await response.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\\s+/g, " ").slice(0, 180);
    throw new Error(`Clutch /download/${path} membalas non-JSON (HTTP ${response.status}, ${response.headers.get("content-type") || "unknown"}): ${preview}`);
  }
  if (!response.ok) throw new Error(json.error || `Clutch API HTTP ${response.status}`);
  return json;
}

function normalizeMedia(items, fallbackTitle = "Media ditemukan") {
  return (items || []).filter(x => x && x.url).map((x, i) => ({
    id: String(i + 1),
    title: x.title || fallbackTitle,
    caption: x.caption || "",
    thumbnail: x.thumbnail || null,
    type: x.type === "photo" || x.type === "image" ? "photo" : "video",
    formats: [{ url: x.url, ext: x.ext || (x.type === "photo" || x.type === "image" ? "jpg" : "mp4"), height: x.height || null }]
  }));
}

async function downloadWithApis(platform, url) {
  // Sumber yang memang tersedia di ZIP:
  // TikTok memakai TikWM; Instagram/YouTube memakai yt-dlp sebagai extractor.
  if (platform === "TikTok") {
    const endpoint = new URL("https://www.tikwm.com/api/");
    endpoint.search = new URLSearchParams({
      url, count: "12", cursor: "0", web: "1", hd: "1"
    }).toString();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "accept": "application/json"
      },
      body: "",
      signal: AbortSignal.timeout(30000)
    });
    const raw = await response.text();
    let json;
    try { json = JSON.parse(raw); }
    catch {
      throw new Error("TikWM mengembalikan halaman non-JSON (HTTP " + response.status + ").");
    }
    const d = json.data;
    if (!response.ok || !d) throw new Error(json.msg || "TikWM tidak menemukan media.");
    const items = [];
    if (Array.isArray(d.images) && d.images.length) {
      for (const image of d.images) items.push({
        type: "photo", url: image, title: d.title, thumbnail: d.cover
      });
    } else {
      const video = d.hdplay || d.play;
      if (video) items.push({
        type: "video",
        url: video.startsWith("http") ? video : "https://www.tikwm.com" + video,
        title: d.title, thumbnail: d.cover
      });
    }
    if (!items.length) throw new Error("TikWM tidak mengembalikan file media.");
    const media = normalizeMedia(items, d.title || "TikTok");
    return {
      title: d.title || "TikTok",
      caption: d.title || "",
      thumbnail: d.cover || null,
      media
    };
  }

  // ZIP tidak menyertakan endpoint downloader Instagram/YouTube mandiri.
  // Gunakan yt-dlp yang juga menjadi fallback resmi pada backend ini.
  throw new Error(platform + " dialihkan ke extractor yt-dlp.");
}

function runYtDlp(url) {
  return new Promise((resolve, reject) => {
    const args = [
      "--dump-json", "--no-warnings", "--no-progress",
      "--skip-download", "--ignore-errors",
      "--socket-timeout", "25", "--retries", "2",
      "--user-agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
      url
    ];
    const child = spawn("yt-dlp", args);
    let out = "", err = "";
    child.stdout.on("data", b => { out += b.toString(); if (out.length > 12_000_000) child.kill(); });
    child.stderr.on("data", b => { err += b.toString(); if (err.length > 12000) err = err.slice(-12000); });
    child.on("error", e => reject(new Error("yt-dlp tidak ditemukan. Jalankan: pip install -U yt-dlp")));
    child.on("close", code => {
      const items = out.split(/\r?\n/).filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
      if (!items.length) {
        const msg = /login|cookie|private|sign in|rate.?limit|403|429/i.test(err)
          ? "Instagram membatasi akses konten ini. Pastikan postingan publik; beberapa konten memang memerlukan cookies."
          : "yt-dlp gagal mengambil media. Perbarui yt-dlp lalu coba lagi.";
        return reject(new Error(msg + (code ? "" : "")));
      }
      resolve(items);
    });
  });
}
function cleanFormats(info) {
  const source = [
    ...(Array.isArray(info.formats) ? info.formats : []),
    ...(Array.isArray(info.requested_formats) ? info.requested_formats : []),
    ...(Array.isArray(info.requested_downloads) ? info.requested_downloads : [])
  ];
  const isImage = f => /^(jpg|jpeg|png|webp|avif)$/i.test(f.ext || "");
  const candidates = source.filter(f =>
    f.url && !f.has_drm && (f.vcodec !== "none" || isImage(f))
  );
  if (!candidates.length && info.url &&
      (info.vcodec !== "none" || /^(jpg|jpeg|png|webp|avif)$/i.test(info.ext || ""))) {
    candidates.push({
      url: info.url, ext: info.ext || "mp4",
      height: info.height || null, vcodec: info.vcodec || "unknown"
    });
  }
  const unique = [...new Map(candidates.map(f => [f.url, f])).values()];
  return unique
    .sort((a,b) => (b.height || 0) - (a.height || 0))
    .slice(0, 20)
    .map(f => ({
      url: f.url, ext: f.ext || info.ext || "mp4",
      height: f.height || info.height || null,
      format: f.format || f.format_id || ""
    }));
}
http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url.startsWith("/file?")) {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const mediaUrl = requestUrl.searchParams.get("url");
      let target;
      try { target = new URL(mediaUrl); } catch { return send(res, 400, { success: false, message: "URL media tidak valid." }); }
      const allowedMediaHost = /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com|tiktokcdn\.com|tiktokv\.com|byteoversea\.com|ibytedtos\.com|muscdn\.com|tikwm\.com|googlevideo\.com|youtube\.com|ytimg\.com|akamaized\.net)$/i.test(target.hostname);
      if (target.protocol !== "https:" || !allowedMediaHost) return send(res, 403, { success: false, message: "Host media tidak diizinkan." });
      const upstream = await fetch(target, {
        redirect: "follow",
        signal: AbortSignal.timeout(90000),
        headers: { "user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36" }
      });
      if (!upstream.ok || !upstream.body) return send(res, 502, { success: false, message: "File media gagal diambil dari sumber (" + upstream.status + ")." });
      const finalHost = new URL(upstream.url).hostname;
      if (!/(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com|tiktokcdn\.com|tiktokv\.com|byteoversea\.com|ibytedtos\.com|muscdn\.com|tikwm\.com|googlevideo\.com|youtube\.com|ytimg\.com|akamaized\.net)$/i.test(finalHost)) {
        return send(res, 403, { success: false, message: "Redirect media ditolak." });
      }
      const ext = (requestUrl.searchParams.get("ext") || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "mp4";
      res.writeHead(200, {
        "content-type": upstream.headers.get("content-type") || (ext === "jpg" ? "image/jpeg" : "application/octet-stream"),
        "content-disposition": 'attachment; filename="xydown-' + Date.now() + '.' + ext + '"',
        "cache-control": "no-store",
        "access-control-allow-origin": "*"
      });
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once("drain", resolve));
        }
        res.end();
      } catch (streamError) {
        res.destroy(streamError);
      }
    } catch (error) {
      if (!res.headersSent) send(res, 502, { success: false, message: "Gagal menyiapkan file unduhan: " + error.message });
      else res.destroy(error);
    }
    return;
  }
  if (req.method === "OPTIONS") return send(res, 200, { success: true });
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { success: true, service: "XYDOWN Download Engine" });
  if (req.method !== "POST" || req.url !== "/download") return send(res, 404, { success: false, message: "Endpoint tidak ditemukan." });
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) throw new Error("Tautan terlalu panjang.");
    }
    const body = JSON.parse(raw || "{}");
    if (typeof body.url !== "string" || !validUrl(body.url)) {
      return send(res, 400, { success: false, message: "Masukkan link Instagram, TikTok, atau YouTube yang valid." });
    }
    const targetUrl = body.url.trim();
    const host = new URL(targetUrl).hostname.toLowerCase();
    const platform = host.includes("instagram.com") ? "Instagram" :
      (host.includes("tiktok.com") ? "TikTok" : "YouTube");
    let result;
    try {
      result = await downloadWithApis(platform, targetUrl);
    } catch (apiError) {
      console.error("[XYDOWN] API utama gagal, mencoba yt-dlp:", apiError.message);
      const items = await runYtDlp(targetUrl);
      const media = items.flatMap((item, index) => cleanFormats(item).map(format => ({
        id: item.id || String(index + 1),
        title: item.title || item.description || platform,
        caption: item.description || item.title || "",
        thumbnail: item.thumbnail || (item.thumbnails || []).at(-1)?.url || null,
        formats: [format],
        type: /^(jpg|jpeg|png|webp|avif)$/i.test(format.ext || "") ? "photo" : "video"
      })));
      if (!media.length) throw apiError;
      result = { title: media[0].title, caption: media[0].caption, thumbnail: media[0].thumbnail, media };
    }
    const media = result.media || [];
    if (!media.length) return send(res, 422, { success: false, message: "API tidak mengembalikan media yang bisa diunduh." });
    const first = media[0];
    return send(res, 200, {
      success: true, title: result.title || first.title, caption: result.caption || first.caption,
      thumbnail: result.thumbnail || first.thumbnail, formats: media.flatMap(x => x.formats || []),
      media, count: media.length
    });
  } catch (e) {
    return send(res, 422, { success: false, message: e.message || "Gagal memproses media." });
  }
}).listen(PORT, "0.0.0.0", () => console.log("XYDOWN Download Engine aktif di port " + PORT));
