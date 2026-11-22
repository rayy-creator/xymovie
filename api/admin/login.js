const crypto = require("node:crypto");
const ADMIN_EMAIL = "rayyimut098@gmail.com";
const ADMIN_PASSWORD = "1029384756";
const SIGNING_KEY = "XYDOWN-ADMIN-SESSION-2026-CHANGE-THIS-KEY";
function sign(value){return crypto.createHmac("sha256",SIGNING_KEY).update(value).digest("hex");}
module.exports = (req,res) => {
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({success:false,message:"Method tidak diizinkan."});
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const email=String(body.email||"").trim().toLowerCase();
  const password=String(body.password||"");
  const a=Buffer.from(email),b=Buffer.from(ADMIN_EMAIL),c=Buffer.from(password),d=Buffer.from(ADMIN_PASSWORD);
  const emailOk=a.length===b.length&&crypto.timingSafeEqual(a,b);
  const passOk=c.length===d.length&&crypto.timingSafeEqual(c,d);
  if(!emailOk||!passOk) return res.status(401).json({success:false,message:"Email atau kata sandi salah."});
  const payload=Buffer.from(JSON.stringify({sub:ADMIN_EMAIL,exp:Date.now()+8*60*60*1000})).toString("base64url");
  return res.status(200).json({success:true,token:payload+"."+sign(payload)});
};