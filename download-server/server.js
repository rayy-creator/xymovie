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
    const items = await runYtDlp(body.url.trim());
    const media = items.map((item, index) => ({
      id: item.id || String(index + 1),
      title: item.title || item.description || "Instagram media",
      caption: item.description || item.title || "",
      thumbnail: item.thumbnail || (item.thumbnails || []).at(-1)?.url || null,
      formats: cleanFormats(item),
      type: item._type === "playlist" ? "collection" : (item.ext === "jpg" || item.ext === "webp" ? "photo" : "video")
    })).filter(x => x.formats.length);
    if (!media.length) return send(res, 422, { success: false, message: "Media ditemukan, tetapi URL unduhan tidak tersedia." });
    const first = media[0];
    return send(res, 200, {
      success: true, title: first.title, caption: first.caption,
      thumbnail: first.thumbnail, formats: first.formats,
      media, count: media.length
    });
  } catch (e) {
    return send(res, 422, { success: false, message: e.message || "Gagal memproses media." });
  }
}).listen(PORT, "0.0.0.0", () => console.log("XYDOWN Download Engine aktif di port " + PORT));
