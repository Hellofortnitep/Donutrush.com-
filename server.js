'use strict';
// DonutSMP Casino — UNOFFICIAL fan-made project. 18+. Deposits/withdrawals use DonutSMP in-game money, confirmed manually by the owner by email. Zero-dependency Node backend (Node 18+).
// The server owns balances and decides every game result. The browser only animates what the server returns.
const net=require('net'),tls=require('tls'),http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DATA=process.env.DATA_DIR||__dirname,DB_FILE=path.join(DATA,'data.json'),SECRET_FILE=path.join(DATA,'.secret');
const MIN=1e5,MAX=2.5e9,START=+(process.env.START_COINS||0),CLAIM=250000,CLAIM_MS=5*60e3,WD_MAX=5e8,
 OWNER_EMAIL=process.env.OWNER_EMAIL||'henry1212uhuh@gmail.com',PAY_TO=process.env.PAY_TO||'Hellofortnitep',BASE=process.env.BASE_URL||('http://localhost:'+PORT);
const secret=process.env.SESSION_SECRET||(fs.existsSync(SECRET_FILE)?fs.readFileSync(SECRET_FILE,'utf8'):(()=>{const s=crypto.randomBytes(32).toString('hex');fs.writeFileSync(SECRET_FILE,s,{mode:0o600});return s})());
let db={users:{},txs:{}};try{db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch{}db.txs=db.txs||{};
let dirty=false;const save=()=>{dirty=true},flush=()=>{if(dirty){dirty=false;fs.writeFileSync(DB_FILE+'.tmp',JSON.stringify(db));fs.renameSync(DB_FILE+'.tmp',DB_FILE)}};
setInterval(flush,1000).unref();
const RL=+(process.env.RAIN_MS||120000),RAIN_MIN_WAG=+(process.env.RAIN_MIN_WAG||1e6);db.chat=db.chat||[];db.chatId=db.chatId||0;db.rain=db.rain||{pot:0,join:[],ends:Date.now()+RL};for(const s of['SIGINT','SIGTERM'])process.on(s,()=>{flush();process.exit(0)});
const mask=e=>e.split('@')[0].slice(0,2)+'***',EMAIL=/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/,IGN=/^[A-Za-z0-9_.]{3,16}$/,fmt=n=>n>=1e9?+(n/1e9).toFixed(2)+'b':n>=1e6?+(n/1e6).toFixed(2)+'m':n>=1e3?+(n/1e3).toFixed(2)+'k':''+n;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),hashPw=(p,salt)=>crypto.scryptSync(p,salt,64).toString('hex');
const sign=u=>{const p=Buffer.from(JSON.stringify({u,v:(db.users[u]&&db.users[u].sv)||0,exp:Date.now()+7*864e5})).toString('base64url');return p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url')};
function verify(t){try{const[p,s]=String(t).split('.'),e=crypto.createHmac('sha256',secret).update(p).digest('base64url');if(s.length!==e.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e)))return null;const d=JSON.parse(Buffer.from(p,'base64url'));return d.exp>Date.now()?d:null}catch{return null}}
const ipOf=req=>process.env.RENDER||process.env.TRUST_PROXY?String(req.headers['x-forwarded-for']||'').split(',').pop().trim()||req.socket.remoteAddress:req.socket.remoteAddress;
const rank=w=>w>=1e10?'DIAMOND':w>=1e9?'GOLD':w>=1e8?'SILVER':w>=1e7?'BRONZE':'';
const hits=new Map();const limited=(k,n,ms)=>{const now=Date.now(),a=(hits.get(k)||[]).filter(t=>now-t<ms);a.push(now);hits.set(k,a);return a.length>n};
setInterval(()=>hits.clear(),6e5).unref();
// ---- provably fair RNG: HMAC(serverSeed, clientSeed:nonce:i) ----
const fl=(u,i,n)=>crypto.createHmac('sha256',u.seed).update(`${u.cseed}:${n===undefined?u.nonce:n}:${i}`).digest().readUInt32BE(0)/4294967296;
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
const TB={low:[5.6,2.1,1.1,1,.5,1,1.1,2.1,5.6],med:[13,3,1.3,.7,.4,.7,1.3,3,13],high:[29,4,1.5,.3,.2,.3,1.5,4,29]},ST={towers:2/3,chicken:.85,lava:.75,stripmine:.8};
const ci=(v,a,b,d)=>Math.min(b,Math.max(a,Math.floor(+v)||d)),Cn=(n,k)=>{let r=1;for(let i=0;i<k;i++)r=r*(n-i)/(i+1);return r};
const kt=n=>{const t=Math.max(1,Math.ceil(n/2));let sw=0;for(let h=t;h<=n;h++)sw+=2**h;const o={};for(let h=t;h<=n;h++)o[h]=.99*(2**h/sw)/(Cn(n,h)*Cn(40-n,10-h)/Cn(40,10));return o};
const lim=(f,o)=>{const t=Math.min(1000,Math.max(1.01,+o.target||2)),x=Math.max(1,Math.floor(99/(1-f(0)))/100);return{m:x>=t?t:0}};
Object.assign(GAMES,{
 limbo:lim,
 dice:(f,o)=>{const t=ci(o.target,2,98,50),ov=o.mode!='under',n=Math.floor(f(0)*10000)/100,c=ov?100-t:t;return{m:(ov?n>t:n<t)?99/c:0}},
 mines:(f,o)=>{const m=ci(o.mines,1,20,3),k=ci(o.picks,1,5,3);let p=1;for(let i=0;i<k;i++)p*=(25-m-i)/(25-i);return{m:f(0)<p?.99/p:0}},
 plinko:(f,o)=>{const t=TB[o.risk];if(!t)throw Error('Bad risk level');let k=0;for(let i=0;i<8;i++)k+=f(i)>.5?1:0;return{m:t[k]}},
 rps:(f,o)=>{const b=ci(o.pick,0,2,0),a=Math.floor(f(0)*3);return{m:a==b?1:(b-a+3)%3==1?1.97:0}},
 pigrace:(f,o)=>({m:Math.floor(f(0)*4)+1==ci(o.pick,1,4,1)?3.96:0}),
 upgrader:(f,o)=>{const t=ci(o.target,15,200,30)/10,p=.99/t;return{m:f(0)<p?.99/p:0}},
 stocks:(f,o)=>({m:(f(0)<.5?'up':'down')==(o.pick=='down'?'down':'up')?1.98:0}),
 draw:f=>{const a=Math.floor(f(0)*13)+1,b=Math.floor(f(1)*13)+1;return{m:a>b?1.98:a==b?1:0}},
 double:(f,o)=>{const t=[2,3,5,50].includes(+o.target)?+o.target:2,p=.99/t;return{m:f(0)<p?.99/p:0}},
 keno:(f,o)=>{const A=Array.isArray(o.picks)?o.picks.map(Number):[],P=[...new Set(A)].filter(x=>Number.isInteger(x)&&x>=1&&x<=40);if(P.length<1||P.length>6||P.length!==A.length)throw Error('Pick 1 to 6 numbers');const a=[...Array(40).keys()].map(x=>x+1);let h=0;for(let i=0;i<10;i++){const j=i+Math.floor(f(i)*(40-i));[a[i],a[j]]=[a[j],a[i]];if(P.includes(a[i]))h++}return{m:kt(P.length)[h]||0}}});
for(const g in ST)GAMES[g]=(f,o)=>{const s=ST[g],L=ci(o.steps,1,10,3),c=Math.floor(Math.log(f(0)||1e-9)/Math.log(s)),p=s**L;return{m:c>=L?.99/p:0}};
// ---- blackjack + crash (multi-step, server keeps the state) ----
const settle=(u,g,bet,win)=>{u.bal+=win;u.wag+=bet;u.profit+=win-bet;u.hist.unshift({g,bet,win,t:Date.now()});u.hist.length=Math.min(u.hist.length,50);u.nonce++;save()};
const betOk=(u,bet)=>!Number.isInteger(bet)||bet<MIN||bet>MAX?'Bet must be 100k to 2.5b':bet>u.bal?'Not enough coins':null;
const bvv=h=>{let t=0,a=0;for(const n of h){const r=n%13;t+=r==0?(a++,11):r>=9?10:r+1}while(t>21&&a>0){t-=10;a--}return t};
const bjCard=(u,b)=>Math.floor(fl(u,100+b.i++,b.n)*52);
const bjView=(u,b,done,x)=>({p:b.p,d:done?b.d:[b.d[0]],pv:bvv(b.p),dv:done?bvv(b.d):null,done,bal:u.bal,...x});
function bjEnd(u,b,m,msg){const win=Math.floor(b.bet*m);settle(u,'blackjack',b.bet,win);u.bj=null;return bjView(u,b,true,{m,win,msg})}
function bjStand(u,b){while(bvv(b.d)<17)b.d.push(bjCard(u,b));const a=bvv(b.p),d=bvv(b.d);return bjEnd(u,b,d>21||a>d?2:a==d?1:0,d>21?'Dealer busts':a>d?'You win':a==d?'Push':'Dealer wins')}
function crSettle(u,cash){const c=u.cr,m=Math.exp(.25*(Date.now()-c.t0)/1000),auto=c.auto>1?c.auto:Infinity,cp=Math.min(c.x,auto);
 if(m>=cp||cash){let win=0,fm=m;if(m>=cp){if(auto<=c.x){win=Math.floor(c.bet*auto);fm=auto}else fm=c.x}else win=Math.floor(c.bet*m);settle(u,'crash',c.bet,win);u.cr=null;return{done:true,m:fm,x:c.x,win,bal:u.bal}}
 return{done:false,m}}
// ---- live chat + rain ----
const say=m=>{m.id=++db.chatId;m.ts=Date.now();db.chat.push(m);if(db.chat.length>150)db.chat.splice(0,db.chat.length-150);save()};
setInterval(()=>{const r=db.rain;if(Date.now()<r.ends)return;const n=r.join.length;if(n&&r.pot>0){const sh=Math.floor(r.pot/n);if(sh>0){for(const e of r.join)if(db.users[e])db.users[e].bal+=sh;r.pot-=sh*n;say({kind:'rain',text:'🌧️ Rain! '+n+' player'+(n>1?'s':'')+' each got '+fmt(sh)})}r.join=[]}r.ends=Date.now()+RL;save()},1000).unref();
// ---- http helpers ----
const send=(res,c,o,h={})=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...h});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e4){no(Error('Too large'));req.destroy()}});req.on('end',()=>{try{ok(d?JSON.parse(d):{})}catch{no(Error('Bad JSON'))}});});
const cookie=t=>`sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${t?604800:0}`+(process.env.HTTPS||process.env.RENDER?'; Secure':'');
const authed=req=>{const m=/(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie||'');const d=m&&verify(m[1]);const u=d&&db.users[d.u];if(!u||u.banned||(u.sv||0)!==(d.v||0))return null;u.seen=Date.now();return u};
const pub=u=>({rank:rank(u.wag),user:mask(u.email),email:u.email,dep:u.dep||0,bal:u.bal,wag:u.wag,profit:u.profit,hist:u.hist.slice(0,25),seedHash:sha(u.seed),nonce:u.nonce,nextClaim:u.claimAt+CLAIM_MS});
const NAME=/^[A-Za-z0-9_]{3,16}$/;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ADMIN=process.env.ADMIN_TOKEN||sha(secret+'admin').slice(0,24);
const ttok=id=>crypto.createHmac('sha256',secret).update('tx:'+id).digest('base64url').slice(0,32);
const tlink=(tx,a)=>`${BASE}/admin/tx/${tx.id}?t=${ttok(tx.id)}${a?'&a='+a:''}`;
const page=(h,w)=>`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#0b0b0d;color:#eee;max-width:${w||520}px;margin:40px auto;padding:0 16px;line-height:1.5">${h}</body>`;
const btn=(v,l,c,hot)=>`<button name="a" value="${v}" style="font-size:18px;padding:14px 22px;margin:6px 6px 6px 0;border:0;border-radius:10px;background:${c};color:#fff;${hot?'outline:3px solid #fff;':'opacity:.8;'}cursor:pointer">${l}</button>`;
function smtp(o){return new Promise((ok,no)=>{const B=x=>Buffer.from(x).toString('base64');let i=-1,buf='',done=false;
 const sock=o.secure?tls.connect({host:o.host,port:o.port,servername:o.host}):net.connect({host:o.host,port:o.port});
 const fin=e=>{if(done)return;done=true;try{sock.destroy()}catch{}e?no(e):ok()};sock.setTimeout(20000,()=>fin(new Error('SMTP timeout')));sock.on('error',fin);
 const body=[`From: DonutRush <${o.from}>`,`To: ${o.to}`,`Subject: =?UTF-8?B?${B(o.subject)}?=`,'MIME-Version: 1.0','Content-Type: text/html; charset=utf-8','Content-Transfer-Encoding: base64','',B(o.html).replace(/(.{76})/g,'$1\r\n')].join('\r\n');
 const st=[['EHLO donutcasino','250'],...(o.user?[['AUTH LOGIN','334'],[B(o.user),'334'],[B(o.pass),'235']]:[]),[`MAIL FROM:<${o.from}>`,'250'],[`RCPT TO:<${o.to}>`,'250'],['DATA','354'],[body+'\r\n.','250'],['QUIT','221']];
 sock.on('data',d=>{buf+=d;let m;while((m=/^(\d{3})([ -])[^\r\n]*\r\n/.exec(buf))){buf=buf.slice(m[0].length);if(m[2]=='-')continue;const exp=i<0?'220':st[i][1];if(m[1]!==exp)return fin(new Error('SMTP said '+m[0].trim()+' (expected '+exp+')'));i++;if(i>=st.length)return fin();sock.write(st[i][0]+'\r\n');if(st[i][0]=='QUIT')return fin()}})})}
const mailCfg=()=>{const g=process.env.GMAIL_USER&&process.env.GMAIL_APP_PASSWORD;
 if(g)return{host:'smtp.gmail.com',port:465,secure:true,user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD.replace(/\s/g,''),from:process.env.GMAIL_USER};
 if(process.env.SMTP_HOST)return{host:process.env.SMTP_HOST,port:+process.env.SMTP_PORT||465,secure:process.env.SMTP_SECURE!=='0',user:process.env.SMTP_USER,pass:process.env.SMTP_PASS,from:process.env.MAIL_FROM||process.env.SMTP_USER||'casino@localhost'};return null};
async function mail(subject,html,links){console.log('\n[MAIL] '+subject+'\n'+links.join('\n')+'\n');
 const c=mailCfg(),R=process.env.RESEND_API_KEY,D=process.env.DISCORD_WEBHOOK_URL,ok=[],errs=[];
 if(D){try{const r=await fetch(D,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:('**'+subject+'**\n'+links.join('\n')).slice(0,1900)})});if(!r.ok)throw new Error('Discord '+r.status);ok.push('discord')}catch(e){errs.push(e.message)}}
 if(c||R){for(let t=1;t<=2;t++){try{if(c)await smtp({...c,to:OWNER_EMAIL,subject,html});else{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+R,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM||'DonutRush <onboarding@resend.dev>',to:[OWNER_EMAIL],subject,html})});if(!r.ok)throw new Error('Resend '+r.status)}ok.push('email');break}catch(e){errs.push(e.message);if(t==1)await new Promise(r=>setTimeout(r,8000))}}}
 if(ok.length){console.log('[MAIL] sent via '+ok.join('+'));return 'sent via '+ok.join('+')}
 const why=errs.length?errs.join('; '):'NOT CONFIGURED (set DISCORD_WEBHOOK_URL, or GMAIL_USER + GMAIL_APP_PASSWORD)';console.log('[MAIL] FAILED: '+why);return 'FAILED: '+why}
function notify(tx){const dep=tx.type=='deposit',y=tlink(tx,'yes'),n=tlink(tx,'no');
 const html=dep?`<p><b>${esc(tx.email)}</b> (DonutSMP name: <b>${esc(tx.ign)}</b>) says they paid <b>${fmt(tx.amt)}</b> to <b>${esc(PAY_TO)}</b>.</p><p>Did you get the money?</p><p><a href="${y}">✅ YES, I got it</a> &nbsp; <a href="${n}">❌ NO, I did not</a></p>`
 :`<p><b>${esc(tx.email)}</b> wants to withdraw <b>${fmt(tx.amt)}</b>.</p><p>In DonutSMP run: <code>/pay ${esc(tx.ign)} ${tx.amt}</code></p><p><a href="${y}">✅ I PAID them</a> &nbsp; <a href="${n}">❌ Reject and refund</a></p>`;
 return mail((dep?'Deposit check: ':'Withdrawal to pay: ')+fmt(tx.amt)+' from '+tx.ign,html,[dep?'YES: '+y:'PAID: '+y,(dep?'NO:  ':'REJECT: ')+n]).then(r=>{tx.mail=r;save()})}
function resolveTx(tx,a){if(tx.status!=='pending')return;const u=db.users[tx.email];
 if(tx.type=='deposit'){if(a=='yes'&&u){u.bal+=tx.amt;u.dep=(u.dep||0)+tx.amt;tx.status='approved'}else tx.status='rejected'}
 else{if(a=='yes')tx.status='paid';else{if(u)u.bal+=tx.amt;tx.status='rejected'}}tx.done=Date.now();save()}
const raw=req=>new Promise(ok=>{let d='';req.on('data',c=>{if(d.length<2e3)d+=c});req.on('end',()=>ok(d))});
const safeEq=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b)};
async function admin(req,res,url){const q=new URL(req.url,'http://x').searchParams;
 if(url==='/admin/test-email'){if(q.get('token')!==ADMIN)return res.writeHead(403).end('Forbidden');const r=await mail('Test message from DonutRush','<p>If you can read this, deposit and withdrawal emails will reach you. ✅</p>',['(test)']);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page('<h2>Test email</h2><p>Sent to <b>'+esc(OWNER_EMAIL)+'</b>: <b>'+esc(r||'FAILED, see server console')+'</b></p><p>Check your inbox and spam folder.</p>'))}
 if(/^\/admin\/(reset|setbalance|ban|unban|kick|mute|unmute)$/.test(url)&&req.method==='POST'){const F=new URLSearchParams(await raw(req));if(!safeEq(F.get('token')||'',ADMIN))return res.writeHead(403).end('Forbidden');
  const u=db.users[String(F.get('email')||'').toLowerCase()];if(!u)return res.writeHead(404).end('No such player');const act=url.split('/')[2];
  if(act=='reset')u.bal=0;else if(act=='setbalance'){const a=Math.floor(+F.get('amount'));if(!(a>=0&&a<=1e13))return res.writeHead(400).end('Bad amount');u.bal=a}
  else if(act=='ban'){u.banned=true;u.sv=(u.sv||0)+1}else if(act=='unban')u.banned=false;else if(act=='kick')u.sv=(u.sv||0)+1;else if(act=='mute')u.muted=true;else u.muted=false;
  console.log('[ADMIN] '+act+' '+u.email);save();res.writeHead(303,{Location:'/admin?token='+encodeURIComponent(ADMIN)});return res.end()}
 if(url==='/admin'){if(!safeEq(q.get('token')||'',ADMIN))return res.writeHead(403).end('Forbidden');const P=Object.values(db.txs).filter(t=>t.status=='pending'),T=encodeURIComponent(ADMIN);
  const fm=(act,e,l,extra='',c='#444')=>`<form method="POST" action="/admin/${act}" style="display:inline"><input type="hidden" name="token" value="${esc(ADMIN)}"><input type="hidden" name="email" value="${esc(e)}">${extra}<button style="background:${c};color:#fff;border:0;border-radius:6px;padding:5px 9px;margin:2px;cursor:pointer">${l}</button></form>`;
  const rows=Object.values(db.users).sort((a,b)=>b.bal-a.bal).map(u=>`<tr><td>${esc(u.email)}${u.banned?' 🚫':''}${u.muted?' 🔇':''}</td><td>${u.bal.toLocaleString()}</td><td>${fmt(u.wag)}</td><td>${fmt(u.dep||0)}</td><td>${fm('reset',u.email,'Reset to 0','','#b45309')}${fm('setbalance',u.email,'Set','<input name="amount" placeholder="amount" style="width:90px">','#2563eb')}${fm(u.banned?'unban':'ban',u.email,u.banned?'Unblock':'Block','',u.banned?'#16a34a':'#dc2626')}${fm('kick',u.email,'Log out','')}${fm(u.muted?'unmute':'mute',u.email,u.muted?'Unmute':'Mute chat','')}</td></tr>`).join('');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY','Cache-Control':'no-store'});
  return res.end(page('<h2>Pending requests</h2>'+(P.map(t=>`<p>${t.type=='deposit'?'💰 Deposit':'🏧 Withdraw'} ${fmt(t.amt)} · ${esc(t.email)} · ${esc(t.ign)} · email: ${esc(t.mail||'?')} · <a style="color:#ffc93c" href="${tlink(t)}">open</a></p>`).join('')||'<p>None 🎉</p>')+`<h2>Players (${Object.keys(db.users).length})</h2><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px" border="0" cellpadding="6"><tr style="text-align:left;color:#aaa"><th>Email</th><th>Balance</th><th>Wagered</th><th>Deposited</th><th>Actions</th></tr>${rows}</table></div><p style="color:#888;font-size:12px">Rain pot: ${fmt(db.rain.pot)} · Keep this page's address private.</p>`,980))}
 const m=/^\/admin\/tx\/([a-f0-9]{16})$/.exec(url),tx=m&&db.txs[m[1]];if(!tx||q.get('t')!==ttok(tx.id))return res.writeHead(403).end('Invalid or expired link');
 if(req.method==='POST'){const a=new URLSearchParams(await raw(req)).get('a');if(a!=='yes'&&a!=='no')return res.writeHead(400).end('Bad request');resolveTx(tx,a);}
 const dep=tx.type=='deposit',pre=q.get('a');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY'});
 return res.end(page(`<h2>${dep?'💰 Deposit':'🏧 Withdrawal'}: ${fmt(tx.amt)}</h2><p>${esc(tx.email)}<br>DonutSMP name: <b>${esc(tx.ign)}</b></p>`+(tx.status!=='pending'?`<p style="font-size:20px">Status: <b>${tx.status.toUpperCase()}</b></p>`:
  `<p>${dep?`Did <b>${esc(tx.ign)}</b> pay <b>${fmt(tx.amt)}</b> to <b>${esc(PAY_TO)}</b>?`:`Run <code>/pay ${esc(tx.ign)} ${tx.amt}</code> in DonutSMP, then confirm.`}</p><form method="POST">${btn('yes',dep?'✅ Yes, I got it':'✅ I paid them','#16a34a',pre!=='no')}${btn('no',dep?'❌ No':'❌ Reject (refund)','#dc2626',pre==='no')}</form>`)))}
http.createServer(async(req,res)=>{const ip=ipOf(req),url=req.url.split('?')[0];
 try{
  if(req.method==='GET'&&(url==='/'||url==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  if(url==='/admin'||url.startsWith('/admin/'))return admin(req,res,url);
  if(!url.startsWith('/api/'))return send(res,404,{error:'Not found'});
  if(req.method==='GET'&&url==='/api/leaderboard')return send(res,200,Object.values(db.users).sort((a,b)=>b.profit-a.profit).slice(0,10).map(u=>({user:mask(u.email),profit:u.profit,wag:u.wag})));
  if(req.method==='GET'&&url==='/api/me'){const u=authed(req);return send(res,200,u?pub(u):{guest:true})}
  if(req.method==='GET'&&url==='/api/txs'){const u=authed(req);if(!u)return send(res,401,{error:'Please log in'});return send(res,200,Object.values(db.txs).filter(t=>t.email==u.email).sort((a,b)=>b.ts-a.ts).slice(0,20).map(({id,type,amt,ign,status,ts})=>({id,type,amt,ign,status,ts})))}
  if(req.method==='GET'&&url==='/api/live'){const u=authed(req);if(!u)return send(res,401,{error:'Please log in'});const since=+new URL(req.url,'http://x').searchParams.get('since')||0,r=db.rain;
   return send(res,200,{msgs:db.chat.filter(m=>m.id>since).slice(-60),rain:{pot:r.pot,n:r.join.length,left:Math.max(0,r.ends-Date.now()),me:r.join.includes(u.email),len:RL},online:Object.values(db.users).filter(x=>Date.now()-(x.seen||0)<30000).length,bal:u.bal})}
  if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
  const b=await body(req);
  if(url==='/api/register'||url==='/api/login'){if(limited('a'+ip,10,6e4))return send(res,429,{error:'Too many attempts, slow down'});
   const em=String(b.email||'').trim().toLowerCase(),p=String(b.pass||'');if(!EMAIL.test(em)||em.length>100)return send(res,400,{error:'Enter a valid email address'});
   let u=db.users[em];
   if(url==='/api/register'){if(b.age!==true)return send(res,400,{error:'You must confirm you are 18 or older'});if(u)return send(res,400,{error:'That email is already registered'});if(p.length<8||p.length>100)return send(res,400,{error:'Password must be 8+ characters'});
    const salt=crypto.randomBytes(16).toString('hex');u=db.users[em]={email:em,salt,hash:hashPw(p,salt),bal:START,wag:0,profit:0,dep:0,hist:[],seed:crypto.randomBytes(32).toString('hex'),cseed:crypto.randomBytes(6).toString('hex'),nonce:0,claimAt:0,created:Date.now()};save()}
   else{if(!u||!crypto.timingSafeEqual(Buffer.from(hashPw(p,u.salt)),Buffer.from(u.hash)))return send(res,401,{error:'Wrong email or password'});if(u.banned)return send(res,403,{error:'This account is blocked'})}
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
  if(url==='/api/chat'){if(u.muted)return send(res,403,{error:'You are muted'});if(limited('c'+u.email,5,10000))return send(res,429,{error:'Slow down'});
   const t=String(b.text||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200);if(!t)return send(res,400,{error:'Empty message'});say({name:mask(u.email),rk:rank(u.wag),text:t});return send(res,200,{ok:1})}
  if(url==='/api/rain/tip'){const a=b.amount;if(!Number.isInteger(a)||a<10000||a>u.bal)return send(res,400,{error:'Tip at least 10k and no more than your balance'});u.bal-=a;db.rain.pot+=a;say({kind:'tip',name:mask(u.email),amt:a});save();return send(res,200,{bal:u.bal})}
  if(url==='/api/rain/join'){if(u.wag<RAIN_MIN_WAG)return send(res,400,{error:'Wager at least '+fmt(RAIN_MIN_WAG)+' to join the rain'});if(!db.rain.join.includes(u.email))db.rain.join.push(u.email);save();return send(res,200,{ok:1})}
  if(url==='/api/bj/start'){if(u.bj)return send(res,200,bjView(u,u.bj,false,{resumed:1}));const bet=b.bet,e=betOk(u,bet);if(e)return send(res,400,{error:e});
   u.bal-=bet;const j=u.bj={bet,p:[],d:[],i:0,n:u.nonce};j.p.push(bjCard(u,j),bjCard(u,j));j.d.push(bjCard(u,j),bjCard(u,j));save();
   if(bvv(j.p)==21){const dv=bvv(j.d)==21;return send(res,200,bjEnd(u,j,dv?1:2.5,dv?'Push, both blackjack':'Blackjack!'))}return send(res,200,bjView(u,j,false))}
  if(url==='/api/bj/hit'||url==='/api/bj/stand'){const j=u.bj;if(!j)return send(res,400,{error:'No active hand'});
   if(url.endsWith('hit')){j.p.push(bjCard(u,j));if(bvv(j.p)>21)return send(res,200,bjEnd(u,j,0,'Bust'));save();if(bvv(j.p)<21)return send(res,200,bjView(u,j,false))}return send(res,200,bjStand(u,j))}
  if(url==='/api/crash/start'){if(u.cr){const r=crSettle(u,false);if(!r.done)return send(res,400,{error:'Finish your current crash round first'})}const bet=b.bet,e=betOk(u,bet);if(e)return send(res,400,{error:e});
   u.bal-=bet;u.cr={bet,x:Math.max(1,Math.floor(99/(1-fl(u,200)))/100),t0:Date.now(),auto:+b.target>1?Math.min(1000,+b.target):0};save();return send(res,200,{ok:1,bal:u.bal})}
  if(url==='/api/crash/poll'){if(limited('cr'+u.email,900,6e4))return send(res,429,{error:'Slow down'});if(!u.cr)return send(res,400,{error:'No active round'});return send(res,200,crSettle(u,!!b.cash))}
  if(url==='/api/claim'){if(!process.env.FREE_COINS)return send(res,400,{error:'Free coins are disabled'});if(Date.now()-u.claimAt<CLAIM_MS)return send(res,400,{error:'Free coins not ready yet'});u.claimAt=Date.now();u.bal+=CLAIM;save();return send(res,200,pub(u))}
  if(url==='/api/seed/rotate'){if(u.bj||u.cr)return send(res,400,{error:'Finish your current round first'});const old=u.seed;u.seed=crypto.randomBytes(32).toString('hex');u.nonce=0;save();return send(res,200,{oldSeed:old,seedHash:sha(u.seed)})}
  if(url==='/api/play'){if(limited('p'+u.email,60,6e4))return send(res,429,{error:'Slow down'});
   const g=GAMES[b.game],bet=b.bet;if(!g)return send(res,400,{error:'Unknown game'});
   if(!Number.isInteger(bet)||bet<MIN||bet>MAX)return send(res,400,{error:'Bet must be 100k to 2.5b'});if(bet>u.bal)return send(res,400,{error:'Not enough coins'});
   const F=Array.from({length:14},(_,i)=>fl(u,i));let r;try{r=g(i=>F[i],b.opts||{},bet)}catch(e){return send(res,400,{error:e.message})}
   u.nonce++;const win=Math.floor(bet*r.m);u.bal+=win-bet;u.wag+=bet;u.profit+=win-bet;u.hist.unshift({g:b.game,bet,win,t:Date.now()});u.hist.length=Math.min(u.hist.length,50);save();
   return send(res,200,{floats:F,m:r.m,win,bal:u.bal})}
  send(res,404,{error:'Not found'})
 }catch(e){send(res,400,{error:e.message||'Bad request'})}
}).listen(PORT,()=>{console.log('DonutRush (unofficial DonutSMP fan project, 18+) on http://localhost:'+PORT);console.log('Owner emails go to: '+OWNER_EMAIL);console.log(mailCfg()||process.env.RESEND_API_KEY||process.env.DISCORD_WEBHOOK_URL?'Notifications: configured. Test it at '+BASE+'/admin/test-email?token='+ADMIN:'WARNING: NOTIFICATIONS ARE NOT CONFIGURED, so you will NOT hear about deposits. Set DISCORD_WEBHOOK_URL or GMAIL_USER + GMAIL_APP_PASSWORD (see README).');console.log('Admin page: '+BASE+'/admin?token='+ADMIN);if(process.env.RENDER&&!process.env.DATA_DIR)console.log('WARNING: no DATA_DIR set. On Render, files are erased on every deploy/restart unless you attach a Disk, so balances will be lost. See README.')});
