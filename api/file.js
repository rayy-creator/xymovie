const { Readable } = require("node:stream");
const ALLOWED = /(^|\\.)(tiktokcdn-[a-z0-9-]+\\.com|tiktokcdn\\.com|tiktokv\\.com|byteoversea\\.com|ibytedtos\\.com|muscdn\\.com)$/i;
module.exports = async (req,res) => {
  if (req.method !== "GET") return res.status(405).end("Method not allowed");
  try {
    const target = new URL(String(req.query.url || ""));
    if (target.protocol !== "https:" || !ALLOWED.test(target.hostname)) return res.status(403).json({success:false,message:"Host file tidak diizinkan."});
    const headers = {"user-agent":"Mozilla/5.0","referer":"https://www.tiktok.com/"};
    if (req.headers.range) headers.range = req.headers.range;
    const upstream = await fetch(target,{headers,redirect:"follow",signal:AbortSignal.timeout(60000)});
    if (!upstream.ok || !upstream.body) return res.status(502).json({success:false,message:"File media gagal diambil."});
    const finalUrl = new URL(upstream.url);
    if (finalUrl.protocol !== "https:" || !ALLOWED.test(finalUrl.hostname)) return res.status(403).end("Invalid media redirect");
    res.statusCode = upstream.status;
    for (const h of ["content-type","content-length","content-range","accept-ranges"]) {
      const value=upstream.headers.get(h); if(value) res.setHeader(h,value);
    }
    res.setHeader("content-disposition",'attachment; filename="xydown-tiktok.mp4"');
    res.setHeader("cache-control","no-store");
    res.setHeader("x-content-type-options","nosniff");
    Readable.fromWeb(upstream.body).pipe(res);
  } catch(error) {
    if (!res.headersSent) res.status(400).json({success:false,message:error.message || "Gagal mengambil file."});
    else res.destroy(error);
  }
};