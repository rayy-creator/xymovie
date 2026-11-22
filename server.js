const http = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const readyFiles = new Map();
const adminSessions = new Map();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SETTINGS_FILE = path.join(__dirname, "xydown-settings.json");
const DEFAULT_SETTINGS = {siteName:"XYDOWN",tagline:"TikTok Downloader",headline:"Simpan video TikTok.<br><span>Lebih praktis.</span>",description:"Tempel tautan TikTok publik untuk melihat media yang tersedia. Pilih format yang kamu butuhkan, lalu unduh langsung dari halaman ini.",about:"XYDOWN adalah alat sederhana untuk membantu menyimpan video dan foto dari tautan TikTok publik. Tidak perlu memasukkan akun TikTok, kata sandi, atau cookie. Cukup tempel tautan, proses, lalu pilih media yang ingin disimpan.",saweria:"https://saweria.co/",sociabuzz:"https://sociabuzz.com/"};

const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3000);
const MAX_BODY = 8192;
const ALLOWED = ["tiktok.com"];

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


function runCommand(command, args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error((stderr || "yt-dlp gagal mengunduh video.").trim().slice(-1800)));
      resolve(stdout.trim());
    });
  });
}
async function saveYtDlpFile(url, args, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xydown-"));
  const template = path.join(dir, "%(title).80B-%(id)s.%(ext)s");
  const baseArgs = [
    "--no-warnings", "--no-playlist", "--no-part",
    "--js-runtimes", "node",
    "--socket-timeout", "30", "--retries", "3"
  ];
  const attempts = [args];
  // Format IDs/combination differ between YouTube videos and Shorts.
  // If the preferred combination is unavailable, let yt-dlp choose a real
  // compatible stream instead of returning a false "format unavailable".
  const formatIndex = args.indexOf("-f");
  if (formatIndex !== -1) {
    const fallback = args.slice();
    fallback[formatIndex + 1] = label === "MP3" ? "bestaudio/best" : "best";
    const mergeIndex = fallback.indexOf("--merge-output-format");
    if (mergeIndex !== -1) fallback.splice(mergeIndex, 2);
    attempts.push(fallback);
  }
  try {
    let printed = "";
    let lastError;
    for (const selectedArgs of attempts) {
      try {
        printed = await runCommand("yt-dlp", [
          ...baseArgs, ...selectedArgs,
          "--print", "after_move:filepath",
          "-o", template, url
        ]);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!/requested format is not available|format is not available|no video formats found/i.test(error.message)) throw error;
      }
    }
    if (lastError) throw lastError;
    const lines = printed.split(/\r?\n/).filter(Boolean);
    let file = lines.length ? lines[lines.length - 1] : "";
    if (!path.isAbsolute(file) || !fs.existsSync(file)) {
      const candidates = fs.readdirSync(dir).map(name => path.join(dir, name))
        .filter(name => fs.statSync(name).isFile());
      if (!candidates.length) throw new Error("File " + label + " tidak ditemukan setelah diproses.");
      file = candidates.sort((a,b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    }
    const id = crypto.randomBytes(18).toString("hex");
    readyFiles.set(id, { file, dir });
    const cleanup = setTimeout(() => {
      const saved = readyFiles.get(id);
      readyFiles.delete(id);
      if (saved) fs.rm(saved.dir, { recursive: true, force: true }, () => {});
    }, 60 * 60 * 1000);
    cleanup.unref?.();
    return { id, file, ext: path.extname(file).slice(1).toLowerCase() || "mp4" };
  } catch (error) {
    fs.rm(dir, { recursive: true, force: true }, () => {});
    throw error;
  }
}
async function downloadOriginal(url) {
  const video = await saveYtDlpFile(url, [
    "-f", "bv*+ba/b",
    "--merge-output-format", "mp4"
  ], "video");
  const formats = [{
    url: "/file?id=" + video.id, ext: video.ext, height: null, label: "Video"
  }];
  try {
    const audio = await saveYtDlpFile(url, [
      "-f", "ba/b",
      "-x", "--audio-format", "mp3", "--audio-quality", "0"
    ], "MP3");
    formats.push({
      url: "/file?id=" + audio.id, ext: "mp3", height: null, label: "MP3"
    });
  } catch (error) {
    console.error("[XYDOWN] Konversi MP3 gagal:", error.message);
    formats.push({
      unavailable: true, ext: "mp3", label: "MP3",
      message: /ffmpeg|postprocess/i.test(error.message)
        ? "MP3 membutuhkan FFmpeg. Pasang dengan: pkg install ffmpeg"
        : "Gagal menyiapkan MP3: " + error.message.slice(0, 180)
    });
  }
  return {
    title: path.basename(video.file, path.extname(video.file)),
    caption: "",
    thumbnail: null,
    media: [{
      id: video.id, title: path.basename(video.file), caption: "",
      thumbnail: null, type: "video", formats
    }]
  };
}
function runYtDlp(url) {
  return new Promise((resolve, reject) => {
    const args = [
      // Ekstraksi metadata saja. Jangan pernah memasang -f / --format di tahap preview.
      "--dump-single-json",
      "--skip-download",
      "--ignore-no-formats-error",
      "--no-check-formats",
      "--no-warnings",
      "--no-progress",
      "--no-playlist",
      "--js-runtimes", "node",
      "--socket-timeout", "45",
      "--retries", "3",
      "--extractor-retries", "3",
      "--user-agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
      url
    ];
    const child = spawn("yt-dlp", args);
    let out = "", err = "";
    child.stdout.on("data", b => { out += b.toString(); if (out.length > 12_000_000) child.kill(); });
    child.stderr.on("data", b => { err += b.toString(); if (err.length > 12000) err = err.slice(-12000); });
    child.on("error", e => reject(new Error("yt-dlp tidak ditemukan. Jalankan: pip install -U yt-dlp")));
    child.on("close", code => {
      let items = [];
      try {
        const parsed = JSON.parse(out.trim());
        items = Array.isArray(parsed.entries)
          ? parsed.entries.filter(Boolean)
          : [parsed];
      } catch {
        items = out.split(/\r?\n/).filter(Boolean).flatMap(line => {
          try { return [JSON.parse(line)]; } catch { return []; }
        });
      }
      if (!items.length) {
        const detail = (err || "").trim().split(/\r?\n/).slice(-5).join(" ").slice(-700);
        const msg = /login|cookie|private|sign in|rate.?limit|403|429/i.test(err)
          ? "Platform membatasi akses konten ini. Pastikan postingan publik dan coba lagi."
          : "yt-dlp gagal mengambil media." + (detail ? " Detail: " + detail : " Periksa yt-dlp dan koneksi server.");
        return reject(new Error(msg));
      }
      resolve(items);
    });
  });
}
function cleanFormats(info) {
  // Prefer the exact format selected by yt-dlp. Listing every available
  // YouTube format can expose video-only streams (no audio) as downloads.
  const selected = [
    ...(Array.isArray(info.requested_downloads) ? info.requested_downloads : []),
    ...(Array.isArray(info.requested_formats) ? info.requested_formats : [])
  ];
  const source = selected.length ? selected : (info.url ? [{
    url: info.url, ext: info.ext, height: info.height,
    vcodec: info.vcodec, acodec: info.acodec, format: info.format
  }] : (Array.isArray(info.formats) ? info.formats : []));
  const isImage = f => /^(jpg|jpeg|png|webp|avif)$/i.test(f.ext || "");
  const candidates = source.filter(f =>
    f.url && !f.has_drm && (isImage(f) || (f.vcodec !== "none" && f.acodec !== "none"))
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

  if (req.method === "GET" && req.url.startsWith("/download-file?")) {
    try {
      const requestUrl = new URL(req.url, "http://localhost");
      const sourceUrl = requestUrl.searchParams.get("url") || "";
      const kind = requestUrl.searchParams.get("type") || "video";
      if (!validUrl(sourceUrl) || !["video", "mp3"].includes(kind)) {
        return send(res, 400, { success: false, message: "Permintaan unduhan tidak valid." });
      }
      const saved = kind === "mp3"
        ? await saveYtDlpFile(sourceUrl, [
            "-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"
          ], "MP3")
        : await saveYtDlpFile(sourceUrl, [
            "-f", "bv*+ba/b", "--merge-output-format", "mp4"
          ], "video");
      const ext = path.extname(saved.file).toLowerCase() || (kind === "mp3" ? ".mp3" : ".mp4");
      const mime = ext === ".mp3" ? "audio/mpeg" : ext === ".webm" ? "video/webm" : "video/mp4";
      const stat = fs.statSync(saved.file);
      const range = req.headers.range;
      let start = 0, end = stat.size - 1, status = 200;
      if (range) {
        const match = /^bytes=(\\d*)-(\\d*)$/.exec(range);
        if (match) {
          if (match[1]) start = Number(match[1]);
          if (match[2]) end = Number(match[2]);
          if (!match[1] && match[2]) start = Math.max(0, stat.size - Number(match[2]));
          end = Math.min(end, stat.size - 1);
          if (start > end || start >= stat.size) {
            res.writeHead(416, { "content-range": "bytes */" + stat.size, "access-control-allow-origin": "*" });
            return res.end();
          }
          status = 206;
        }
      }
      res.writeHead(status, {
        "content-type": mime,
        "content-length": end - start + 1,
        "content-disposition": 'attachment; filename="xydown-' + kind + ext + '"',
        "cache-control": "no-store",
        "accept-ranges": "bytes",
        ...(status === 206 ? { "content-range": "bytes " + start + "-" + end + "/" + stat.size } : {}),
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-disposition, content-length, content-range",
        "x-content-type-options": "nosniff"
      });
      const stream = fs.createReadStream(saved.file, { start, end });
      const cleanup = () => {
        readyFiles.delete(saved.id);
        fs.rm(saved.dir, { recursive: true, force: true }, () => {});
      };
      stream.on("error", error => {
        if (!res.headersSent) send(res, 500, { success: false, message: "Gagal membaca file hasil unduhan." });
        else res.destroy(error);
      });
      res.on("close", () => { if (!res.writableEnded) stream.destroy(); });
      stream.on("end", cleanup);
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) send(res, 502, { success: false, message: "Gagal membuat file unduhan: " + error.message });
      else res.destroy(error);
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/file?id=")) {
    const id = new URL(req.url, "http://localhost").searchParams.get("id");
    const saved = readyFiles.get(id);
    if (!saved || !fs.existsSync(saved.file)) return send(res, 404, { success: false, message: "File tidak tersedia atau sudah kedaluwarsa. Proses ulang tautannya." });
    const ext = path.extname(saved.file).toLowerCase();
    const mime = ext === ".mp3" ? "audio/mpeg" : ext === ".webm" ? "video/webm" : ext === ".mkv" ? "video/x-matroska" : "video/mp4";
    res.writeHead(200, {
      "content-type": mime,
      "content-length": fs.statSync(saved.file).size,
      "content-disposition": 'attachment; filename="xydown-' + id + (ext || ".mp4") + '"',
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    });
    fs.createReadStream(saved.file).pipe(res);
    return;
  }
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
  const rawPath = new URL(req.url, "http://localhost").pathname;
  let routePath = rawPath;
  try { routePath = decodeURIComponent(rawPath); } catch {}
  routePath = routePath.replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g, "").replace(/\\/+$/, "") || "/";
  if (req.method === "GET" && ["/", "/health", "/api/health"].includes(routePath)) return send(res, 200, { success: true, service: "XYDOWN Download Engine", version: "2026-11-21-pterodactyl-fix" });
  if (req.method === "GET" && routePath === "/site-settings") {
    let settings = DEFAULT_SETTINGS;
    try { if (fs.existsSync(SETTINGS_FILE)) settings = {...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"))}; } catch {}
    return send(res, 200, {success:true, settings});
  }
  if (req.method === "POST" && routePath === "/admin/login") {
    let raw = "";
    try {
      for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) throw new Error("Permintaan terlalu besar."); }
      const body = JSON.parse(raw || "{}");
      if (!ADMIN_PASSWORD) return send(res, 503, {success:false, message:"ADMIN_PASSWORD belum diatur pada environment server."});
      const supplied = Buffer.from(String(body.password || ""));
      const expected = Buffer.from(ADMIN_PASSWORD);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return send(res, 401, {success:false, message:"Kata sandi admin salah."});
      const token = crypto.randomBytes(32).toString("hex");
      adminSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      return send(res, 200, {success:true, token});
    } catch (error) { return send(res, 400, {success:false, message:error.message || "Permintaan login tidak valid."}); }
  }
  if (["GET","PUT"].includes(req.method) && routePath === "/admin/settings") {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const expires = adminSessions.get(token);
    if (!token || !expires || expires < Date.now()) {
      adminSessions.delete(token);
      return send(res, 401, {success:false, message:"Sesi admin berakhir. Silakan login kembali."});
    }
    if (req.method === "GET") {
      let settings = DEFAULT_SETTINGS;
      try { if (fs.existsSync(SETTINGS_FILE)) settings = {...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"))}; } catch {}
      return send(res, 200, {success:true, settings});
    }
    try {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw new Error("Data pengaturan terlalu besar."); }
      const body = JSON.parse(raw || "{}");
      const incoming = body.settings || {};
      const allowed = ["siteName","tagline","headline","description","about","saweria","sociabuzz"];
      const current = {...DEFAULT_SETTINGS};
      try { if (fs.existsSync(SETTINGS_FILE)) Object.assign(current, JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"))); } catch {}
      for (const key of allowed) if (typeof incoming[key] === "string") current[key] = incoming[key].slice(0, key === "about" ? 1200 : key === "description" ? 600 : 300);
      for (const key of ["saweria","sociabuzz"]) {
        try { const u = new URL(current[key]); if (u.protocol !== "https:") throw new Error(); }
        catch { return send(res, 400, {success:false, message:"Tautan donasi harus berupa URL HTTPS yang valid."}); }
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf8");
      return send(res, 200, {success:true, settings:current});
    } catch (error) { return send(res, 400, {success:false, message:error.message || "Gagal menyimpan pengaturan."}); }
  }

  if (req.method !== "POST" || !["/download", "/api/download"].includes(routePath)) return send(res, 404, { success: false, message: "Endpoint tidak ditemukan: " + req.method + " " + routePath });
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY) throw new Error("Tautan terlalu panjang.");
    }
    const body = JSON.parse(raw || "{}");
    if (typeof body.url !== "string" || !validUrl(body.url)) {
      return send(res, 400, { success: false, message: "XYDOWN hanya menerima tautan TikTok yang valid." });
    }
    const targetUrl = body.url.trim();
    const host = new URL(targetUrl).hostname.toLowerCase();
    const platform = host.includes("instagram.com") ? "Instagram" :
      (host.includes("tiktok.com") ? "TikTok" : "YouTube");
    let result;
    if (platform === "TikTok") {
      result = await downloadWithApis(platform, targetUrl);
    } else if (platform === "YouTube") {
      // Hanya ambil metadata saat pengguna memproses tautan.
      // File video/audio baru dibuat setelah pengguna menekan pilihan format.
      const items = await runYtDlp(targetUrl);
      const info = items[0];
      const encoded = encodeURIComponent(targetUrl);
      result = {
        title: info.title || "YouTube",
        caption: info.description || info.title || "",
        thumbnail: info.thumbnail || (info.thumbnails || []).at(-1)?.url || null,
        media: [{
          id: info.id || "youtube",
          title: info.title || "YouTube",
          caption: info.description || "",
          thumbnail: info.thumbnail || null,
          type: "video",
          formats: [
            { url: "/download-file?url=" + encoded + "&type=video", ext: "mp4", label: "Video MP4" },
            { url: "/download-file?url=" + encoded + "&type=mp3", ext: "mp3", label: "Audio MP3" }
          ]
        }]
      };
    } else {
      const items = await runYtDlp(targetUrl);
      const media = items.flatMap((item, index) => cleanFormats(item).map(format => ({
        id: item.id || String(index + 1),
        title: item.title || item.description || platform,
        caption: item.description || item.title || "",
        thumbnail: item.thumbnail || (item.thumbnails || []).at(-1)?.url || null,
        formats: [format],
        type: /^(jpg|jpeg|png|webp|avif)$/i.test(format.ext || "") ? "photo" : "video"
      })));
      if (!media.length) throw new Error("yt-dlp tidak menemukan media yang bisa diunduh.");
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
}).listen(PORT, "0.0.0.0", () => console.log("XYDOWN aktif pada port " + PORT));
