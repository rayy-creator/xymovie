const { Readable } = require("node:stream");
const ALLOWED = /^(?:[a-z0-9-]+\.)*(?:tiktokcdn(?:-[a-z0-9-]+)?\.com|tiktokv\.com|tiktok\.com|byteoversea\.com|ibytedtos\.com|muscdn\.com)$/i;
module.exports = async (req,res) => {
  if (req.method !== "GET") return res.status(405).end("Method not allowed");
  try {
    const raw = req.query.url;
    const target = new URL(Array.isArray(raw) ? raw[0] : String(raw || ""));
    if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) return res.status(403).json({success:false,message:"Alamat media tidak diizinkan."});
    const headers = {"user-agent":"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36","referer":"https://www.tiktok.com/"};
    if (req.headers.range) headers.range = req.headers.range;
    const upstream = await fetch(target,{headers,redirect:"follow",signal:AbortSignal.timeout(60000)});
    if (!upstream.ok || !upstream.body) return res.status(502).json({success:false,message:"CDN TikTok menolak file atau tautannya sudah kedaluwarsa."});
    const finalUrl = new URL(upstream.url);
    if (finalUrl.protocol !== "https:" || !ALLOWED.test(finalUrl.hostname)) return res.status(403).end("Invalid media redirect");
    res.statusCode = upstream.status;
    for (const h of ["content-type","content-length","content-range","accept-ranges"]) {
      const value=upstream.headers.get(h); if(value) res.setHeader(h,value);
    }
    const ext = String(req.query.ext || "mp4").replace(/[^a-z0-9]/gi,"").slice(0,5).toLowerCase() || "mp4";
    res.setHeader("content-disposition",'attachment; filename="xydown-tiktok.'+ext+'"');
    res.setHeader("cache-control","no-store");
    res.setHeader("x-content-type-options","nosniff");
    Readable.fromWeb(upstream.body).pipe(res);
  } catch(error) {
    if (!res.headersSent) res.status(error.name === "TimeoutError" ? 504 : 400).json({success:false,message:error.name === "TimeoutError" ? "Pengambilan file melewati batas waktu." : "URL file tidak valid atau gagal diambil."});
    else res.destroy(error);
  }
};