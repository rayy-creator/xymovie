/* ====== CONFIG: isi bagian ini ====== */
const C={
  TMDB:"6d01e46a929577fd5e0df621f675d00e",
  SB_URL:"https://xkcmieqdrgtrgwumoxfr.supabase.co",        // contoh: https://xxxx.supabase.co
  SB_KEY:"sb_publishable_s5JVbGYq2VqS4iysK42-Bw_UZzozzyT",   // anon public key
  DB:"db/db.json",                  // atau link raw GitHub: https://raw.githubusercontent.com/USER/REPO/main/db/db.json
  WA:"https://wa.me/62XXXXXXXXXX",
  IG:"https://instagram.com/thntzy_",
  TG:"https://t.me/USERNAME",
  CH:"https://whatsapp.com/channel/ISI",
  DONATE:"https://sociabuzz.com/USERNAME"
};
/* ==================================== */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sb=C.SB_URL.startsWith("http")?supabase.createClient(C.SB_URL,C.SB_KEY):null;
const go=u=>location.replace(u);
const normPhone=s=>{let d=String(s).replace(/\D/g,"");if(d[0]=="0")d="62"+d.slice(1);else if(d[0]=="8")d="62"+d;return d};
const ls={get:()=>{try{return JSON.parse(localStorage.xy_seen||"[]")}catch{return[]}},set:a=>{try{localStorage.xy_seen=JSON.stringify(a)}catch{}}};
async function getDB(){
  try{
    const r=await fetch(C.DB+(C.DB.includes("?")?"&":"?")+"t="+Date.now(),{cache:"no-store"}),d=await r.json();
    return{accounts:d.accounts||[],notifications:d.notifications||[]};
  }catch{return{accounts:[],notifications:[]}}
}
const NAV=[["index.html","home","home","Beranda"],["playlist.html","playlist","bookmark","Playlist"],["riwayat.html","riwayat","clock","Riwayat"],["info.html","info","info","Info Dev"]];
async function boot(page){
  let u=null;
  if(sb)u=(await sb.auth.getSession()).data.session?.user||null;
  if(page=="login"){if(u)return go("index.html");document.body.hidden=false;return{}}
  if(!u)return go("login.html");
  const db=await getDB(),acc=db.accounts.find(a=>a.email?.toLowerCase()==u.email?.toLowerCase())||{};
  if(acc.banned){await sb.auth.signOut();return go("login.html?b=1")}
  let pf=null;try{pf=(await sb.from("profiles").select("username,phone,avatar").maybeSingle()).data}catch{}
  const seen=ls.get(),nw=db.notifications.filter(n=>!seen.includes(n.id)).length;
  const un=pf?.username||u.email.split("@")[0];
  $("#hd").innerHTML=`<a class="logo" href="index.html">XY <i>Movie</i></a><span class="sp"></span>${page=="home"?'<input id="q" type="search" placeholder="Cari film" aria-label="Cari film">':""}<a class="ib${page=="notif"?" on":""}" href="notifikasi.html" aria-label="Notifikasi">${ic("bell")}${nw?`<span class="bdg">${nw}</span>`:""}</a><a class="hav" href="profil.html" aria-label="Profil" style="${ppCss(un,pf?.avatar)}">${pf?.avatar?"":esc(un[0].toUpperCase())}</a>`;
  document.body.insertAdjacentHTML("beforeend",`<nav aria-label="Navigasi utama">${NAV.map(n=>`<a href="${n[0]}" aria-label="${n[3]}"${n[1]==page?' class="on" aria-current="page"':""}>${ic(n[2])}<span>${n[3]}</span></a>`).join("")}</nav>`);
  $("#ft").innerHTML="<b>XY OFFICIAL</b> by thntzy_<br>Data film dari TMDB. Produk ini memakai TMDB API tetapi tidak didukung atau disertifikasi oleh TMDB.";
  document.querySelectorAll("[data-k]").forEach(a=>a.href=C[a.dataset.k]);
  if(nw&&page!="notif"&&!sessionStorage.xy_t){
    sessionStorage.xy_t=1;
    document.body.insertAdjacentHTML("beforeend",`<div class="toast"><span>${nw} notifikasi baru</span><a href="notifikasi.html">Lihat</a></div>`);
    setTimeout(()=>$(".toast")?.remove(),8000);
  }
  document.body.hidden=false;
  return{u,acc,db,nw,pf};
}

/* ---- ikon, profil, util ---- */
const I={home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',bookmark:'<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const hue=s=>[...s].reduce((a,c)=>a+c.charCodeAt(0),0)*7%360;
const mask=e=>e.replace(/^(.).*(@.*)$/,"$1•••••$2");
const ppCss=(un,pp)=>pp?`background-image:url(${pp})`:`background:hsl(${hue(un)} 50% 40%)`;
const bnCss=(un,bn)=>bn?`background-image:url(${bn})`:`background:linear-gradient(135deg,hsl(${hue(un)} 55% 34%),hsl(${(hue(un)+60)%360} 60% 16%))`;
const shrink=(f,w,h)=>new Promise(r=>{const rd=new FileReader();rd.onload=()=>{const i=new Image();i.onload=()=>{const c=document.createElement("canvas");c.width=w;c.height=h;const s=Math.max(w/i.width,h/i.height);c.getContext("2d").drawImage(i,(w-i.width*s)/2,(h-i.height*s)/2,i.width*s,i.height*s);r(c.toDataURL("image/jpeg",.8))};i.src=rd.result};rd.readAsDataURL(f)});
const profView=(un,em,ph,role,pp,bn)=>`<div class="pf"><label class="bn" style="${bnCss(un,bn)}"><input type="file" accept="image/*" data-img="bn" hidden><span class="ed">Ubah banner</span></label><div class="pb"><label class="pp" style="${ppCss(un,pp)}"><input type="file" accept="image/*" data-img="pp" hidden>${pp?"":esc(un[0].toUpperCase())}<span class="cam">${ic("cam")}</span></label><h1>${esc(un)}</h1><p class="mu">${role}</p><div class="rw"><span>Email</span><span class="em"><span id="ev">${esc(mask(em))}</span><button class="ib" data-eye aria-label="Tampilkan email" aria-pressed="false">${ic("eye")}</button></span></div><div class="rw"><span>No HP</span><span>${ph?"+"+esc(ph):"Belum diisi"}</span></div><p id="pm" class="sm mu" role="status"></p><button class="btn g w" data-out>Keluar</button></div></div>`;
const eye=(b,em)=>{const s=$("#ev"),on=s.dataset.s!="1";s.dataset.s=on?"1":"";s.textContent=on?em:mask(em);b.innerHTML=ic(on?"eyeoff":"eye");b.setAttribute("aria-pressed",on);b.setAttribute("aria-label",on?"Sembunyikan email":"Tampilkan email")};
