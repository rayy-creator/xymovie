module.exports = async (req, res) => {
  res.setHeader("Cache-Control","no-store");
  if (req.method !== "POST") return res.status(405).json({success:false,message:"Method tidak diizinkan."});
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const url = String(body.url || "").trim();
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({success:false,message:"Link TikTok tidak valid."}); }
    if (!["http:","https:"].includes(parsed.protocol) || !(parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com"))) {
      return res.status(400).json({success:false,message:"XYDOWN hanya menerima tautan TikTok/TikTok Lite."});
    }
    const absolute = value => { try { return new URL(value, "https://www.tikwm.com").toString(); } catch { return ""; } };
    const tryTikWM = async () => {
      const form = new URLSearchParams({url,hd:"1",web:"1"});
      const response = await fetch("https://www.tikwm.com/api/?"+form.toString(), {
        method:"GET", headers:{"accept":"application/json","user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36","referer":"https://www.tikwm.com/"},
        signal:AbortSignal.timeout(30000)
      });
      const payload = await response.json();
      if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "TikWM tidak menemukan media.");
      const d = payload.data, formats = [];
      const video = absolute(d.hdplay || d.play || d.wmplay);
      if (video) formats.push({url:video,ext:"mp4",label:"Video "+(d.hdplay?"HD ":"")+"tanpa watermark",type:"video"});
      const audio = absolute(d.music_info?.play || d.music || d.author?.audio_url);
      if (audio) formats.push({url:audio,ext:"mp3",label:"Audio MP3",type:"audio"});
      const images = Array.isArray(d.images) ? d.images : [];
      images.forEach((image,index) => {
        const raw = typeof image === "string" ? image : (image?.url || image?.display_image?.url_list?.[0] || image?.url_list?.[0] || image?.[0]);
        const imageUrl = absolute(raw);
        if (imageUrl) formats.push({url:imageUrl,ext:"jpg",label:"Gambar "+(index+1),type:"photo",index:index+1});
      });
      if (!formats.length) throw new Error("TikWM tidak mengembalikan file media.");
      return {success:true,title:d.title || "Media TikTok",caption:d.title || "",thumbnail:absolute(d.cover || d.origin_cover) || null,author:d.author || {},provider:"TikWM",media:[{type:"media",formats}]};
    };
    try {
      return res.status(200).json(await tryTikWM());
    } catch (primaryError) {
      const endpoint = "https://tdownv4.sl-bjs.workers.dev/?down=" + encodeURIComponent(url);
      const upstream = await fetch(endpoint,{headers:{"accept":"application/json","user-agent":"XYDOWN/1.0"},signal:AbortSignal.timeout(30000)});
      const raw = await upstream.text();
      let data; try { data=JSON.parse(raw); } catch { throw primaryError; }
      if (!upstream.ok || data.success === false || !data.download_url) throw primaryError;
      const formats = [{url:data.download_url,ext:"mp4",label:"Video tanpa watermark",type:"video"}];
      const audio = data.author?.audio_url;
      if (audio) formats.push({url:audio,ext:"mp3",label:"Audio MP3",type:"audio"});
      return res.status(200).json({success:true,title:data.title || "TikTok Video",caption:data.title || "",thumbnail:data.author?.avatar || null,author:data.author || {},provider:"Slbjs fallback",media:[{type:"media",formats}]});
    }
  } catch (error) {
    return res.status(502).json({success:false,message:error.name==="TimeoutError"?"API TikTok terlalu lama merespons. Coba lagi.":(error.message || "Gagal memproses media TikTok.")});
  }
};