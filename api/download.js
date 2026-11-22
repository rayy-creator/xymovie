const ALLOWED = /(^|\\.)(tiktok\\.com|tiktokcdn-[a-z0-9-]+\\.com|tiktokcdn\\.com|tiktokv\\.com|byteoversea\\.com|ibytedtos\\.com)$/i;
module.exports = async (req, res) => {
  res.setHeader("Cache-Control","no-store");
  if (req.method !== "POST") return res.status(405).json({success:false,message:"Method tidak diizinkan."});
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const url = String(body.url || "").trim();
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({success:false,message:"Link TikTok tidak valid."}); }
    if (!["http:","https:"].includes(parsed.protocol) || !(parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com"))) {
      return res.status(400).json({success:false,message:"XYDOWN hanya menerima tautan TikTok."});
    }
    const endpoint = "https://tdownv4.sl-bjs.workers.dev/?down=" + encodeURIComponent(url);
    const upstream = await fetch(endpoint,{headers:{"accept":"application/json","user-agent":"XYDOWN/1.0"},signal:AbortSignal.timeout(35000)});
    const raw = await upstream.text();
    let data; try { data=JSON.parse(raw); } catch { throw new Error("API TikTok mengembalikan respons tidak valid."); }
    if (!upstream.ok || data.success === false || !data.download_url) throw new Error(data.message || "Video tidak ditemukan atau tidak dapat diunduh.");
    const formats = [{url:data.download_url,ext:"mp4",label:"Video tanpa watermark",type:"video"}];
    if (data.author && data.author.audio_url) formats.push({url:data.author.audio_url,ext:"mp3",label:"Audio",type:"audio"});
    return res.status(200).json({success:true,title:data.title || "TikTok Video",caption:data.title || "",thumbnail:data.author?.avatar || null,author:data.author || {},media:[{type:"video",title:data.title || "TikTok Video",formats}]});
  } catch (error) {
    return res.status(502).json({success:false,message:error.name==="TimeoutError"?"API TikTok terlalu lama merespons. Coba lagi.":(error.message || "Gagal memproses video.")});
  }
};