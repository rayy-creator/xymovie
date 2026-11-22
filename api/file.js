const ALLOWED_HOST = /^(?:[a-z0-9-]+\\.)*(?:tiktokcdn(?:-[a-z0-9-]+)?\\.com|tiktokv(?:-[a-z0-9-]+)?\\.com|tiktok\\.com|byteoversea\\.com|ibytedtos\\.com|muscdn\\.com|tikwm\\.com|tikwm\\.net)$/i;
const one = value => Array.isArray(value) ? value[0] : value;

function fail(res, status, message) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ success: false, message });
}

function detectMedia(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const head = buffer.subarray(0, 32);
  const text = head.toString("utf8").trimStart().toLowerCase();
  if (text.startsWith("{") || text.startsWith("[") || text.startsWith("<!doctype") || text.startsWith("<html")) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (head.subarray(0, 4).toString() === "RIFF" && head.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (head.subarray(0, 3).toString() === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (head.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  if (head.subarray(0, 4).toString() === "OggS") return "audio/ogg";
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return fail(res, 405, "Method tidak diizinkan.");
  }

  try {
    const raw = one(req.query.url);
    if (!raw) return fail(res, 400, "URL media tidak ditemukan.");

    let target;
    try { target = new URL(String(raw)); }
    catch { return fail(res, 400, "URL media tidak valid."); }

    if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
      return fail(res, 403, "Host CDN tidak diizinkan: " + target.hostname);
    }

    const headers = {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
      "referer": target.hostname.endsWith("tikwm.com") ? "https://www.tikwm.com/" : "https://www.tiktok.com/",
      "accept": "*/*"
    };
    if (req.headers.range) headers.range = req.headers.range;

    const upstream = await fetch(target.toString(), {
      headers, redirect: "follow", signal: AbortSignal.timeout(60000)
    });
    if (!upstream.ok) return fail(res, 502, "CDN menolak file (HTTP " + upstream.status + "). Proses ulang tautan TikTok untuk mendapatkan URL baru.");
    if (!upstream.body) return fail(res, 502, "CDN tidak mengirim isi file.");

    const finalUrl = new URL(upstream.url);
    if (finalUrl.protocol !== "https:" || !ALLOWED_HOST.test(finalUrl.hostname)) {
      await upstream.body.cancel().catch(() => {});
      return fail(res, 403, "Redirect CDN menuju host yang tidak diizinkan.");
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    const detected = detectMedia(bytes);
    if (!detected) return fail(res, 502, "Respons CDN bukan file media yang valid. Tidak ada file yang diunduh. Silakan proses ulang tautan.");

    const requested = String(one(req.query.ext) || "").toLowerCase();
    const extension = detected === "video/mp4" ? "mp4"
      : detected === "audio/mpeg" ? (requested === "mp3" ? "mp3" : "mp3")
      : detected === "image/png" ? "png"
      : detected === "image/webp" ? "webp"
      : detected === "audio/ogg" ? "ogg" : "jpg";
    const kind = detected.startsWith("video/") ? "video" : detected.startsWith("audio/") ? "audio" : "photo";
    const filename = "xydown-" + kind + "." + extension;

    res.statusCode = 200;
    res.setHeader("Content-Type", detected);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(bytes);
  } catch (error) {
    if (!res.headersSent) return fail(res, error.name === "TimeoutError" ? 504 : 502,
      error.name === "TimeoutError" ? "CDN terlalu lama merespons. Coba proses ulang." : "Gagal mengambil file media: " + String(error.message || error).slice(0, 160));
    res.destroy(error);
  }
};
