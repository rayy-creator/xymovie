// XYDOWN download adapter. Configure a self-hosted Cobalt-compatible API in Vercel.
function send(res,status,data){res.setHeader("Cache-Control","no-store");return res.status(status).json(data)}
module.exports=async(req,res)=>{
 if(req.method==="OPTIONS"){res.setHeader("Access-Control-Allow-Origin","*");return res.status(204).end()}
 if(req.method!=="POST")return send(res,405,{success:false,error:"Gunakan POST."});
 const input=req.body&&req.body.url;
 let u;try{u=new URL(input)}catch{return send(res,400,{success:false,error:"URL tidak valid."})}
 if(u.protocol!=="https:")return send(res,400,{success:false,error:"Hanya URL HTTPS yang didukung."});
 const host=u.hostname.toLowerCase();
 const allowed=/((^|\.)instagram\.com$)|((^|\.)tiktok\.com$)|((^|\.)youtube\.com$)|((^|\.)youtu\.be$)/.test(host);
 if(!allowed)return send(res,400,{success:false,error:"Platform belum didukung."});
 const endpoint=(process.env.COBALT_API_URL||"").replace(/\/$/,"");
 if(!endpoint)return send(res,503,{success:false,error:"API belum dikonfigurasi. Admin perlu mengisi COBALT_API_URL di Vercel dengan URL instance Cobalt yang di-host sendiri."});
 try{
  const headers={"Accept":"application/json","Content-Type":"application/json"};
  if(process.env.COBALT_API_KEY)headers.Authorization="Api-Key "+process.env.COBALT_API_KEY;
  const upstream=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({url:u.toString(),videoQuality:"1080",filenameStyle:"pretty",downloadMode:"auto"}),signal:AbortSignal.timeout(55000)});
  const data=await upstream.json().catch(()=>null);
  if(!upstream.ok||!data)return send(res,502,{success:false,error:"Provider downloader sedang tidak tersedia (HTTP "+upstream.status+")."});
  if(data.status==="error")return send(res,422,{success:false,error:"Provider gagal memproses link: "+(data.error?.code||"coba lagi nanti")});
  if(data.status==="picker")return send(res,200,{success:true,status:"picker",picker:(data.picker||[]).map(x=>({url:x.url,filename:x.filename}))});
  if(data.status==="tunnel"||data.status==="redirect")return send(res,200,{success:true,status:data.status,url:data.url,filename:data.filename||"XYDOWN media"});
  return send(res,502,{success:false,error:"Respons provider tidak dikenali."});
 }catch(e){return send(res,504,{success:false,error:"Koneksi ke provider timeout atau gagal. Coba lagi nanti."})}
};