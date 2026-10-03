// 十、10.13.7.8（2026-10-03）：數據網頁(GET /dashboard)。單一HTML，自己用SVG畫圖，不引用任何外部程式庫或外部網站資源。
// 密碼只存sessionStorage；資料來自同網址的 /stats-summary 與 /usage-today(同一組USAGE_ADMIN_TOKEN)。所有日期時間以台灣時間呈現。
export const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>人生草稿 數據總覽</title>
<style>
:root{--paper:#F7F0E3;--card:#FAF4EA;--ink:#4A2E1F;--soft:#8A6F5E;--line:rgba(74,46,31,.16);--stamp:#C8553D;--blue:#3B7EA1;--danger:#A32D2D;
--serif:"Noto Serif TC","Songti TC","PMingLiU",serif;--sans:"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#1F1712;--card:#2A201A;--ink:#F1E6D6;--soft:#B49C89;--line:rgba(241,230,214,.18);--stamp:#E58B73;--blue:#6CB0D4;--danger:#E5736F}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5}
main{max-width:880px;margin:0 auto;padding:20px 16px 40px}
h1{font-family:var(--serif);font-size:22px;margin:0 0 4px}
.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:var(--soft);font-size:13px;margin-bottom:16px}
button{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
input{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;max-width:320px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card h2{font-size:14px;margin:0 0 6px;color:var(--soft);font-weight:600}
.big{font-family:var(--serif);font-size:34px;line-height:1.1}
.small{font-size:13px;color:var(--soft);margin-top:6px}
.small b{color:var(--ink);font-weight:600}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-top:12px}
.panel h2{font-size:14px;margin:0 0 8px;color:var(--soft);font-weight:600}
.legend{display:flex;gap:16px;font-size:13px;margin-bottom:6px;flex-wrap:wrap}
.legend i{display:inline-block;width:18px;height:0;border-top:3px solid;vertical-align:middle;margin-right:6px}
.err{color:var(--danger);font-size:14px}
#chart{width:100%;height:auto;display:block}
#login{max-width:360px;margin:60px auto}
#tip{position:fixed;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:13px;display:none;z-index:5}
.spend{margin-top:12px;font-size:14px}
</style></head><body><main>
<div id="login" hidden>
  <h1>人生草稿 數據總覽</h1>
  <p class="small">請輸入管理密碼</p>
  <form id="f"><input id="pw" type="password" autocomplete="current-password" aria-label="管理密碼"> <button type="submit">進入</button></form>
  <p id="loginErr" class="err"></p>
</div>
<div id="app" hidden>
  <h1>人生草稿 數據總覽</h1>
  <div class="bar"><span>最後更新：<span id="upd">—</span>（台灣時間）</span><button id="refresh">立即更新</button></div>
  <div class="cards" id="cards"></div>
  <div class="panel"><h2>近 30 天每日趨勢</h2><div id="trend"></div></div>
  <div class="panel spend" id="spend"></div>
</div>
<div id="tip"></div>
<script>
(function(){
var KEY="lifegame_dash_token",tok="";
try{tok=sessionStorage.getItem(KEY)||""}catch(e){}
var $=function(id){return document.getElementById(id)};
var NA="暫時無法取得";
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function api(path){return fetch(path,{headers:{Authorization:"Bearer "+tok},cache:"no-store"}).then(function(r){
  if(r.status===401){var e=new Error("auth");e.auth=true;throw e}
  if(!r.ok)throw new Error("http "+r.status);return r.json()})}
function num(n){return Number(n||0).toLocaleString("zh-TW")}
function card(title,big,bigLabel,s1,s2){
  return '<div class="card"><h2>'+title+'</h2><div class="big">'+num(big)+'</div><div class="small">'+bigLabel+'</div><div class="small">'+s1+'　'+s2+'</div></div>'}
function sm(label,v){return label+' <b>'+num(v)+'</b>'}
function renderCards(s){
  if(!s){$("cards").innerHTML='<div class="card"><h2>玩家與瀏覽</h2><div class="err">'+NA+'</div></div>';return}
  var f=s.players.free,p=s.players.paid,a=s.active,v=s.pageviews;
  $("cards").innerHTML=
    card("免費玩家",f.total,"累計",sm("今天新增",f.today),sm("近 7 天新增",f.last7))+
    card("付費玩家",p.total,"累計",sm("今天新增",p.today),sm("近 7 天新增",p.last7))+
    card("活躍玩家",a.today,"今天",sm("近 7 天",a.last7),"")+
    card("瀏覽人次",v.total,"累計"+(v.since?"（"+v.since+" 起）":""),sm("今天",v.today),sm("近 7 天",v.last7));
}
var SVGNS="http://www.w3.org/2000/svg";
function renderTrend(s){
  var box=$("trend");
  if(!s){box.innerHTML='<div class="err">'+NA+'</div>';return}
  var d=s.daily||[];
  if(!d.length){box.innerHTML='<div class="small">還沒有可顯示的資料</div>';return}
  var W=820,H=260,L=44,R=14,T=14,B=30,n=d.length;
  var max=1;d.forEach(function(x){max=Math.max(max,x.pageviews,x.new_players)});
  var step=Math.pow(10,Math.floor(Math.log10(max))),top=Math.ceil(max/step)*step;
  if(top/step<2)top=step*2;
  function X(i){return L+(n>1?i*(W-L-R)/(n-1):(W-L-R)/2)}
  function Y(v){return T+(H-T-B)*(1-v/top)}
  var g='';
  for(var k=0;k<=4;k++){var v=top*k/4,y=Y(v);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/><text x="'+(L-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="var(--soft)">'+Math.round(v)+'</text>'}
  var every=Math.max(1,Math.ceil(n/7));
  d.forEach(function(x,i){if(i%every===0||i===n-1)g+='<text x="'+X(i)+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" fill="var(--soft)">'+x.date.slice(5)+'</text>'});
  function line(key,color,dash){
    var pts=d.map(function(x,i){return X(i)+","+Y(x[key])}).join(" ");
    var dots=d.length<=3?d.map(function(x,i){return '<circle cx="'+X(i)+'" cy="'+Y(x[key])+'" r="4" fill="'+color+'" stroke="var(--card)" stroke-width="2"/>'}).join(""):"";
    return '<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>'+dots}
  g+=line("pageviews","var(--blue)")+line("new_players","var(--stamp)","6 4");
  g+='<line id="cur" x1="0" x2="0" y1="'+T+'" y2="'+(H-B)+'" stroke="var(--soft)" stroke-dasharray="2 3" visibility="hidden"/><rect id="hit" x="'+L+'" y="'+T+'" width="'+(W-L-R)+'" height="'+(H-T-B)+'" fill="transparent"/>';
  box.innerHTML='<div class="legend"><span><i style="border-color:var(--blue)"></i>每日瀏覽人次</span><span><i style="border-color:var(--stamp);border-top-style:dashed"></i>每日新增玩家</span></div>'+
    '<svg id="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="近 30 天每日瀏覽人次與新增玩家折線圖">'+g+'</svg>'+
    '<details class="small"><summary>以表格查看</summary><table style="border-collapse:collapse;margin-top:6px"><tr><th align="left">日期</th><th>瀏覽人次</th><th>新增玩家</th></tr>'+
    d.map(function(x){return '<tr><td>'+x.date+'</td><td align="right">'+num(x.pageviews)+'</td><td align="right">'+num(x.new_players)+'</td></tr>'}).join("")+'</table></details>';
  var svg=$("chart"),hit=$("hit"),cur=$("cur"),tip=$("tip");
  function move(ev){
    var r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)*W/r.width;
    var i=Math.max(0,Math.min(n-1,Math.round((px-L)/((W-L-R)/Math.max(1,n-1)))));
    cur.setAttribute("x1",X(i));cur.setAttribute("x2",X(i));cur.setAttribute("visibility","visible");
    tip.style.display="block";tip.style.left=Math.min(window.innerWidth-170,ev.clientX+12)+"px";tip.style.top=(ev.clientY+12)+"px";
    tip.innerHTML=d[i].date+"<br>瀏覽人次 <b>"+num(d[i].pageviews)+"</b><br>新增玩家 <b>"+num(d[i].new_players)+"</b>"}
  hit.addEventListener("pointermove",move);hit.addEventListener("pointerdown",move);
  hit.addEventListener("pointerleave",function(){tip.style.display="none";cur.setAttribute("visibility","hidden")});
}
function renderSpend(u){
  $("spend").innerHTML=u?('今日 AI 花費：<b>'+num(u.est_cost_twd)+'</b> ／ 每日上限 <b>'+num(u.daily_spend_cap_twd)+'</b>'):('今日 AI 花費：'+NA);
}
var busy=false;
function load(){
  if(busy)return;busy=true;
  return Promise.all([api("/stats-summary").catch(function(e){if(e.auth)throw e;return null}),api("/usage-today").catch(function(e){if(e.auth)throw e;return null})]).then(function(r){
    $("login").hidden=true;$("app").hidden=false;
    renderCards(r[0]);renderTrend(r[0]);renderSpend(r[1]);
    $("upd").textContent=new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false});
  }).catch(function(e){
    if(e&&e.auth){try{sessionStorage.removeItem(KEY)}catch(x){} tok="";$("app").hidden=true;$("login").hidden=false;$("loginErr").textContent="密碼錯誤"}
  }).then(function(){busy=false});
}
$("f").addEventListener("submit",function(ev){ev.preventDefault();tok=$("pw").value;try{sessionStorage.setItem(KEY,tok)}catch(e){} $("loginErr").textContent="";load()});
var cool=null;
$("refresh").addEventListener("click",function(){
  var b=$("refresh"),left=60;b.disabled=true;load();clearInterval(cool);
  b.textContent=left+" 秒後可再更新";
  cool=setInterval(function(){left--;if(left<=0){clearInterval(cool);b.disabled=false;b.textContent="立即更新"}else b.textContent=left+" 秒後可再更新"},1000)});
setInterval(function(){if(tok&&!document.hidden)load()},3600000);
if(tok)load();else $("login").hidden=false;
})();
</script></main></body></html>`;
