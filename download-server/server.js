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
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(45000), headers: { "user-agent": "Mozilla/5.0" } });
  const json = await response.json();
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
  if (platform === "TikTok") {
    try {
      const response = await clutchGet("tiktok", url);
      const result = response.result;
      if (response.status && Array.isArray(result?.data) && result.data.length) {
        const media = normalizeMedia(result.data.map(x => ({ ...x, title: result.title, thumbnail: result.cover })), result.title);
        return { title: result.title || "TikTok", caption: result.title || "", thumbnail: result.cover || null, media };
      }
    } catch (e) { console.error("[XYDOWN] Clutch TikTok:", e.message); }

    const response = await fetch("https://www.tikwm.com/api/?url=" + encodeURIComponent(url) + "&count=12&cursor=0&web=1&hd=1", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "user-agent": "Mozilla/5.0" },
      body: "",
      signal: AbortSignal.timeout(30000)
    });
    const json = await response.json();
    const d = json.data;
    if (d) {
      const items = [];
      if (Array.isArray(d.images) && d.images.length) {
        for (const image of d.images) items.push({ type: "photo", url: image, title: d.title, thumbnail: d.cover });
      } else {
        if (d.hdplay) items.push({ type: "video", url: d.hdplay.startsWith("http") ? d.hdplay : "https://www.tikwm.com" + d.hdplay, title: d.title, thumbnail: d.cover });
        if (!items.length && d.play) items.push({ type: "video", url: d.play.startsWith("http") ? d.play : "https://www.tikwm.com" + d.play, title: d.title, thumbnail: d.cover });
      }
      if (items.length) return { title: d.title || "TikTok", caption: d.title || "", thumbnail: d.cover || null, media: normalizeMedia(items, d.title) };
    }
    throw new Error("TikTok API tidak mengembalikan media yang bisa diunduh.");
  }

  if (platform === "Instagram") {
    const response = await clutchGet("instagram", url);
    const result = response.result;
    if (!response.status || !Array.isArray(result?.data) || !result.data.length) {
      throw new Error(response.error || "API Instagram tidak menemukan media.");
    }
    const caption = result.caption?.text || "";
    const media = normalizeMedia(result.data.map(x => ({
      ...x, caption, title: result.profile?.username ? "@" + result.profile.username : "Instagram",
      type: x.type === "video" ? "video" : "photo"
    })), "Instagram");
    return { title: result.profile?.username ? "@" + result.profile.username : "Instagram", caption, thumbnail: media[0]?.formats?.[0]?.url || null, media };
  }

  if (platform === "YouTube") {
    const response = await clutchGet("youtube", url, "&quality=720p");
    const data = response.result || response.data;
    const videoUrl = data?.video || data?.download;
    if (!videoUrl) throw new Error(response.error || "API YouTube tidak mengembalikan URL video.");
    const media = normalizeMedia([{ type: "video", url: videoUrl, title: data.title, thumbnail: data.thumbnail }], data.title || "YouTube");
    return { title: data.title || "YouTube", caption: data.duration ? "Durasi: " + data.duration : "", thumbnail: data.thumbnail || null, media };
  }
  throw new Error("Platform belum didukung.");
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
      const media = items.flatMap(item => cleanFormats(item).map(format => ({
        id: item.id || String(media.length + 1),
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
