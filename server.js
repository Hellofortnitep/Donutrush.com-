'use strict';
// DonutSMP Casino — UNOFFICIAL fan-made project. 18+. Deposits/withdrawals use DonutSMP in-game money, confirmed manually by the owner by email. Zero-dependency Node backend (Node 18+).
// The server owns balances and decides every game result. The browser only animates what the server returns.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DB_FILE=path.join(__dirname,'data.json'),SECRET_FILE=path.join(__dirname,'.secret');
const MIN=1e5,MAX=2.5e9,START=+(process.env.START_COINS||0),CLAIM=250000,CLAIM_MS=5*60e3,WD_MAX=5e8,
 OWNER_EMAIL=process.env.OWNER_EMAIL||'Henry1212uhuh@Gmail.com',PAY_TO=process.env.PAY_TO||'Hellofortnitep',BASE=process.env.BASE_URL||('http://localhost:'+PORT);
const secret=process.env.SESSION_SECRET||(fs.existsSync(SECRET_FILE)?fs.readFileSync(SECRET_FILE,'utf8'):(()=>{const s=crypto.randomBytes(32).toString('hex');fs.writeFileSync(SECRET_FILE,s,{mode:0o600});return s})());
let db={users:{},txs:{}};try{db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch{}db.txs=db.txs||{};
let dirty=false;const save=()=>{dirty=true},flush=()=>{if(dirty){dirty=false;fs.writeFileSync(DB_FILE+'.tmp',JSON.stringify(db));fs.renameSync(DB_FILE+'.tmp',DB_FILE)}};
setInterval(flush,1000).unref();for(const s of['SIGINT','SIGTERM'])process.on(s,()=>{flush();process.exit(0)});
const mask=e=>e.split('@')[0].slice(0,2)+'***',EMAIL=/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/,IGN=/^[A-Za-z0-9_.]{3,16}$/,fmt=n=>n>=1e9?+(n/1e9).toFixed(2)+'b':n>=1e6?+(n/1e6).toFixed(2)+'m':n>=1e3?+(n/1e3).toFixed(2)+'k':''+n;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),hashPw=(p,salt)=>crypto.scryptSync(p,salt,64).toString('hex');
const sign=u=>{const p=Buffer.from(JSON.stringify({u,exp:Date.now()+7*864e5})).toString('base64url');return p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url')};
function verify(t){try{const[p,s]=String(t).split('.'),e=crypto.createHmac('sha256',secret).update(p).digest('base64url');if(s.length!==e.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e)))return null;const d=JSON.parse(Buffer.from(p,'base64url'));return d.exp>Date.now()?d.u:null}catch{return null}}
const hits=new Map();const limited=(k,n,ms)=>{const now=Date.now(),a=(hits.get(k)||[]).filter(t=>now-t<ms);a.push(now);hits.set(k,a);return a.length>n};
setInterval(()=>hits.clear(),6e5).unref();
// ---- provably fair RNG: HMAC(serverSeed, clientSeed:nonce:i) ----
const fl=(u,i)=>crypto.createHmac('sha256',u.seed).update(`${u.cseed}:${u.nonce}:${i}`).digest().readUInt32BE(0)/4294967296;
const RED=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36],col=n=>n==0?'g':RED.includes(n)?'r':'k';
const CT={starter:[[.35,.2],[.3,.5],[.2,1],[.1,2],[.04,5],[.01,17]],nether:[[.55,.2],[.25,.8],[.12,1.5],[.05,4],[.025,8],[.005,20]],end:[[.7,.1],[.2,1],[.06,3],[.03,6],[.009,15],[.001,225]]};
const BOTS=['CreeperKing','AlexMiner','NetherNick','EnderQueen','DiamondDan','PixelPete','GoldenGolem','RedstoneRay','ObsidianOli','BlazeBella','SteveSMP','WitherWill'];
function jackpot(f,bet){const n=3+Math.floor(f(1)*3),P=[{name:'You',amt:bet}];for(let i=0;i<n;i++)P.push({name:BOTS[(Math.floor(f(2+i*2)*BOTS.length)+i)%BOTS.length],amt:Math.max(1000,Math.floor(bet*(.3+f(3+i*2)*2.5)/1000)*1000)});
 const tot=P.reduce((a,p)=>a+p.amt,0);let x=f(0)*tot,w=0;for(;w<P.length-1&&x>=P[w].amt;w++)x-=P[w].amt;return{P,tot,w}}
const GAMES={
 coinflip:(f,o)=>({m:(f(0)<.5?'heads':'tails')==(o.side=='tails'?'tails':'heads')?1.98:0}),
 crash:(f,o)=>{const t=Math.min(1000,Math.max(1.01,+o.target||2)),x=Math.max(1,Math.floor(99/(1-f(0)))/100);return{m:x>=t?t:0}},
 cases:(f,o)=>{const t=CT[o.tier];if(!t)throw Error('Unknown case');let a=f(0),i=0;while(i<t.length-1&&a>=t[i][0]){a-=t[i][0];i++}return{m:t[i][1]}},
 jackpot:(f,o,bet)=>{const j=jackpot(f,bet);return{m:j.w==0?j.tot*.95/bet:0}},
 roulette:(f,o,bet)=>{const n=Math.floor(f(0)*37),B=o.bets||{};let tot=0,ret=0;
  for(const k in B){const a=B[k];if(!/^(n([0-9]|[12][0-9]|3[0-6])|red|black|even|odd|low|high|d[1-3]|c[1-3])$/.test(k)||!Number.isInteger(a)||a<=0)throw Error('Invalid bet');tot+=a;
   ret+=a*(k=='n'+n?36:k=='red'?(col(n)=='r'?2:0):k=='black'?(col(n)=='k'?2:0):k=='even'?(n>0&&n%2==0?2:0):k=='odd'?(n%2==1?2:0):k=='low'?(n>=1&&n<=18?2:0):k=='high'?(n>=19?2:0):k[0]=='d'?(n>0&&Math.ceil(n/12)==+k[1]?3:0):k[0]=='c'?(n>0&&(n%3||3)==+k[1]?3:0):0)}
  if(tot!==bet)throw Error('Stake mismatch');return{m:ret/bet}}};
// ---- http helpers ----
const send=(res,c,o,h={})=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...h});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e4){no(Error('Too large'));req.destroy()}});req.on('end',()=>{try{ok(d?JSON.parse(d):{})}catch{no(Error('Bad JSON'))}});});
const cookie=t=>`sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${t?604800:0}`+(process.env.HTTPS?'; Secure':'');
const authed=req=>{const m=/(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie||'');const n=m&&verify(m[1]);return n&&db.users[n]?db.users[n]:null};
const pub=u=>({user:mask(u.email),email:u.email,dep:u.dep||0,bal:u.bal,wag:u.wag,profit:u.profit,hist:u.hist.slice(0,25),seedHash:sha(u.seed),nonce:u.nonce,nextClaim:u.claimAt+CLAIM_MS});
const NAME=/^[A-Za-z0-9_]{3,16}$/;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ADMIN=process.env.ADMIN_TOKEN||sha(secret+'admin').slice(0,24);
const ttok=id=>crypto.createHmac('sha256',secret).update('tx:'+id).digest('base64url').slice(0,32);
const tlink=(tx,a)=>`${BASE}/admin/tx/${tx.id}?t=${ttok(tx.id)}${a?'&a='+a:''}`;
const page=h=>`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#0b0b0d;color:#eee;max-width:520px;margin:40px auto;padding:0 16px;line-height:1.5">${h}</body>`;
const btn=(v,l,c,hot)=>`<button name="a" value="${v}" style="font-size:18px;padding:14px 22px;margin:6px 6px 6px 0;border:0;border-radius:10px;background:${c};color:#fff;${hot?'outline:3px solid #fff;':'opacity:.8;'}cursor:pointer">${l}</button>`;
async function mail(subject,html,links){console.log('\n[MAIL to '+OWNER_EMAIL+'] '+subject+'\n'+links.join('\n')+'\n');if(!process.env.RESEND_API_KEY)return;
 try{await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM||'DonutSMP Casino <onboarding@resend.dev>',to:[OWNER_EMAIL],subject,html})})}catch(e){console.log('mail failed:',e.message)}}
function notify(tx){const dep=tx.type=='deposit',y=tlink(tx,'yes'),n=tlink(tx,'no');
 const html=dep?`<p><b>${esc(tx.email)}</b> (DonutSMP name: <b>${esc(tx.ign)}</b>) says they paid <b>${fmt(tx.amt)}</b> to <b>${esc(PAY_TO)}</b>.</p><p>Did you get the money?</p><p><a href="${y}">✅ YES, I got it</a> &nbsp; <a href="${n}">❌ NO, I did not</a></p>`
 :`<p><b>${esc(tx.email)}</b> wants to withdraw <b>${fmt(tx.amt)}</b>.</p><p>In DonutSMP run: <code>/pay ${esc(tx.ign)} ${tx.amt}</code></p><p><a href="${y}">✅ I PAID them</a> &nbsp; <a href="${n}">❌ Reject and refund</a></p>`;
 return mail((dep?'Deposit check: ':'Withdrawal to pay: ')+fmt(tx.amt)+' from '+tx.ign,html,[dep?'YES: '+y:'PAID: '+y,(dep?'NO:  ':'REJECT: ')+n])}
function resolveTx(tx,a){if(tx.status!=='pending')return;const u=db.users[tx.email];
 if(tx.type=='deposit'){if(a=='yes'&&u){u.bal+=tx.amt;u.dep=(u.dep||0)+tx.amt;tx.status='approved'}else tx.status='rejected'}
 else{if(a=='yes')tx.status='paid';else{if(u)u.bal+=tx.amt;tx.status='rejected'}}tx.done=Date.now();save()}
const raw=req=>new Promise(ok=>{let d='';req.on('data',c=>{if(d.length<2e3)d+=c});req.on('end',()=>ok(d))});
async function admin(req,res,url){const q=new URL(req.url,'http://x').searchParams;
 if(url==='/admin'){if(q.get('token')!==ADMIN)return res.writeHead(403).end('Forbidden');const P=Object.values(db.txs).filter(t=>t.status=='pending');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page('<h2>Pending requests</h2>'+(P.map(t=>`<p>${t.type=='deposit'?'💰 Deposit':'🏧 Withdraw'} ${fmt(t.amt)} · ${esc(t.email)} · ${esc(t.ign)} · <a style="color:#ffc93c" href="${tlink(t)}">open</a></p>`).join('')||'<p>None 🎉</p>')))}
 const m=/^\/admin\/tx\/([a-f0-9]{16})$/.exec(url),tx=m&&db.txs[m[1]];if(!tx||q.get('t')!==ttok(tx.id))return res.writeHead(403).end('Invalid or expired link');
 if(req.method==='POST'){const a=new URLSearchParams(await raw(req)).get('a');if(a!=='yes'&&a!=='no')return res.writeHead(400).end('Bad request');resolveTx(tx,a);}
 const dep=tx.type=='deposit',pre=q.get('a');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY'});
 return res.end(page(`<h2>${dep?'💰 Deposit':'🏧 Withdrawal'}: ${fmt(tx.amt)}</h2><p>${esc(tx.email)}<br>DonutSMP name: <b>${esc(tx.ign)}</b></p>`+(tx.status!=='pending'?`<p style="font-size:20px">Status: <b>${tx.status.toUpperCase()}</b></p>`:
  `<p>${dep?`Did <b>${esc(tx.ign)}</b> pay <b>${fmt(tx.amt)}</b> to <b>${esc(PAY_TO)}</b>?`:`Run <code>/pay ${esc(tx.ign)} ${tx.amt}</code> in DonutSMP, then confirm.`}</p><form method="POST">${btn('yes',dep?'✅ Yes, I got it':'✅ I paid them','#16a34a',pre!=='no')}${btn('no',dep?'❌ No':'❌ Reject (refund)','#dc2626',pre==='no')}</form>`)))}
http.createServer(async(req,res)=>{const ip=req.socket.remoteAddress,url=req.url.split('?')[0];
 try{
  if(req.method==='GET'&&(url==='/'||url==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  if(url==='/admin'||url.startsWith('/admin/'))return admin(req,res,url);
  if(!url.startsWith('/api/'))return send(res,404,{error:'Not found'});
  if(req.method==='GET'&&url==='/api/leaderboard')return send(res,200,Object.values(db.users).sort((a,b)=>b.profit-a.profit).slice(0,10).map(u=>({user:mask(u.email),profit:u.profit,wag:u.wag})));
  if(req.method==='GET'&&url==='/api/me'){const u=authed(req);return send(res,200,u?pub(u):{guest:true})}
  if(req.method==='GET'&&url==='/api/txs'){const u=authed(req);if(!u)return send(res,401,{error:'Please log in'});return send(res,200,Object.values(db.txs).filter(t=>t.email==u.email).sort((a,b)=>b.ts-a.ts).slice(0,20).map(({id,type,amt,ign,status,ts})=>({id,type,amt,ign,status,ts})))}
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  const b=await body(req);
  if(url==='/api/register'||url==='/api/login'){if(limited('a'+ip,10,6e4))return send(res,429,{error:'Too many attempts, slow down'});
   const em=String(b.email||'').trim().toLowerCase(),p=String(b.pass||'');if(!EMAIL.test(em)||em.length>100)return send(res,400,{error:'Enter a valid email address'});
   let u=db.users[em];
   if(url==='/api/register'){if(b.age!==true)return send(res,400,{error:'You must confirm you are 18 or older'});if(u)return send(res,400,{error:'That email is already registered'});if(p.length<8||p.length>100)return send(res,400,{error:'Password must be 8+ characters'});
    const salt=crypto.randomBytes(16).toString('hex');u=db.users[em]={email:em,salt,hash:hashPw(p,salt),bal:START,wag:0,profit:0,dep:0,hist:[],seed:crypto.randomBytes(32).toString('hex'),cseed:crypto.randomBytes(6).toString('hex'),nonce:0,claimAt:0,created:Date.now()};save()}
   else{if(!u||!crypto.timingSafeEqual(Buffer.from(hashPw(p,u.salt)),Buffer.from(u.hash)))return send(res,401,{error:'Wrong email or password'})}
   return send(res,200,pub(u),{'Set-Cookie':cookie(sign(em))})}
  if(url==='/api/logout')return send(res,200,{ok:1},{'Set-Cookie':cookie('')});
  const u=authed(req);if(!u)return send(res,401,{error:'Please log in'});
  if(url==='/api/deposit'||url==='/api/withdraw'){const dep=url==='/api/deposit',amt=b.amount,ign=String(b.ign||'').trim();
   if(limited('m'+u.email,10,6e4))return send(res,429,{error:'Slow down'});
   if(!Number.isInteger(amt)||amt<MIN||amt>(dep?1e12:WD_MAX))return send(res,400,{error:dep?'Deposit must be at least 100k':'Withdraw between 100k and 500m per request'});
   if(!IGN.test(ign))return send(res,400,{error:'Enter your exact DonutSMP username'});
   if(Object.values(db.txs).filter(t=>t.email==u.email&&t.status=='pending').length>=5)return send(res,400,{error:'You have too many pending requests'});
   if(!dep){if(amt>u.bal)return send(res,400,{error:'Not enough coins'});if(u.wag<(u.dep||0))return send(res,400,{error:'Wager at least '+fmt(u.dep)+' (your total deposits) before withdrawing'});u.bal-=amt}
   const id=crypto.randomBytes(8).toString('hex'),tx=db.txs[id]={id,type:dep?'deposit':'withdraw',email:u.email,ign,amt,status:'pending',ts:Date.now()};save();notify(tx);return send(res,200,{ok:1,bal:u.bal,id})}
  if(url==='/api/claim'){if(!process.env.FREE_COINS)return send(res,400,{error:'Free coins are disabled'});if(Date.now()-u.claimAt<CLAIM_MS)return send(res,400,{error:'Free coins not ready yet'});u.claimAt=Date.now();u.bal+=CLAIM;save();return send(res,200,pub(u))}
  if(url==='/api/seed/rotate'){const old=u.seed;u.seed=crypto.randomBytes(32).toString('hex');u.nonce=0;save();return send(res,200,{oldSeed:old,seedHash:sha(u.seed)})}
  if(url==='/api/play'){if(limited('p'+u.name,60,6e4))return send(res,429,{error:'Slow down'});
   const g=GAMES[b.game],bet=b.bet;if(!g)return send(res,400,{error:'Unknown game'});
   if(!Number.isInteger(bet)||bet<MIN||bet>MAX)return send(res,400,{error:'Bet must be 100k to 2.5b'});if(bet>u.bal)return send(res,400,{error:'Not enough coins'});
   const F=Array.from({length:14},(_,i)=>fl(u,i));let r;try{r=g(i=>F[i],b.opts||{},bet)}catch(e){return send(res,400,{error:e.message})}
   u.nonce++;const win=Math.floor(bet*r.m);u.bal+=win-bet;u.wag+=bet;u.profit+=win-bet;u.hist.unshift({g:b.game,bet,win,t:Date.now()});u.hist.length=Math.min(u.hist.length,50);save();
   return send(res,200,{floats:F,m:r.m,win,bal:u.bal})}
  send(res,404,{error:'Not found'})
 }catch(e){send(res,400,{error:e.message||'Bad request'})}
}).listen(PORT,()=>console.log('DonutSMP Casino (unofficial, 18+) on http://localhost:'+PORT));
