const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns").promises;
const net = require("node:net");

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.XYBYPASS_TOKEN || "";
const TIMEOUT = Number(process.env.BYPASS_TIMEOUT || 20000);
const MAX_REDIRECTS = 12;
const MAX_BODY = 1024 * 1024;

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
      s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") ||
      s.startsWith("feb") || s.startsWith("::ffff:127.") ||
      s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
  }
  return true;
}
async function checkedUrl(raw) {
  const u=new URL(raw);
  if (!["http:","https:"].includes(u.protocol) || u.username || u.password) {
    throw new Error("URL tidak valid. Gunakan HTTP atau HTTPS.");
  }
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (host==="localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Host lokal ditolak.");
  }
  const records=net.isIP(host) ? [{address:host}] : await dns.lookup(host,{all:true,verbatim:true});
  if (!records.length || records.some(x=>privateIp(x.address))) {
    throw new Error("Alamat jaringan privat ditolak.");
  }
  return {url:u, address:records[0].address, family:net.isIP(records[0].address)};
}
function supported(host) {
  return PROVIDERS.some(d => host===d || host.endsWith("."+d));
}
function requestOnce(raw) {
  return new Promise(async (resolve,reject)=>{
    let checked;
    try { checked=await checkedUrl(raw); } catch(e) { return reject(e); }
    const u=checked.url;
    const transport=u.protocol==="https:"?https:http;
    const options={
      protocol:u.protocol, hostname:u.hostname, port:u.port || undefined,
      path:u.pathname+u.search, method:"GET",
      headers:{
        "user-agent":"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
        "accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding":"identity",
        "connection":"close"
      },
      lookup:(hostname,opts,cb)=>cb(null,checked.address,checked.family),
      servername:u.hostname
    };
    const req=transport.request(options,res=>{
      const chunks=[]; let size=0;
      res.on("data",chunk=>{
        size+=chunk.length;
        if(size>MAX_BODY){req.destroy(new Error("Respons terlalu besar."));return;}
        chunks.push(chunk);
      });
      res.on("end",()=>resolve({
        status:res.statusCode||0,
        headers:res.headers,
        body:Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.setTimeout(TIMEOUT,()=>req.destroy(new Error("Koneksi timeout.")));
    req.on("error",reject);
    req.end();
  });
}
function htmlRedirect(body, base) {
  let m=body.match(/<meta[^>]+http-equiv\\s*=\\s*["']?refresh["']?[^>]+content\\s*=\\s*["'][^"']*url\\s*=\\s*([^"'\\s>]+)/i);
  if(!m) m=body.match(/<meta[^>]+content\\s*=\\s*["'][^"']*url\\s*=\\s*([^"'\\s>]+)[^>]+http-equiv\\s*=\\s*["']?refresh/i);
  if(m) { try{return new URL(m[1].replace(/[;'"\\]]+$/,""),base).toString();}catch{} }
  const patterns=[
    /(?:window\\.)?location\\.replace\\(\\s*["']([^"']+)["']\\s*\\)/i,
    /(?:window\\.)?location\\.assign\\(\\s*["']([^"']+)["']\\s*\\)/i,
    /(?:window\\.)?location\\.href\\s*=\\s*["']([^"']+)["']/i,
    /(?:window\\.)?location\\s*=\\s*["']([^"']+)["']/i
  ];
  for(const re of patterns){const x=body.match(re);if(x){try{return new URL(x[1],base).toString();}catch{}}}
  return null;
}
async function resolve(start) {
  let current=start;
  const origin=new URL(start);
  for(let hop=0;hop<MAX_REDIRECTS;hop++){
    const response=await requestOnce(current);
    const location=response.headers.location;
    if(location){
      const next=new URL(location,current).toString();
      const checked=await checkedUrl(next);
      if(checked.url.hostname!==origin.hostname && !supported(checked.url.hostname)){
        return {success:true,destination:checked.url.toString(),provider:origin.hostname,method:"http-redirect",hops:hop+1};
      }
      current=checked.url.toString();
      continue;
    }
    const text=response.body.toLowerCase();
    if(/captcha|verify you are human|checking your browser|cloudflare challenge|robot or human|security check/.test(text)){
      return {success:false,needs_manual_verification:true,error:"Provider meminta CAPTCHA atau verifikasi manusia. Selesaikan secara manual."};
    }
    const next=htmlRedirect(response.body,current);
    if(next){
      const checked=await checkedUrl(next);
      if(checked.url.hostname!==origin.hostname && !supported(checked.url.hostname)){
        return {success:true,destination:checked.url.toString(),provider:origin.hostname,method:"html-or-js",hops:hop+1};
      }
      current=checked.url.toString();
      continue;
    }
    return {success:false,error:"Redirect tujuan tidak ditemukan. Link mungkin membutuhkan timer, token, cookie, atau interaksi manual."};
  }
  return {success:false,error:"Batas redirect tercapai."};
}
async function readBody(req) {
  let s="";
  for await(const chunk of req){s+=chunk;if(s.length>8192)throw new Error("Body terlalu besar.");}
  return JSON.parse(s||"{}");
}

http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS") return json(res,200,{success:true});
  if(req.url==="/health" && req.method==="GET") return json(res,200,{
    success:true,service:"XYBYPASS Android Engine",runtime:"nodejs",
    browser:"not-required",providers:PROVIDERS.length
  });
  if(req.url==="/providers" && req.method==="GET") return json(res,200,{
    success:true,count:PROVIDERS.length,providers:PROVIDERS
  });
  if(req.url!=="/api/bypass" || req.method!=="POST") {
    return json(res,404,{success:false,error:"Endpoint tidak ditemukan."});
  }
  if(TOKEN && req.headers["x-xybypass-token"]!==TOKEN) {
    return json(res,401,{success:false,error:"Token server salah."});
  }
  try{
    const body=await readBody(req);
    if(typeof body.url!=="string" || body.url.length>2048) {
      return json(res,400,{success:false,error:"Masukkan URL yang valid."});
    }
    const checked=await checkedUrl(body.url);
    if(!supported(checked.url.hostname)) {
      return json(res,422,{success:false,error:"Domain belum ada di registry XYBYPASS.",supported:false});
    }
    const result=await resolve(checked.url.toString());
    return json(res,result.success?200:422,result);
  }catch(e){
    return json(res,422,{success:false,error:e.message||"Proses gagal."});
  }
}).listen(PORT,"0.0.0.0",()=>console.log("XYBYPASS Android Engine aktif pada port "+PORT));
