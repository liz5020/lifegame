// 十、10.13.7.8（2026-10-03）：數據網頁(GET /dashboard)。單一HTML，自己用SVG畫圖，不引用任何外部程式庫或外部網站資源。
// 2026-10-04（10.15.6）：新增名額卡片與唯讀「名冊」分頁；接受兩組密碼——存檔管理密碼可看數字與名冊，用量查詢密碼只能看數字。
// 密碼只存sessionStorage；資料來自同網址的 /stats-summary 與 /usage-today(同一組USAGE_ADMIN_TOKEN)；10.14.7起逐筆明細從 /usage-detail.csv 下載。所有日期時間以台灣時間呈現。
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
.unit{font-size:14px;margin-left:4px;color:var(--soft)}
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
.tabs{display:flex;gap:8px;margin-bottom:12px}
.tabs button[aria-selected=true]{background:var(--ink);color:var(--paper)}
table.r{border-collapse:collapse;width:100%;font-size:13px}
table.r th,table.r td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;white-space:nowrap}
.scroll{overflow-x:auto}
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
  <div class="tabs" role="tablist"><button id="tabNum" role="tab" aria-selected="true">數字</button><button id="tabRoster" role="tab" aria-selected="false">名冊</button></div>
  <div id="paneNum">
  <div class="cards" id="cards"></div>
  <div class="cards" id="cards2" style="margin-top:12px"></div>
  <div class="cards" id="cards3" style="margin-top:12px"></div>
  <div class="panel" id="ai"><h2>AI 實際用量（Anthropic 回報）</h2><div id="aiBody"></div>
    <div class="bar" style="margin:10px 0 0"><button id="dl">下載逐筆明細 CSV</button><span id="dlMsg">最近 7 天、最多 5,000 筆</span></div></div>
  <div class="panel"><h2>近 30 天每日趨勢</h2><div id="trend"></div></div>
  <div class="panel spend" id="spend"></div>
  </div>
  <div id="paneRoster" hidden><div class="panel"><h2>名冊（唯讀；每次打開這個分頁，系統會自動留一筆存取紀錄）</h2><div id="rosterBody"></div></div></div>
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
function n2(v){return v==null?"—":Number(v).toLocaleString("zh-TW",{maximumFractionDigits:2})}
function sm2(label,v){return label+' <b>'+n2(v)+'</b>'}
function card2(title,t,unit,note){
  return '<div class="card"><h2>'+title+'</h2><div class="big">'+n2(t.total)+'<span class="unit">'+unit+'</span></div><div class="small">累計'+(note||'')+'</div><div class="small">'+sm2("今天",t.today)+'　'+sm2("近 7 天",t.last7)+'</div></div>'}
function renderEntry(s){
  var box=$("cards3"),e=s&&s.entry;
  if(!e){box.innerHTML='<div class="card"><h2>封測名額</h2><div class="err">'+NA+'</div></div>';return}
  function c(t,big,sub){return '<div class="card"><h2>'+t+'</h2><div class="big">'+num(big)+'</div><div class="small">'+sub+'</div></div>'}
  box.innerHTML=
    c("今日名額",e.used,"已用／上限 <b>"+num(e.cap)+"</b>")+
    c("累計入場",e.cum,"人數／檢查點 <b>"+num(e.checkpoint)+"</b>")+
    c("候補排隊中",e.waiting,"人")+
    c("已通知未入場",e.notified,"人");
}
function renderUsage(s){
  var box=$("cards2");
  if(!s||!s.usage){box.innerHTML='<div class="card"><h2>花費與回合</h2><div class="err">'+NA+'</div></div>';return}
  var u=s.usage;
  box.innerHTML=
    card2("總耗費",u.cost,"元","（估計，自 "+(u.since||"—")+" 起）")+
    card2("總回合數",u.turns,"","")+
    card2("平均每位玩家花費",u.avg_cost_per_player,"元","（今天／近 7 天以活躍玩家計）")+
    card2("平均每位玩家回合數",u.avg_turns_per_player,"","（今天／近 7 天以活躍玩家計）")+
    card2("每回合平均花費",u.avg_cost_per_turn,"元","")+
    card2("綁定信箱人數",s.accounts_bound,"","")+
    card2("開啟人生段數",s.lives_started,"","（玩過至少一回合）");
}
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
// 十、10.14.7（2026-10-04）：伺服器記的AI實際用量；美元換算台幣只是參考(1美元≈32元)
function usd(v){return v==null?"—":"US$"+Number(v).toLocaleString("en-US",{maximumFractionDigits:4})}
function twd(v){return v==null?"":"（約 NT$"+n2(v*32)+"）"}
function renderAI(s){
  var box=$("aiBody"),a=s&&s.ai_usage;
  if(!a){box.innerHTML='<div class="err">'+NA+'</div>';return}
  var col=function(label,r){
    var kinds=Object.keys(r.by_kind).map(function(k){return esc(a.kind_labels[k]||k)+" "+num(r.by_kind[k])}).join("、")||"—";
    return '<div class="card"><h2>'+label+'</h2><div class="big">'+usd(r.usd)+'</div><div class="small">'+twd(r.usd)+'</div>'+
      '<div class="small">每回合平均 <b>'+usd(r.usd_per_turn)+'</b>'+twd(r.usd_per_turn)+'</div>'+
      '<div class="small">呼叫 <b>'+num(r.calls)+'</b> 次：'+kinds+'</div>'+
      '<div class="small">輸入 '+num(r.input)+'・快取寫入 '+num(r.cache_write)+'・快取讀取 '+num(r.cache_read)+'・輸出 '+num(r.output)+' token</div>'+
      '<div class="small">快取讀取佔輸入 <b>'+(r.cache_read_pct==null?"—":r.cache_read_pct+"%")+'</b></div></div>'};
  var b=a.balance,balHtml=b?('<div class="cards"><div class="card"><h2>估計剩餘可用</h2><div class="big">'+usd(b.remaining_usd)+'</div><div class="small">'+twd(b.remaining_usd)+'</div>'+
    '<div class="small">'+(b.days_left==null?"近 7 天沒有花費":'照近 7 天的花法，約還能撐 <b>'+b.days_left+'</b> 天')+'</div>'+
    '<div class="small">依上次校正的餘額 '+usd(b.set_usd)+' 扣掉之後的花費；和 Anthropic 帳單頁可能有小差距</div></div></div>'):
    ('<div class="small">還沒設定餘額。到 Cloudflare 後台設定 AI_BALANCE_USD（帳單頁餘額）與 AI_BALANCE_BASE_USD（填 '+usd(a.total.usd)+'，同一刻的累計花費）。</div>');
  box.innerHTML=balHtml+'<div class="cards">'+col("今天",a.today)+col("近 7 天",a.last7)+col("累計（"+(a.since||"—")+" 起）",a.total)+'</div>'+
    '<div class="small">每回合平均＝所有 AI 呼叫（含開場、重試、章節）的花費 ÷ 回合數。</div>';
}
$("dl").addEventListener("click",function(){
  var b=$("dl");b.disabled=true;$("dlMsg").textContent="下載中…";
  fetch("/usage-detail.csv",{headers:{Authorization:"Bearer "+tok},cache:"no-store"}).then(function(r){
    if(!r.ok)throw new Error("http "+r.status);
    var cd=r.headers.get("Content-Disposition")||"",m=/filename\\*=UTF-8''([^;]+)/.exec(cd);
    return r.blob().then(function(bl){var u=URL.createObjectURL(bl),x=document.createElement("a");x.href=u;x.download=m?decodeURIComponent(m[1]):"usage-detail.csv";document.body.appendChild(x);x.click();x.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000)})
  }).then(function(){$("dlMsg").textContent="已下載（最近 7 天、最多 5,000 筆）"},function(){$("dlMsg").textContent="下載失敗，請稍後再試"}).then(function(){b.disabled=false});
});
function renderSpend(u){
  $("spend").innerHTML=u?('今日 AI 花費：<b>'+num(u.est_cost_twd)+'</b> ／ 每日上限 <b>'+num(u.daily_spend_cap_twd)+'</b>'):('今日 AI 花費：'+NA);
}
function dt(ms){return ms?new Date(ms).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false}):""}
function dd(ms){return ms?new Date(ms).toLocaleDateString("zh-TW",{timeZone:"Asia/Taipei"}):""}
function loadRoster(){
  var box=$("rosterBody");box.textContent="載入中…";
  fetch("/admin/dashboard-roster",{headers:{Authorization:"Bearer "+tok},cache:"no-store"}).then(function(r){
    if(r.status===401){box.innerHTML='<div class="err">需要用存檔管理密碼登入</div>';return null}
    if(!r.ok)throw new Error("http "+r.status);return r.json()}).then(function(j){
    if(!j)return;
    var a=j.accounts||[];
    if(!a.length){box.innerHTML='<div class="small">還沒有綁定信箱的玩家</div>';return}
    box.innerHTML='<div class="scroll"><table class="r"><tr><th>信箱</th><th>綁定日期</th><th>人生數</th><th>最後存檔時間</th><th>候補狀態</th><th>留信箱日期</th><th>通知日期</th></tr>'+
      a.map(function(x){return '<tr><td>'+esc(x.email)+'</td><td>'+dd(x.bound_at)+'</td><td>'+num(x.lives)+'</td><td>'+dt(x.last_save)+'</td><td>'+esc(x.wl_status||"")+'</td><td>'+dd(x.joined_at)+'</td><td>'+dd(x.notified_at)+'</td></tr>'}).join("")+'</table></div>';
  }).catch(function(){box.innerHTML='<div class="err">'+NA+'</div>'});
}
function showTab(n){
  $("paneNum").hidden=n!=="num";$("paneRoster").hidden=n!=="roster";
  $("tabNum").setAttribute("aria-selected",n==="num");$("tabRoster").setAttribute("aria-selected",n==="roster");
  if(n==="roster")loadRoster();
}
$("tabNum").addEventListener("click",function(){showTab("num")});
$("tabRoster").addEventListener("click",function(){showTab("roster")});
var busy=false;
function load(){
  if(busy)return;busy=true;
  return Promise.all([api("/stats-summary").catch(function(e){if(e.auth)throw e;return null}),api("/usage-today").catch(function(e){if(e.auth)throw e;return null})]).then(function(r){
    $("login").hidden=true;$("app").hidden=false;
    renderCards(r[0]);renderEntry(r[0]);renderUsage(r[0]);renderAI(r[0]);renderTrend(r[0]);renderSpend(r[1]);
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
