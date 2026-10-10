// 十、10.13.7.8（2026-10-03）：數據網頁(GET /dashboard)。單一HTML，自己用SVG畫圖，不引用任何外部程式庫或外部網站資源。
// 2026-10-04（10.15.6）：新增名額卡片與唯讀「名冊」分頁；接受兩組密碼——存檔管理密碼可看數字與名冊，用量查詢密碼只能看數字。
// 2026-10-10（10.13.7.12）：分成三頁——總覽(合併重複卡片)、玩家怎麼玩(GET /stats-play，從逐筆明細現算)、名冊。
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
#cards,#cardsLives,#cards2{grid-template-columns:repeat(3,minmax(0,1fr))} /* 總覽三排都是三格、同寬對齊(2026-10-10) */
@media (max-width:620px){#cards,#cardsLives,#cards2{grid-template-columns:1fr}}
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
.tabs button[aria-selected=true],button[aria-pressed=true]{background:var(--ink);color:var(--paper)}
.hbar rect.b{fill:var(--blue)}.hbar rect.b:hover{fill:var(--stamp)}
.hbar text{font-size:11px;fill:var(--soft)}
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
  <div class="bar"><span>最後更新：<span id="upd">—</span>（台灣時間）</span><button id="refresh">立即更新</button><button id="dl">下載全部資料</button><span id="dlMsg">每日總表（從第一天起）＋逐筆明細（最近 7 天、最多 30,000 筆，請每隔幾天下載一次）</span></div>
  <div class="tabs" role="tablist"><button id="tabNum" role="tab" aria-selected="true">總覽</button><button id="tabPlay" role="tab" aria-selected="false">玩家怎麼玩</button><button id="tabRoster" role="tab" aria-selected="false">名冊</button></div>
  <div id="paneNum">
  <div class="cards" id="cards"></div>
  <div class="cards" id="cardsLives" style="margin-top:12px"></div>
  <div class="cards" id="cards2" style="margin-top:12px"></div>
  <div class="cards" id="cards3" style="margin-top:12px"></div>
  <div class="panel" id="ai"><h2>AI 花費</h2><div id="aiBody"></div></div>
  <div class="panel"><h2>近 30 天每日趨勢</h2><div id="trend"></div></div>
  <div class="panel spend" id="spend"></div>
  </div>
  <div id="panePlay" hidden>
    <div class="bar" style="margin-bottom:8px"><span>範圍：</span><button id="rgToday" aria-pressed="true">今天開局的人生</button><button id="rgWeek" aria-pressed="false">近 7 天</button><span class="small" style="margin:0">從 AI 逐筆明細算出（最多保留 7 天、30,000 筆）</span></div>
    <div id="playBody"></div>
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
    card2("總回合數",u.turns,"","（自 "+(u.since||"—")+" 起）")+
    card2("平均每位玩家花費",u.avg_cost_per_player,"元","（今天／近 7 天以活躍玩家計）")+
    card2("平均每位玩家回合數",u.avg_turns_per_player,"","（今天／近 7 天以活躍玩家計）")+
    "";
}
function renderCards(s){
  if(!s){$("cards").innerHTML='<div class="card"><h2>玩家與瀏覽</h2><div class="err">'+NA+'</div></div>';return}
  var f=s.players.free,p=s.players.paid,a=s.active,v=s.pageviews;
  $("cards").innerHTML=
    card("免費玩家",f.total,"累計",sm("今天新增",f.today),sm("近 7 天新增",f.last7))+
    (p.total>0?card("付費玩家",p.total,"累計",sm("今天新增",p.today),sm("近 7 天新增",p.last7)):"")+ // 開放購買前永遠是0，先不顯示
    card("活躍玩家",a.today,"今天",sm("近 7 天",a.last7),"")+
    card("瀏覽人次",v.total,"累計"+(v.since?"（"+v.since+" 起）":""),sm("今天",v.today),sm("近 7 天",v.last7));
  $("cardsLives").innerHTML=
    (s.accounts_bound?card2("綁定信箱人數",s.accounts_bound,"",""):"")+
    (s.lives_unbound?card2("沒綁信箱的人生段數",s.lives_unbound,"","（含之後結束的；綁了信箱就改算進帳號）"):"")+
    (s.lives_started?card2("開啟人生段數",s.lives_started,"","（玩過至少一回合）"):"")+
    '<div class="small" style="grid-column:1/-1;margin:0">玩家＝綁信箱的一個信箱算一位、沒綁的一段人生算一位；人生段數＝玩過至少一回合的人生，一位玩家可以有好幾段。</div>';
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
  var box=$("aiBody"),a=s&&s.ai_usage,u=s&&s.usage;
  if(!a){box.innerHTML='<div class="err">'+NA+'</div>';return}
  var col=function(label,r,key){
    var nt=u&&u.cost?u.cost[key]:null,pt=u&&u.avg_cost_per_turn?u.avg_cost_per_turn[key]:null;
    var kinds=Object.keys(r.by_kind).map(function(k){return esc(a.kind_labels[k]||k)+" "+num(r.by_kind[k])}).join("、")||"—";
    return '<div class="card"><h2>'+label+'</h2><div class="big">'+(nt==null?"—":n2(nt))+'<span class="unit">元</span></div><div class="small">Anthropic 回報 '+usd(r.usd)+'</div>'+
      '<div class="small">每回合平均 <b>'+(pt==null?"—":n2(pt)+" 元")+'</b>（'+usd(r.usd_per_turn)+'）</div>'+
      '<div class="small">呼叫 <b>'+num(r.calls)+'</b> 次：'+kinds+'</div>'+
      '<div class="small">輸入 '+num(r.input)+'・快取寫入 '+num(r.cache_write)+'・快取讀取 '+num(r.cache_read)+'・輸出 '+num(r.output)+' token</div>'+
      '<div class="small">快取讀取佔輸入 <b>'+(r.cache_read_pct==null?"—":r.cache_read_pct+"%")+'</b></div></div>'};
  var b=a.balance,balHtml=b?('<div class="cards"><div class="card"><h2>估計剩餘可用</h2><div class="big">'+usd(b.remaining_usd)+'</div><div class="small">'+twd(b.remaining_usd)+'</div>'+
    '<div class="small">'+(b.days_left==null?"近 7 天沒有花費":'照近 7 天的花法，約還能撐 <b>'+b.days_left+'</b> 天')+'</div>'+
    '<div class="small">依上次校正的餘額 '+usd(b.set_usd)+' 扣掉之後的花費；和 Anthropic 帳單頁可能有小差距</div></div></div>'):
    ('<div class="small">還沒設定餘額。到 Cloudflare 後台設定 AI_BALANCE_USD（帳單頁餘額）與 AI_BALANCE_BASE_USD（填 '+usd(a.total.usd)+'，同一刻的累計花費）。</div>');
  box.innerHTML=balHtml+'<div class="cards">'+col("今天",a.today,"today")+col("近 7 天",a.last7,"last7")+col("累計（"+(a.since||"—")+" 起）",a.total,"total")+'</div>'+
    '<div class="small">台幣＝實際花費換算（沒有回報用量的呼叫照預估）；每回合平均＝所有 AI 呼叫（含開場、重寫、章節）的花費 ÷ 回合數。台幣與美元的累計起算日可能不同。</div>';
}
// 十、10.14.7.1（2026-10-10）：今天自動重寫的比例與原因(代碼)，驗收目標：重寫低於一般回合的5%
function renderRegen(q){
  if(!q)return "";
  var list=function(arr){return arr&&arr.length?arr.map(function(x){return esc(x.code)+" "+num(x.n)}).join("、"):"—"};
  return '<div class="cards"><div class="card"><h2>今天的自動重寫</h2>'+
    '<div class="big">'+(q.pct==null?"—":q.pct+"%")+'</div>'+
    '<div class="small">重寫 '+num(q.regens)+' 次 ÷ 一般回合 '+num(q.turn_calls)+' 次（目標低於 5%）</div>'+
    '<table class="r"><tr><th>重寫原因前 5 名</th><td>'+list(q.reasons)+'</td></tr><tr><th>上回合紀錄前 5 名</th><td>'+list(q.notes)+'</td></tr></table></div></div>';
}
// 10.13.7.13（2026-10-10）：下載全部資料＝每日總表(永久保留)＋逐筆明細(最近7天)，依序下載兩個CSV
function dlFile(path,fallback){
  return fetch(path,{headers:{Authorization:"Bearer "+tok},cache:"no-store"}).then(function(r){
    if(!r.ok)throw new Error("http "+r.status);
    var cd=r.headers.get("Content-Disposition")||"",m=/filename\\*=UTF-8''([^;]+)/.exec(cd);
    return r.blob().then(function(bl){var u=URL.createObjectURL(bl),x=document.createElement("a");x.href=u;x.download=m?decodeURIComponent(m[1]):fallback;document.body.appendChild(x);x.click();x.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000)})})}
$("dl").addEventListener("click",function(){
  var b=$("dl");b.disabled=true;$("dlMsg").textContent="下載中…";
  dlFile("/daily.csv","daily.csv").then(function(){return dlFile("/usage-detail.csv","usage-detail.csv")})
  .then(function(){$("dlMsg").textContent="已下載兩個檔案：每日總表、逐筆明細"},function(){$("dlMsg").textContent="下載失敗，請稍後再試"}).then(function(){b.disabled=false});
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
    box.innerHTML='<div class="scroll"><table class="r"><tr><th>信箱</th><th>綁定日期</th><th>人生數</th><th>回合數</th><th>最後存檔時間</th><th>候補狀態</th><th>留信箱日期</th><th>通知日期</th></tr>'+
      a.map(function(x){return '<tr><td>'+esc(x.email)+'</td><td>'+dd(x.bound_at)+'</td><td>'+num(x.lives)+'</td><td>'+num(x.turns)+'</td><td>'+dt(x.last_save)+'</td><td>'+esc(x.wl_status||"")+'</td><td>'+dd(x.joined_at)+'</td><td>'+dd(x.notified_at)+'</td></tr>'}).join("")+'</table></div>';
  }).catch(function(){box.innerHTML='<div class="err">'+NA+'</div>'});
}
// 十、10.13.7.12（2026-10-10）：「玩家怎麼玩」分頁
var lastSummary=null,playRange="today";
function pct(v){return v==null?"—":(Math.round(v*1000)/10)+"%"}
function tile(t,big,sub){return '<div class="card"><h2>'+t+'</h2><div class="big">'+big+'</div><div class="small">'+(sub||"")+'</div></div>'}
// 直條圖：data[{label,value,tip}]；ref＝虛線參考值(例如重寫目標5%)
function bars(data,fmt,ref,aria){
  if(!data.length)return '<div class="small">還沒有資料</div>';
  var W=820,H=200,L=40,R=10,T=10,B=26,n=data.length,max=ref||0;
  data.forEach(function(d){max=Math.max(max,d.value||0)});if(!max)max=1;
  var bw=(W-L-R)/n,g='',every=Math.max(1,Math.ceil(n/12));
  for(var k=0;k<=2;k++){var v=max*k/2,y=T+(H-T-B)*(1-v/max);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/><text x="'+(L-4)+'" y="'+(y+4)+'" text-anchor="end">'+esc(fmt(v))+'</text>'}
  data.forEach(function(d,i){var h=(H-T-B)*((d.value||0)/max),x=L+i*bw;
    g+='<rect class="b" data-i="'+i+'" x="'+(x+bw*0.12)+'" y="'+(H-B-h)+'" width="'+Math.max(1,bw*0.76)+'" height="'+Math.max(0,h)+'" rx="2"/>';
    if(i%every===0)g+='<text x="'+(x+bw/2)+'" y="'+(H-8)+'" text-anchor="middle">'+esc(d.label)+'</text>'});
  if(ref){var ry=T+(H-T-B)*(1-ref/max);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+ry+'" y2="'+ry+'" stroke="var(--stamp)" stroke-dasharray="6 4"/>'}
  var id="b"+Math.random().toString(36).slice(2,8);
  setTimeout(function(){var svg=$(id),tip=$("tip");if(!svg)return;
    svg.addEventListener("pointermove",function(ev){var i=ev.target.getAttribute&&ev.target.getAttribute("data-i");if(i==null){tip.style.display="none";return}
      tip.style.display="block";tip.style.left=Math.min(window.innerWidth-190,ev.clientX+12)+"px";tip.style.top=(ev.clientY+12)+"px";tip.textContent=data[+i].tip});
    svg.addEventListener("pointerleave",function(){tip.style.display="none"})},0);
  return '<svg class="hbar" id="'+id+'" viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="'+esc(aria)+'">'+g+'</svg>';
}
var KIND={turn:"一般回合",retry:"失敗重試／重新生成",opening:"開場",chapter:"人生之書章節",idle:"放置摘要",review:"回顧這一生"};
function renderPlay(p){
  var box=$("playBody");
  if(!p){box.innerHTML='<div class="err">'+NA+'</div>';return}
  var m=p.summary,word=p.range==="7d"?"近 7 天":"今天";
  var h='<div class="cards">'+
    tile(word+"開局的人生",num(m.lives),"現在還在玩（10 分鐘內有動作） <b>"+num(m.playing_now)+"</b>")+
    tile("玩到第 10 回合",pct(m.reach10_rate),num(m.reach10)+" 條；回合數中位 <b>"+(m.median_turns==null?"—":m.median_turns)+"</b>、最多 <b>"+(m.max_turns==null?"—":m.max_turns)+"</b>")+
    tile("每回合花費",m.twd_per_turn==null?"—":n2(m.twd_per_turn)+'<span class="unit">元</span>',"不算重寫 <b>"+(m.twd_per_turn_no_retry==null?"—":n2(m.twd_per_turn_no_retry)+" 元")+"</b>；共 <b>"+n2(m.twd)+"</b> 元")+
    tile("重寫比例",pct(m.retry_rate),"重寫 "+num(m.retries)+" 次 ÷ 一般回合 "+num(m.turns)+" 次（目標低於 5%）")+'</div>';
  h+='<div class="panel"><h2>進場漏斗：玩到第 N 回合的人生數（開場是第 1 回合）</h2>'+bars(p.funnel.map(function(d){return{label:d.turn,value:d.lives,tip:"第 "+d.turn+" 回合："+d.lives+" 條（"+pct(m.lives?d.lives/m.lives:null)+"）"}}),function(v){return String(Math.round(v))},0,"進場漏斗")+'</div>';
  h+='<div class="panel"><h2>每關繼續比例：玩到第 N 回合的人，有玩下一回合的比例</h2>'+bars(p.continuation.map(function(d){return{label:d.turn,value:d.rate,tip:"第 "+d.turn+" → "+(d.turn+1)+" 回合："+pct(d.rate)+"（"+d.n+" 條）"}}),pct,0,"每關繼續比例")+
    '<div class="small">還在玩、而且剛好停在那一回合的人生還沒決定，不算進去。</div></div>';
  h+='<div class="panel"><h2>離開時停在哪裡（10 分鐘沒有動作的人生）</h2>'+bars(p.stops.map(function(d){return{label:d.label,value:d.lives,tip:d.label+"："+d.lives+" 條"}}),function(v){return String(Math.round(v))},0,"離開時停在哪裡")+'</div>';
  var tl=p.timeline;
  h+='<div class="panel"><h2>重寫比例（'+(p.range==="7d"?"每天":"每小時")+'；虛線是目標 5%）</h2>'+bars(tl.map(function(d){return{label:d.bucket,value:d.retry_rate||0,tip:d.bucket+"：重寫 "+d.retries+" ÷ 一般回合 "+d.turns+" ＝ "+pct(d.retry_rate)}}),pct,0.05,"重寫比例")+
    renderRegen(lastSummary&&lastSummary.ai_usage&&lastSummary.ai_usage.regen_today)+'</div>';
  h+='<div class="panel"><h2>'+(p.range==="7d"?"每天":"每小時")+'：新開局、回合與花費</h2><div class="scroll"><table class="r"><tr><th>'+(p.range==="7d"?"日期":"時段")+'</th><th>新開局</th><th>有在玩的人生</th><th>一般回合</th><th>重寫</th><th>重寫比例</th><th>花費（元）</th></tr>'+
    tl.map(function(d){return '<tr><td>'+esc(d.bucket)+'</td><td>'+num(d.new_lives)+'</td><td>'+num(d.lives)+'</td><td>'+num(d.turns)+'</td><td>'+num(d.retries)+'</td><td>'+pct(d.retry_rate)+'</td><td>'+n2(d.twd)+'</td></tr>'}).join("")+'</table></div></div>';
  h+='<div class="panel"><h2>花費結構</h2><table class="r"><tr><th>種類</th><th>次數</th><th>花費（元）</th><th>佔比</th></tr>'+
    p.cost_split.map(function(d){return '<tr><td>'+esc(KIND[d.kind]||d.kind)+'</td><td>'+num(d.calls)+'</td><td>'+n2(d.twd)+'</td><td>'+pct(m.twd?d.twd/m.twd:null)+'</td></tr>'}).join("")+'</table></div>';
  box.innerHTML=h;
}
function loadPlay(){
  var box=$("playBody");if(!box.innerHTML)box.textContent="載入中…";
  return api("/stats-play?range="+playRange).then(renderPlay,function(e){if(e&&e.auth)throw e;renderPlay(null)});
}
$("rgToday").addEventListener("click",function(){playRange="today";$("rgToday").setAttribute("aria-pressed","true");$("rgWeek").setAttribute("aria-pressed","false");loadPlay()});
$("rgWeek").addEventListener("click",function(){playRange="7d";$("rgWeek").setAttribute("aria-pressed","true");$("rgToday").setAttribute("aria-pressed","false");loadPlay()});
function showTab(n){
  $("paneNum").hidden=n!=="num";$("panePlay").hidden=n!=="play";$("paneRoster").hidden=n!=="roster";
  $("tabNum").setAttribute("aria-selected",n==="num");$("tabPlay").setAttribute("aria-selected",n==="play");$("tabRoster").setAttribute("aria-selected",n==="roster");
  if(n==="play")loadPlay();
  if(n==="roster")loadRoster();
}
$("tabNum").addEventListener("click",function(){showTab("num")});
$("tabPlay").addEventListener("click",function(){showTab("play")});
$("tabRoster").addEventListener("click",function(){showTab("roster")});
var busy=false;
function load(){
  if(busy)return;busy=true;
  return Promise.all([api("/stats-summary").catch(function(e){if(e.auth)throw e;return null}),api("/usage-today").catch(function(e){if(e.auth)throw e;return null})]).then(function(r){
    $("login").hidden=true;$("app").hidden=false;
    lastSummary=r[0];renderCards(r[0]);renderEntry(r[0]);renderUsage(r[0]);renderAI(r[0]);renderTrend(r[0]);renderSpend(r[1]);
    if(!$("panePlay").hidden)loadPlay(); // 「玩家怎麼玩」開著時一起更新；沒開就不算
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
