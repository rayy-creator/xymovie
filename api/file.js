const { Readable } = require("node:stream");

const ALLOWED_HOST = /^(?:[a-z0-9-]+\.)*(?:tiktokcdn(?:-[a-z0-9-]+)?\.com|tiktokv\.com|tiktok\.com|byteoversea\.com|ibytedtos\.com|muscdn\.com|tikwm\.com|tikwm\.net)$/i;
const getOne = value => Array.isArray(value) ? value[0] : value;

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success:false, message:"Method tidak diizinkan." });
  }

  try {
    const rawUrl = getOne(req.query.url);
    if (!rawUrl) return res.status(400).json({ success:false, message:"URL file tidak ditemukan." });

    let target;
    try { target = new URL(String(rawUrl)); }
    catch { return res.status(400).json({ success:false, message:"URL file tidak valid." }); }

    if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
      return res.status(403).json({ success:false, message:"Domain file tidak termasuk CDN yang didukung: " + target.hostname });
    }

    const headers = {
      "user-agent":"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      "referer":"https://www.tiktok.com/",
      "accept":"*/*"
    };
    if (req.headers.range) headers.range = req.headers.range;

    const upstream = await fetch(target.toString(), {
      method:"GET",
      headers,
      redirect:"follow",
      signal:AbortSignal.timeout(60000)
    });

    if (!upstream.ok || !upstream.body) {
      const detail = "CDN mengembalikan HTTP " + upstream.status + ". Link media mungkin kedaluwarsa.";
      return res.status(502).json({ success:false, message:detail });
    }

    const finalUrl = new URL(upstream.url);
    if (finalUrl.protocol !== "https:" || !ALLOWED_HOST.test(finalUrl.hostname)) {
      await upstream.body.cancel().catch(() => {});
      return res.status(403).json({ success:false, message:"Pengalihan CDN menuju domain yang tidak diizinkan." });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (/application\/json|text\/html/i.test(contentType)) {
      const detail = (await upstream.text()).slice(0,300);
      return res.status(502).json({ success:false, message:"CDN tidak mengirim file media. " + detail });
    }

    const requestedExt = String(getOne(req.query.ext) || "mp4").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,5);
    const ext = ["mp4","mp3","jpg","jpeg","png","webp","m4a"].includes(requestedExt) ? requestedExt : "mp4";
    const filename = "xydown-" + (ext === "mp4" ? "video" : ext === "mp3" || ext === "m4a" ? "audio" : "slide") + "." + ext;

    res.statusCode = upstream.status;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    for (const name of ["content-length","content-range","accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      const status = error.name === "TimeoutError" ? 504 : 502;
      return res.status(status).json({
        success:false,
        message:error.name === "TimeoutError" ? "CDN terlalu lama merespons. Coba lagi." : "Gagal mengambil file dari CDN: " + String(error.message || error).slice(0,180)
      });
    }
    res.destroy(error);
  }
};