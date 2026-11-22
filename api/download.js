module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({success:false,message:"Gunakan POST."});
  const json = (status, value) => res.status(status).json(value);
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const input = String(body.url || "").trim();
    let parsed;
    try { parsed = new URL(input); } catch { return json(400,{success:false,message:"Tautan TikTok tidak valid."}); }
    const host = parsed.hostname.toLowerCase();
    if (!["http:","https:"].includes(parsed.protocol) || !(host === "tiktok.com" || host.endsWith(".tiktok.com"))) {
      return json(400,{success:false,message:"Masukkan tautan TikTok atau TikTok Lite yang valid."});
    }

    // Resolve vt.tiktok.com / vm.tiktok.com short links before sending to extractors.
    let canonical = input;
    try {
      const resolved = await fetch(input, {
        method:"HEAD", redirect:"follow",
        headers:{"user-agent":"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36"},
        signal:AbortSignal.timeout(10000)
      });
      if (resolved.url) canonical = resolved.url;
    } catch (_) {}

    const absolute = value => {
      if (typeof value !== "string" || !value.trim()) return "";
      try {
        const u = new URL(value, "https://www.tikwm.com");
        return u.protocol === "https:" ? u.toString() : "";
      } catch { return ""; }
    };
    const tryTikWM = async () => {
      const form = new URLSearchParams({url:canonical, count:"12", cursor:"0", web:"1", hd:"1"});
      const response = await fetch("https://www.tikwm.com/api/", {
        method:"POST",
        headers:{
          "content-type":"application/x-www-form-urlencoded; charset=UTF-8",
          "accept":"application/json, text/plain, */*",
          "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
          "referer":"https://www.tikwm.com/"
        },
        body:form.toString(),
        signal:AbortSignal.timeout(35000)
      });
      const payload = await response.json();
      if (!response.ok || Number(payload.code) !== 0 || !payload.data) {
        throw new Error(payload.msg || "TikWM gagal membaca postingan ini.");
      }
      const d = payload.data, formats = [];
      const video = absolute(d.hdplay || d.play);
      if (video) formats.push({url:video,ext:"mp4",label:d.hdplay ? "Video HD tanpa watermark" : "Video tanpa watermark",type:"video"});
      const audio = absolute(d.music_info?.play || d.music);
      if (audio) formats.push({url:audio,ext:"mp3",label:"Audio MP3",type:"audio"});
      const images = Array.isArray(d.images) ? d.images : [];
      images.forEach((entry,index) => {
        let raw = "";
        if (typeof entry === "string") raw = entry;
        else if (Array.isArray(entry)) raw = entry.find(v => typeof v === "string") || "";
        else raw = entry?.url || entry?.display_image?.url_list?.[0] || entry?.url_list?.[0] || entry?.image_url || "";
        const imageUrl = absolute(raw);
        if (imageUrl) formats.push({url:imageUrl,ext:"jpg",label:"Gambar "+(index+1),type:"photo",index:index+1});
      });
      if (!formats.length) throw new Error("Postingan terbaca, tetapi tidak ada tautan media yang bisa diunduh.");
      return {
        success:true,title:d.title || "Media TikTok",caption:d.title || "",
        thumbnail:absolute(d.cover || d.origin_cover) || null,
        author:d.author || {},provider:"TikWM",
        media:[{type:"media",formats}]
      };
    };

    try {
      return json(200, await tryTikWM());
    } catch (primaryError) {
      // Existing Slbjs API is kept as a video-only fallback.
      try {
        const endpoint = "https://tdownv4.sl-bjs.workers.dev/?down=" + encodeURIComponent(canonical);
        const upstream = await fetch(endpoint,{
          headers:{"accept":"application/json","user-agent":"XYDOWN/1.0"},
          signal:AbortSignal.timeout(30000)
        });
        const data = await upstream.json();
        if (!upstream.ok || data.success === false || !data.download_url) throw new Error(data.message || "Fallback tidak menyediakan file.");
        const formats = [{url:absolute(data.download_url),ext:"mp4",label:"Video tanpa watermark",type:"video"}].filter(x=>x.url);
        const audio = absolute(data.music_url || data.audio_url || data.author?.audio_url);
        if (audio) formats.push({url:audio,ext:"mp3",label:"Audio MP3",type:"audio"});
        if (!formats.length) throw new Error("Fallback tidak mengembalikan URL media.");
        return json(200,{success:true,title:data.title || "TikTok Video",caption:data.title || "",thumbnail:absolute(data.thumbnail || data.cover) || null,author:data.author || {},provider:"Slbjs fallback",media:[{type:"media",formats}]});
      } catch (fallbackError) {
        return json(502,{success:false,message:"Tidak dapat mengambil media dari postingan ini. Pastikan postingan publik, lalu coba lagi. Detail: "+String(primaryError.message || fallbackError.message).slice(0,180)});
      }
    }
  } catch (error) {
    return json(502,{success:false,message:error.name === "TimeoutError" ? "Server downloader kehabisan waktu. Coba lagi beberapa saat." : "Downloader gagal memproses tautan. Coba tautan TikTok publik lain."});
  }
};