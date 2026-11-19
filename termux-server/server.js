const http = require("node:http");
const dns = require("node:dns").promises;
const net = require("node:net");
const { chromium } = require("playwright-core");

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.XYBYPASS_TOKEN || "";
const CHROME = process.env.CHROMIUM_PATH || "/data/data/com.termux/files/usr/bin/chromium-browser";
const TIMEOUT = Number(process.env.BYPASS_TIMEOUT || 45000);

// Candidate registry: availability can change; browser success is checked per request.
const PROVIDERS = [
  "sfl.gl","safelinku.com","linku.to","lokerwfh.net","sub4unlock.com",
  "sub2unlock.com","linkvertise.com","adf.ly","boost.ink","mboost.me",
  "try2link.com","gplinks.co","pkin.me","shareus.in","ouo.io",
  "anonym.to","droplink.co","tnlink.in","ez4short.com","xpshort.com",
  "rocklinks.net","open2get.in","linkbnao.com","linkpays.in","pi-l.ink",
  "adrinolinks.in","techymozo.com","bitshorten.com","earn4link.in","za.uy",
  "gtlinks.me","cuty.io","lnbz.la","exe.io","xut.io","shorte.st",
  "ouo.press","fc.lc","clks.pro","linksly.co","shortingly.com",
  "urlcash.com","ity.im","clk.sh"
];

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type":"application/json; charset=utf-8",
    "content-length":Buffer.byteLength(body),
    "cache-control":"no-store",
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "access-control-allow-headers":"content-type, x-xybypass-token"
  });
  res.end(body);
}
function privateIp(ip) {
  if (net.isIP(ip) === 4) {
    const p=ip.split(".").map(Number);
    return p[0]===0 || p[0]===10 || p[0]===127 ||
      (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) ||
      (p[0]===192&&p[1]===168) || p[0]>=224;
  }
  if (net.isIP(ip) === 6) {
    const s=ip.toLowerCase();
    return s==="::" || s==="::1" || s.startsWith("fc") || s.startsWith("fd") ||
      s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb");
  }
  return true;
}
async function safeUrl(raw) {
  const u=new URL(raw);
  if (!["http:","https:"].includes(u.protocol) || u.username || u.password) throw new Error("URL tidak valid.");
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (host==="localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Host lokal ditolak.");
  const records=net.isIP(host) ? [{address:host}] : await dns.lookup(host,{all:true});
  if (!records.length || records.some(x=>privateIp(x.address))) throw new Error("Alamat jaringan privat ditolak.");
  return u;
}
function supported(host) {
  return PROVIDERS.some(d => host===d || host.endsWith("."+d));
}
async function readBody(req) {
  let s="";
  for await (const chunk of req) { s+=chunk; if(s.length>8192) throw new Error("Body terlalu besar."); }
  return JSON.parse(s || "{}");
}
async function resolve(url) {
  const browser=await chromium.launch({
    executablePath:CHROME, headless:true,
    args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"]
  });
  try {
    const context=await browser.newContext({
      userAgent:"Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      javaScriptEnabled:true
    });
    const page=await context.newPage();
    page.setDefaultNavigationTimeout(TIMEOUT);
    await page.route("**/*", async route => {
      try {
        const u=await safeUrl(route.request().url());
        await route.continue();
      } catch { await route.abort("blockedbyclient"); }
    });
    const original=new URL(url);
    try { await page.goto(url,{waitUntil:"domcontentloaded",timeout:TIMEOUT}); }
    catch (e) { if (!page.url() || page.url()==="about:blank") throw e; }
    const end=Date.now()+TIMEOUT;
    let last=page.url();
    while(Date.now()<end) {
      await page.waitForTimeout(1000);
      const now=page.url();
      if(now && now!=="about:blank") last=now;
      try {
        const host=new URL(last).hostname;
        if(host!==original.hostname && !supported(host)) {
          await safeUrl(last);
          return {success:true,destination:last,provider:original.hostname,method:"chromium"};
        }
      } catch {}
      const text=(await page.locator("body").innerText().catch(()=> "")).toLowerCase();
      if(/captcha|verify you are human|checking your browser|cloudflare challenge|robot or human/.test(text)) {
        return {success:false,needs_manual_verification:true,error:"Provider meminta verifikasi manusia/CAPTCHA. Selesaikan verifikasi secara manual; server tidak melewatinya."};
      }
    }
    if(last && last!=="about:blank" && last!==url) {
      const final=await safeUrl(last);
      if(final.hostname!==original.hostname && !supported(final.hostname)) return {success:true,destination:final.toString(),provider:original.hostname,method:"chromium"};
    }
    return {success:false,error:"Belum ada redirect tujuan yang terdeteksi. Link mungkin membutuhkan timer/token khusus atau verifikasi manual."};
  } finally { await browser.close(); }
}

const server=http.createServer(async (req,res)=>{
  if(req.method==="OPTIONS") return json(res,200,{success:true});
  if(req.url==="/health" && req.method==="GET") return json(res,200,{success:true,service:"XYBYPASS Termux Engine",runtime:"nodejs",browser:"playwright-chromium",providers:PROVIDERS.length});
  if(req.url==="/providers" && req.method==="GET") return json(res,200,{success:true,count:PROVIDERS.length,providers:PROVIDERS});
  if(req.url!=="/api/bypass" || req.method!=="POST") return json(res,404,{success:false,error:"Endpoint tidak ditemukan."});
  if(TOKEN && req.headers["x-xybypass-token"]!==TOKEN) return json(res,401,{success:false,error:"Token server salah."});
  try {
    const body=await readBody(req);
    if(typeof body.url!=="string" || body.url.length>2048) return json(res,400,{success:false,error:"Masukkan URL yang valid."});
    const u=await safeUrl(body.url);
    if(!supported(u.hostname)) return json(res,422,{success:false,error:"Domain belum ada di registry provider XYBYPASS.",supported:false});
    const result=await resolve(u.toString());
    return json(res,result.success?200:422,result);
  } catch(e) { return json(res,422,{success:false,error:e.message||"Bypass gagal."}); }
});
server.listen(PORT,"0.0.0.0",()=>console.log("XYBYPASS Termux Engine aktif di port "+PORT));
