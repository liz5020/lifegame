// 十、10.13.7.8（2026-10-03）：數據網頁(GET /dashboard)。單一HTML，自己用SVG畫圖，不引用任何外部程式庫或外部網站資源。
// 2026-10-04（10.15.6）：新增名額卡片與唯讀「名冊」分頁；接受兩組密碼——存檔管理密碼可看數字與名冊，用量查詢密碼只能看數字。
// 2026-10-10（10.13.7.14）：改成報告式版面——分頁「報表」(合併原總覽與玩家怎麼玩)、「長期趨勢」、「名冊」。
//   報表最上方固定「名額與人流(即時)」；下面可切今天／昨天／近7天／近30天：結論句與「需要注意」由程式套句型與門檻判斷(不經AI)、重點數字兩排、六個問題小節(每張圖附白話)、下載資料、數字怎麼算。
// 密碼只存sessionStorage；資料來自同網址的 /stats-summary、/usage-today、/stats-play、/stats-daily(兩組管理密碼都可以)。所有日期時間以台灣時間呈現。
export const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>人生草稿 數據總覽</title>
<style>
:root{--paper:#F7F0E3;--card:#FBF6EC;--pop:#FFFDF8;--ink:#4A2E1F;--soft:#86695A;--line:rgba(74,46,31,.15);--stamp:#C8553D;--blue:#3B7EA1;--ok:#3F7D4E;--warn:#B07A1C;--danger:#A32D2D;
--serif:"Noto Serif TC","Songti TC","PMingLiU",serif;--sans:"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#1F1712;--card:#2A201A;--pop:#33271F;--ink:#F1E6D6;--soft:#B49C89;--line:rgba(241,230,214,.16);--stamp:#E58B73;--blue:#6CB0D4;--ok:#7CC08D;--warn:#E0B054;--danger:#E5736F;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.6}
main{max-width:980px;margin:0 auto;padding:20px 16px 56px}
b{font-weight:600}
h1{font-family:var(--serif);font-size:28px;line-height:1.25;margin:0;text-wrap:balance}
button{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
input{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;max-width:320px}
#login{max-width:360px;margin:60px auto}
.stack{display:flex;flex-direction:column;gap:32px}
[hidden]{display:none!important}
.head{display:flex;flex-direction:column;gap:10px}
.eyebrow{font-size:12px;color:var(--soft);letter-spacing:.08em}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--soft);border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--card)}
.pill .dot{width:6px;height:6px;border-radius:50%;background:var(--ok)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:4;background:var(--paper);padding-top:6px}
.tabs button{background:none;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--soft);padding:6px 12px}
.tabs button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--stamp);font-weight:600}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips button{border-radius:999px;font-size:13px;padding:4px 12px}
.chips button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.take{font-size:17.5px;line-height:1.75;margin:0;max-width:46em}
.take b{font-family:var(--serif);font-size:19px}
.note,.small{font-size:12.5px;color:var(--soft);margin:0}
.err{color:var(--danger);font-size:14px}
.alerts{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px 18px;display:flex;flex-direction:column;gap:8px}
.alerts h2{margin:0;font-size:15px}
.al{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:baseline;font-size:14.5px}
.sev{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.sev.bad{background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
.sev.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
.sev.ok{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.tiles.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.tilerows{display:flex;flex-direction:column;gap:10px}
@media (max-width:760px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:520px){.tiles,.tiles.c3{grid-template-columns:1fr}h1{font-size:24px}.take{font-size:16px}}
.tile{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.tile.is-bad{border-color:var(--danger)}
.tl{font-size:12.5px;color:var(--soft)}
.tv{font-family:var(--serif);font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums}
.tv small{font-family:var(--sans);font-size:13px;color:var(--soft);margin-left:3px}
.tile.is-bad .tv{color:var(--danger)}
.ts{font-size:12.5px;color:var(--soft);line-height:1.5}
.up{color:var(--ok)}.down{color:var(--danger)}
.meter{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin-top:4px}
.meter i{display:block;height:100%;background:var(--blue)}
.sec{display:flex;flex-direction:column;gap:12px}
.sec>h2{margin:0;font-family:var(--serif);font-size:21px;text-wrap:balance}
.sec>.sub{margin:-8px 0 0;color:var(--soft);font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.card h3{margin:0;font-size:15px}
.plain{margin:0;font-size:14px;background:var(--pop);border-radius:8px;padding:8px 12px;border:1px solid var(--line)}
.plain::before{content:"白話：";font-weight:700}
svg text{fill:var(--soft);font-size:11px;font-family:var(--sans)}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--soft)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.fun{display:flex;flex-direction:column;gap:2px}
.fr{display:grid;grid-template-columns:minmax(6.5rem,8.5rem) 1fr;gap:10px;align-items:center}
.fn{font-size:13.5px}
.ft{position:relative;height:26px}
.fb{height:100%;border-radius:4px;background:var(--blue);min-width:3px}
.fv{position:absolute;top:50%;transform:translateY(-50%);font-size:12.5px;padding-left:8px;white-space:nowrap;font-variant-numeric:tabular-nums}
.fl{grid-column:2;font-size:12px;color:var(--soft);padding:1px 0 3px;font-variant-numeric:tabular-nums}
.fl.big{color:var(--danger);font-weight:600}
.bar{display:flex;height:26px;gap:2px;border-radius:4px;overflow:hidden}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
th{text-align:left;font-weight:600;color:var(--soft);font-size:12.5px;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td.n,th.n{text-align:right}
.files{display:flex;flex-direction:column;gap:10px}
.file{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--card)}
.file h3{margin:0;font-size:14.5px}
.file p{margin:0;font-size:13px;color:var(--soft);grid-column:1}
.file button{grid-row:1/3;grid-column:2}
dl{margin:0;display:grid;grid-template-columns:minmax(6rem,9rem) 1fr;gap:6px 14px;font-size:14px}
dt{font-weight:600}dd{margin:0;color:var(--soft)}
@media (max-width:520px){dl{grid-template-columns:1fr}}
#tip{position:fixed;pointer-events:none;background:var(--pop);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:12.5px;display:none;z-index:5;box-shadow:0 4px 14px rgba(0,0,0,.12)}
</style></head><body><main>
<div id="login" hidden>
  <h1>人生草稿 數據總覽</h1>
  <p class="small">請輸入管理密碼</p>
  <form id="f"><input id="pw" type="password" autocomplete="current-password" aria-label="管理密碼"> <button type="submit">進入</button></form>
  <p id="loginErr" class="err"></p>
</div>
<div id="app" hidden class="stack">
  <header class="head">
    <div class="eyebrow">人生草稿．後台數據</div>
    <div class="row"><span class="pill"><span class="dot"></span>更新時間 <b id="upd">—</b>（台灣時間）</span><span class="pill" id="capPill">每日上限用了 —</span><button id="refresh">立即更新</button></div>
  </header>
  <div class="tabs" role="tablist"><button id="tabR" role="tab" aria-selected="true">報表</button><button id="tabT" role="tab" aria-selected="false">長期趨勢</button><button id="tabN" role="tab" aria-selected="false">名冊</button></div>

  <div id="paneR" class="stack">
    <section class="sec" id="secQuota"><h2>名額與人流（即時）</h2><p class="sub">固定看今天，不跟下面的時間範圍切換。要加名額或暫停時看這裡。</p><div id="quotaBody"></div></section>
    <div class="head">
      <div class="row"><span class="note">看哪一段時間：</span><div class="chips" id="range"><button data-r="today" aria-pressed="true">今天</button><button data-r="yesterday" aria-pressed="false">昨天</button><button data-r="7d" aria-pressed="false">近 7 天</button><button data-r="30d" aria-pressed="false">近 30 天</button></div></div>
      <h1 id="title">今天的狀況</h1>
      <p class="take" id="take">載入中…</p>
      <p class="note">這段話由程式照數字套句型產生，不經過 AI。金額以 1 美元＝NT$32 換算。</p>
    </div>
    <section class="alerts" aria-label="需要注意"><h2>需要注意</h2><div id="alerts"></div><p class="note">門檻是測試參數：重寫超過 5%＝要處理；名額用完、有人在排候補、AI 餘額撐不到 14 天、今天花費超過每日上限 70%＝留意。</p></section>
    <section class="tilerows" aria-label="重點數字" id="kpi"></section>
    <div id="report" class="stack"></div>
    <section class="sec" id="secFiles"><h2>下載資料（之後自己分析用）</h2><p class="sub">逐筆明細只留 7 天，每日總表永久保留、每小時總表留 90 天。想之後回頭看流量或金額，靠的是每日總表。</p>
      <div class="files">
        <div class="file"><h3>每日總表（從第一天起）</h3><p>瀏覽、新增玩家、回合、花費、開局人生、玩到第 3／10／20 回合、重寫、AI 等待、名額、候補、綁信箱、餘額、各種呼叫次數。新欄位從 10/10 改版上線起才有。</p><button data-f="/daily.csv">下載</button></div>
        <div class="file"><h3>每小時總表（保留 90 天）</h3><p>每小時的瀏覽、新開局、一般回合、重寫、花費。看「哪個時段發文效果好」用。</p><button data-f="/hourly.csv">下載</button></div>
        <div class="file"><h3>逐筆明細（最近 7 天、最多 30,000 筆）</h3><p>每一次 AI 呼叫一列：時間、回合、種類、匿名人生代號、token、花費、等待毫秒、重寫原因。請每隔幾天下載一次。</p><button data-f="/usage-detail.csv">下載</button></div>
      </div>
      <div class="row"><button id="dl">下載全部資料</button><span class="note" id="dlMsg">一次下載三個檔案</span></div>
    </section>
    <section class="sec" id="secTerms"><h2>數字怎麼算</h2>
      <dl>
        <dt>人生</dt><dd>開局一次算一條，以 AI 逐筆明細的匿名代號區分。同一個人重開一局算兩條。明細只留 7 天，所以「近 30 天」只看得到每日總數。</dd>
        <dt>玩家</dt><dd>綁信箱的一個信箱算一位；沒綁的一段人生算一位。</dd>
        <dt>回合</dt><dd>開場算第 1 回合，玩家第一個選擇是第 2 回合。</dd>
        <dt>離開</dt><dd>最後 10 分鐘沒有動作。有些人只是暫時走開。</dd>
        <dt>一次遊玩</dt><dd>同一段人生中間沒有停超過 30 分鐘的一段。</dd>
        <dt>重寫</dt><dd>明細裡種類是「失敗重試／重新生成」的呼叫，也就是同一回合 AI 多寫了一次。</dd>
        <dt>花費</dt><dd>Anthropic 回報的實際用量；沒回報的照預估。推估全天是到目前的花費 ÷ 已過小時數 × 24，只是直線推算。</dd>
        <dt>打開網站</dt><dd>瀏覽人次，跟人生不是一對一，漏斗第一格的比例只是參考。</dd>
      </dl>
    </section>
  </div>

  <div id="paneT" hidden class="stack">
    <section class="sec"><h2>每日趨勢（從有紀錄的第一天起）</h2>
      <div class="chips" id="trendPick"><button data-k="pageviews" aria-pressed="true">瀏覽人次</button><button data-k="lives" aria-pressed="false">開局人生</button><button data-k="turns" aria-pressed="false">回合數</button><button data-k="cost" aria-pressed="false">花費（元）</button><button data-k="retry_rate" aria-pressed="false">重寫比例</button></div>
      <div class="card"><div id="trend"></div><p class="note">「開局人生」「重寫比例」從改版上線起才有；沒有紀錄的日子不畫點。</p></div>
      <div class="card"><h3>每日總表</h3><div class="scroll" id="dailyTable"></div></div>
    </section>
  </div>

  <div id="paneN" hidden><section class="sec"><h2>名冊</h2><p class="sub">唯讀；每次打開這個分頁，系統會自動留一筆存取紀錄。</p><div class="card"><div id="rosterBody"></div></div></section></div>
</div>
<div id="tip"></div>
<script>
(function(){
var KEY="lifegame_dash_token",tok="";
try{tok=sessionStorage.getItem(KEY)||""}catch(e){}
var $=function(id){return document.getElementById(id)};
var NA="暫時無法取得",RATE=32,RETRY_TARGET=0.05,BAL_WARN_DAYS=14,SPEND_WARN=0.7;
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function api(path){return fetch(path,{headers:{Authorization:"Bearer "+tok},cache:"no-store"}).then(function(r){
  if(r.status===401){var e=new Error("auth");e.auth=true;throw e}
  if(!r.ok)throw new Error("http "+r.status);return r.json()})}
function soft(p){return api(p).catch(function(e){if(e&&e.auth)throw e;return null})}
function num(n){return n==null?"—":Number(n).toLocaleString("zh-TW")}
function n1(v){return v==null?"—":Number(v).toLocaleString("zh-TW",{maximumFractionDigits:1})}
function n2(v){return v==null?"—":Number(v).toLocaleString("zh-TW",{maximumFractionDigits:2})}
function pct(v){return v==null?"—":(Math.round(v*1000)/10)+"%"}
function pct0(v){return v==null?"—":Math.round(v*100)+"%"}
function usd(v){return v==null?"—":"US$"+Number(v).toLocaleString("en-US",{maximumFractionDigits:4})}
function tile(label,val,unit,sub,bad,meter){return '<div class="tile'+(bad?' is-bad':'')+'"><div class="tl">'+label+'</div><div class="tv">'+val+(unit?'<small>'+unit+'</small>':'')+'</div><div class="ts">'+(sub||"")+'</div>'+(meter==null?'':'<div class="meter"><i style="width:'+Math.min(100,Math.max(0,meter*100))+'%"></i></div>')+'</div>'}
function delta(cur,prev,word){if(cur==null||prev==null)return "";var d=cur-prev;return word+" "+num(prev)+(d?' <span class="'+(d>0?'up':'down')+'">'+(d>0?'▲':'▼')+num(Math.abs(d))+'</span>':'')}
function sec(id,title,sub,body){return '<section class="sec" id="'+id+'"><h2>'+title+'</h2>'+(sub?'<p class="sub">'+sub+'</p>':'')+body+'</section>'}
function card(title,body,plain){return '<div class="card"><h3>'+title+'</h3>'+body+(plain?'<p class="plain">'+plain+'</p>':'')+'</div>'}
var tipEl=$("tip");
function hook(id,tips){setTimeout(function(){var svg=$(id);if(!svg)return;
  svg.addEventListener("pointermove",function(ev){var i=ev.target.getAttribute&&ev.target.getAttribute("data-i");if(i==null){tipEl.style.display="none";return}
    tipEl.style.display="block";tipEl.style.left=Math.min(window.innerWidth-220,ev.clientX+12)+"px";tipEl.style.top=(ev.clientY+12)+"px";tipEl.textContent=tips[+i]});
  svg.addEventListener("pointerleave",function(){tipEl.style.display="none"})},0)}
// 直條圖(可並排多組)：labels[]、series[{v[],c}]；opt.pct＝百分比刻度、opt.ref＝虛線目標、opt.tips[]
function bars(labels,series,opt){
  opt=opt||{};if(!labels.length)return '<p class="small">還沒有資料</p>';
  var W=560,H=210,L=40,R=8,T=12,B=24,n=labels.length,max=opt.ref||0;
  series.forEach(function(s){s.v.forEach(function(v){max=Math.max(max,v||0)})});if(!max)max=1;
  var top,step;
  if(opt.pct){step=max>0.5?0.25:max>0.2?0.1:0.05;top=Math.ceil(max/step)*step}
  else{var e=Math.pow(10,Math.floor(Math.log10(max)));step=max/e>5?2*e:max/e>2?e:e/2;if(step<1)step=1;top=Math.ceil(max/step)*step}
  function Y(v){return T+(H-T-B)*(1-v/top)}
  var gw=(W-L-R)/n,bw=gw*0.74/series.length,g="",every=Math.max(1,Math.ceil(n/12));
  for(var v=0;v<=top+1e-9;v+=step){g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="var(--line)"/><text x="'+(L-5)+'" y="'+(Y(v)+4)+'" text-anchor="end">'+(opt.pct?Math.round(v*100)+"%":Math.round(v))+'</text>'}
  labels.forEach(function(lb,i){var x0=L+i*gw+gw*0.13;
    series.forEach(function(s,j){var val=s.v[i]||0;g+='<rect data-i="'+i+'" x="'+(x0+j*bw)+'" y="'+Y(val)+'" width="'+Math.max(1,bw-2)+'" height="'+Math.max(0,H-B-Y(val))+'" rx="2" fill="'+s.c+'"/>'});
    if(i%every===0)g+='<text x="'+(L+i*gw+gw/2)+'" y="'+(H-7)+'" text-anchor="middle">'+esc(lb)+'</text>'});
  if(opt.ref)g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(opt.ref)+'" y2="'+Y(opt.ref)+'" stroke="var(--danger)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="'+(W-R)+'" y="'+(Y(opt.ref)-5)+'" text-anchor="end">目標 '+Math.round(opt.ref*100)+'%</text>';
  var id="c"+Math.random().toString(36).slice(2,8);if(opt.tips)hook(id,opt.tips);
  return '<svg id="'+id+'" viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="'+esc(opt.aria||"")+'">'+g+'</svg>'}
// 橫條：rows[[名稱,數字]]；withLoss＝漏斗(每步寫少了多少、流失最多標紅)
function hbars(rows,withLoss){
  rows=rows.filter(function(r){return r[1]!=null});if(!rows.length)return '<p class="small">還沒有資料</p>';
  var max=Math.max.apply(null,rows.map(function(r){return r[1]}))||1,big=-1,h="";
  if(withLoss)for(var i=1;i<rows.length;i++)big=Math.max(big,rows[i-1][1]-rows[i][1]);
  rows.forEach(function(r,i){
    if(withLoss&&i){var l=rows[i-1][1]-r[1];h+='<div class="fr"><span></span><div class="fl'+(l===big&&l>0?' big':'')+'">↓ 少了 '+num(l)+(rows[i-1][1]?'（'+pct0(l/rows[i-1][1])+'）':'')+'</div></div>'}
    var w=r[1]/max*76;
    h+='<div class="fr"><span class="fn">'+esc(r[0])+'</span><div class="ft"><div class="fb" style="width:'+w+'%"></div><span class="fv" style="left:'+w+'%">'+num(r[1])+(withLoss&&rows[0][1]?'（'+pct0(r[1]/rows[0][1])+'）':' 條')+'</span></div></div>'});
  return '<div class="fun">'+h+'</div>'}
var KIND={turn:"一般回合",retry:"重寫",opening:"開場",chapter:"人生之書章節",idle:"放置摘要",review:"回顧這一生"};
var KCOL={turn:"var(--blue)",retry:"var(--stamp)",opening:"var(--warn)",chapter:"var(--ok)",idle:"var(--soft)",review:"var(--ink)"};

var D={sum:null,today:null,play:{},daily:null,range:"today",trendKey:"pageviews"};
try{var rr0=sessionStorage.getItem("lifegame_dash_range");if(rr0)D.range=rr0}catch(e){}
function dayStr(offset){return new Date(Date.now()+8*3600000-offset*86400000).toISOString().slice(0,10)}
function curHourTW(){var d=new Date(Date.now()+8*3600000);return d.getUTCHours()+d.getUTCMinutes()/60}

// ---- 最上方：名額與人流(即時，固定今天) ----
function renderQuota(){
  var s=D.sum,e=s&&s.entry,p=D.play.today,box=$("quotaBody");
  var left;
  if(p&&p.pageviews){var hrs=[];for(var h=0;h<24;h++)hrs.push((h<10?"0":"")+h+":00");
    var last=0;hrs.forEach(function(k,i){if((p.pageviews[k]||0)>0||(p.timeline||[]).some(function(t){return t.bucket===k}))last=i});
    hrs=hrs.slice(0,Math.max(last+1,Math.min(24,Math.ceil(curHourTW()))));
    var tl={};(p.timeline||[]).forEach(function(t){tl[t.bucket]=t});
    var pv=hrs.map(function(k){return p.pageviews[k]||0}),nl=hrs.map(function(k){return tl[k]?tl[k].new_lives:0});
    left=card("今天每小時瀏覽與開局",'<div class="legend"><span><i style="background:var(--blue)"></i>瀏覽人次</span><span><i style="background:var(--stamp)"></i>新開局</span></div>'+
      bars(hrs.map(function(k){return k.slice(0,2)}),[{v:pv,c:"var(--blue)"},{v:nl,c:"var(--stamp)"}],{aria:"今天每小時瀏覽與開局",tips:hrs.map(function(k,i){return k+"　瀏覽 "+pv[i]+"、新開局 "+nl[i]})}),
      plainArrive(p,pv,nl,hrs));
  }else left=card("今天每小時瀏覽與開局",'<p class="err">'+NA+'</p>');
  var right;
  if(e){
    var full=e.cap>0&&e.used>=e.cap,rate=e.mailed?e.entered_after_mail/e.mailed:null;
    right=card("名額與候補",'<div class="scroll"><table><tr><th>項目</th><th class="n">數字</th><th>說明</th></tr>'+
      '<tr><td>今日名額</td><td class="n">'+num(e.used)+' / '+num(e.cap)+'</td><td>'+(e.cap<=0?"已暫停發放":full?"已用完":"還有 "+num(e.cap-e.used)+" 個")+(e.bonus?"（含前一天收回 "+num(e.bonus)+"）":"")+'</td></tr>'+
      '<tr><td>累計入場</td><td class="n">'+num(e.cum)+' / '+num(e.checkpoint)+'</td><td>'+(e.cum>=e.checkpoint?"已到檢查點，暫停發放":"到檢查點還差 "+num(e.checkpoint-e.cum)+" 人")+'</td></tr>'+
      '<tr><td>候補排隊中</td><td class="n">'+num(e.waiting)+'</td><td>今天新增 '+num(e.wl_new_today)+'</td></tr>'+
      '<tr><td>已通知未入場</td><td class="n">'+num(e.notified)+'</td><td>通知後超過一天的 '+num(e.notified_over_day)+' 人</td></tr>'+
      '<tr><td>通知後入場率</td><td class="n">'+pct0(rate)+'</td><td>寄出通知的 '+num(e.mailed)+' 人裡有 '+num(e.entered_after_mail)+' 人入場</td></tr></table></div>'+
      '<p class="plain">名額算的是「人」，開局算的是「人生」。同一個人重開一局會算兩條人生。</p>'+
      '<p class="note">要調整：到 Cloudflare 後台改「每日名額」（DAILY_NEW_PLAYER_CAP，改完馬上生效）或「檢查點」（BETA_PLAYER_CHECKPOINT，調高後隔天 00:00 才恢復發放）。目前設定：每日 '+num(e.daily_cap_setting!=null?e.daily_cap_setting:e.cap)+'、檢查點 '+num(e.checkpoint)+'。</p>');
  }else right=card("名額與候補",'<p class="err">'+NA+'</p>');
  box.innerHTML='<div class="grid">'+left+right+'</div>';
}
function plainArrive(p,pv,nl,hrs){
  var tv=pv.reduce(function(a,b){return a+b},0),tl=nl.reduce(function(a,b){return a+b},0);
  if(!tv&&!tl)return "今天還沒有人進來。";
  var mi=0;pv.forEach(function(v,i){if(v>pv[mi])mi=i});
  var s=tv?"今天瀏覽 "+num(tv)+" 次、新開局 "+num(tl)+" 條；瀏覽最多的是 "+hrs[mi]+" 那一小時。":"新開局 "+num(tl)+" 條。";
  if(tv&&tl)s+="打開網站的人裡，大約每 10 次有 "+Math.round(tl/tv*10)+" 次開局。";
  return s}

// ---- 依時間範圍的報表 ----
function rangeWord(){return{today:"今天",yesterday:"昨天","7d":"近 7 天","30d":"近 30 天"}[D.range]}
function dailyRows(n){var rows=(D.daily&&D.daily.rows)||[];return rows.slice(Math.max(0,rows.length-n))}
function sumOf(rows,k){var t=0,has=false;rows.forEach(function(r){if(r[k]!=null){t+=r[k];has=true}});return has?t:null}
// 統一成同一組數字，報表各區只讀這裡
function pick(){
  var s=D.sum,u=s&&s.usage,r=D.range,o={word:rangeWord()};
  var dly=(s&&s.daily)||[],byDate={};dly.forEach(function(x){byDate[x.date]=x});
  if(r==="30d"){
    var rows=dailyRows(30);o.daily=rows;
    o.lives=sumOf(rows,"lives");o.reach3=sumOf(rows,"reach3");o.reach10=sumOf(rows,"reach10");o.reach20=sumOf(rows,"reach20");
    o.reach10_rate=o.lives?o.reach10/o.lives:null;o.cost=sumOf(rows,"cost");o.turns=sumOf(rows,"turns");o.views=sumOf(rows,"pageviews");
    var tc=0,rc=0;rows.forEach(function(x){tc+=(x.calls&&x.calls.turn)||0;rc+=x.retries||0});o.retries=rc;o.turn_calls=tc;o.retry_rate=tc?rc/tc:null;
    o.per_turn=o.turns?o.cost/o.turns:null;o.playing=D.play.today?D.play.today.summary.playing_now:null;
    return o}
  var p=D.play[r];o.p=p;if(!p)return o;var m=p.summary;
  o.lives=m.lives;o.reach3=m.reach3;o.reach10=m.reach10;o.reach20=m.reach20;o.reach10_rate=m.reach10_rate;o.playing=(D.play.today||p).summary.playing_now;
  o.retries=m.retries;o.turn_calls=m.turns;o.retry_rate=m.retry_rate;o.per_turn=m.twd_per_turn;o.per_turn_nr=m.twd_per_turn_no_retry;o.views=p.pageviews_total;o.prev=p.prev;
  if(r==="today"){o.cost=D.today?D.today.est_cost_twd:(u&&u.cost.today);o.cap=D.today?D.today.daily_spend_cap_twd:null}
  else if(r==="yesterday"){var y=byDate[dayStr(1)];o.cost=y?y.cost:null}
  else o.cost=u?u.cost.last7:null;
  return o}
function renderTake(o){
  $("title").textContent=o.word+(D.range==="today"||D.range==="yesterday"?"的狀況":"");
  if(o.lives==null){$("take").innerHTML=NA;return}
  var t=o.word+"有 <b>"+num(o.lives)+"</b> 條人生開局";
  if(o.prev&&o.prev.lives!=null){var d=o.lives-o.prev.lives;t+=d===0?"，跟前一天一樣":"，比前一天"+(d>0?"多":"少")+" <b>"+num(Math.abs(d))+"</b> 條"}
  t+="；";
  if(o.reach10_rate!=null)t+="大約每 10 條有 "+Math.round(o.reach10_rate*10)+" 條玩到第 10 回合（<b>"+pct0(o.reach10_rate)+"</b>）。";
  if(o.cost!=null)t+="花了 <b>NT$ "+num(Math.round(o.cost))+"</b>"+(o.cap?"，是每日上限的 "+pct0(o.cost/o.cap):"")+"。";
  if(o.retry_rate!=null)t+=o.retry_rate>RETRY_TARGET?"最該處理的是重寫：重寫次數等於一般回合的 <b>"+pct0(o.retry_rate)+"</b>，目標是 5%。":"重寫佔一般回合 <b>"+pct(o.retry_rate)+"</b>，在目標 5% 以內。";
  $("take").innerHTML=t}
function renderAlerts(o){
  var s=D.sum,e=s&&s.entry,a=[],bal=s&&s.ai_usage&&s.ai_usage.balance;
  if(o.retry_rate!=null&&o.retry_rate>RETRY_TARGET)a.push(["bad","要處理","重寫佔一般回合 "+pct0(o.retry_rate)+"，超過目標 5%。"+topReason(o)]);
  if(e&&e.cap<=0)a.push(["warn","留意","每日名額目前設為 0，暫停發放中（詳見最上方）。"]);
  else if(e&&e.used>=e.cap)a.push(["warn","留意","今日名額 "+num(e.used)+"／"+num(e.cap)+" 已用完"+(e.waiting?"，候補還有 "+num(e.waiting)+" 人在排":"")+"（詳見最上方）。"]);
  else if(e&&e.waiting>0)a.push(["warn","留意","候補還有 "+num(e.waiting)+" 人在排（詳見最上方）。"]);
  if(e&&e.cum>=e.checkpoint)a.push(["warn","留意","累計入場已到檢查點 "+num(e.checkpoint)+"，名額暫停發放。"]);
  if(bal&&bal.days_left!=null&&bal.days_left<BAL_WARN_DAYS)a.push(["warn","留意","照近 7 天的花法，AI 餘額約還能撐 "+bal.days_left+" 天。"]);
  if(D.today&&D.today.daily_spend_cap_twd&&D.today.est_cost_twd>=SPEND_WARN*D.today.daily_spend_cap_twd)a.push(["warn","留意","今天花費已到每日上限的 "+pct0(D.today.est_cost_twd/D.today.daily_spend_cap_twd)+"。"]);
  if(!a.length)a.push(["ok","正常","沒有需要處理的事。"]);
  $("alerts").innerHTML=a.map(function(x){return '<div class="al"><span class="sev '+x[0]+'">'+x[1]+'</span><span>'+esc(x[2])+'</span></div>'}).join("")}
function topReason(o){var rs=o.p&&o.p.retry_reasons;return rs&&rs.length?"最常見的原因是「"+rs[0].label+"」。":""}
function renderKPI(o){
  var sub10=o.reach10!=null?num(o.reach10)+" 條"+(o.prev&&o.prev.reach10_rate!=null?"；前一天 "+pct0(o.prev.reach10_rate):""):"";
  var costSub=o.cap?"上限 "+num(o.cap)+" 元":(D.range==="30d"?"共 "+num(o.turns)+" 個回合":"");
  $("kpi").innerHTML='<div class="tiles c3">'+
    tile("開局的人生",num(o.lives),"",o.prev?delta(o.lives,o.prev.lives,"前一天"):(D.range==="30d"?"從改版上線起才有":""))+
    tile("玩到第 10 回合",o.reach10_rate==null?"—":Math.round(o.reach10_rate*100),o.reach10_rate==null?"":"%",sub10)+
    tile("現在還在玩",num(o.playing),"","10 分鐘內有動作")+'</div><div class="tiles c3">'+
    tile(o.word+"花費",o.cost==null?"—":num(Math.round(o.cost)),"元",costSub,false,o.cap?o.cost/o.cap:null)+
    tile("每回合花費",n2(o.per_turn),o.per_turn==null?"":"元",o.per_turn_nr!=null?"不算重寫 "+n2(o.per_turn_nr)+" 元":"")+
    tile("重寫佔一般回合",o.retry_rate==null?"—":Math.round(o.retry_rate*100),o.retry_rate==null?"":"%","目標低於 5%",o.retry_rate!=null&&o.retry_rate>RETRY_TARGET)+'</div>'}
var ONLY_DAILY='<p class="small">這段時間只看得到每日總數（逐筆明細只留 7 天）。</p>';
function renderReport(o){
  var p=o.p,m=p&&p.summary,h="",r=D.range;
  // ② 每一步還剩多少人
  var fun;
  if(r==="30d")fun=[["打開網站",o.views],["開始一段人生",o.lives],["第 3 回合",o.reach3],["第 10 回合",o.reach10],["第 20 回合",o.reach20]];
  else if(p){var at=function(n){var f=(p.funnel||[]).filter(function(x){return x.turn===n})[0];return f?f.lives:0};
    fun=[["打開網站",o.views],["開始一段人生",m.lives],["第 2 回合",at(2)],["第 3 回合",at(3)],["第 5 回合",at(5)],["第 10 回合",at(10)],["第 20 回合",at(20)]]}
  h+=sec("secFunnel","每一步還剩多少人","從打開網站算起。紅字是流失最多的一步。",card("進場漏斗",fun?hbars(fun,true):'<p class="err">'+NA+'</p>',fun?plainFunnel(fun):""));
  // ③ 人在哪裡離開
  if(r==="30d")h+=sec("secDrop","人在哪裡離開","",ONLY_DAILY);
  else if(p){
    var left=p.stops.reduce(function(a,x){return a+x.lives},0);
    var cont='<div class="scroll"><table><tr><th>回合</th><th class="n">到達</th><th class="n">繼續比例</th></tr>'+(p.continuation||[]).map(function(c){return '<tr><td>第 '+c.turn+' → '+(c.turn+1)+' 回合</td><td class="n">'+num(c.n)+'</td><td class="n">'+pct0(c.rate)+'</td></tr>'}).join("")+'</table></div>';
    h+=sec("secDrop","人在哪裡離開","已經 10 分鐘沒動作的 "+num(left)+" 條人生，最後停在哪一回合，以及每一關往下玩的比例。",
      '<div class="grid">'+card("離開時停在第幾回合",hbars(p.stops.map(function(x){return[x.label,x.lives]}),false),plainStops(p.stops,left))+
      card("每一關繼續往下玩的比例",cont,"還在玩、而且剛好停在那一回合的人生還沒決定，不算進去。")+'</div>')}
  // ④ 玩多久、等多久、有沒有回來
  if(r==="30d")h+=sec("secTime","玩多久、等多久、有沒有回來","",ONLY_DAILY);
  else if(m){
    var rv=m.revisit;
    h+=sec("secTime","玩多久、等多久、有沒有回來","「一次遊玩」是中間沒有停超過 30 分鐘的一段。",'<div class="tiles">'+
      tile("一次玩多久（中位數）",n1(m.session_median_min),"分","平均 "+n1(m.session_mean_min)+" 分")+
      tile("兩回合間隔（中位數）",num(m.turn_gap_median_s),"秒","含等 AI 和閱讀")+
      tile("AI 寫一回合要等",n1(m.wait_turn_s),"秒","開場 "+n1(m.wait_opening_s)+" 秒；遇到重寫再多等 "+n1(m.wait_retry_s)+" 秒")+
      tile("隔天又回來玩",rv?num(rv.lives):"—",rv?"條":"",rv?"開局隔天以後還有玩的人生（共 "+num(rv.of)+" 條可算）":"今天開局的人生要到明天才算得出來")+'</div>')}
  // ⑤ 花了多少錢
  h+=sec("secCost","花了多少錢","AI 實際花費（Anthropic 回報的用量）。推估值照目前趨勢算，不是實際數字。",costBlock(o));
  // ⑥ 重寫
  if(r==="30d"){var rows=o.daily||[];
    h+=sec("secRetry","重寫有多頻繁、為什麼","重寫次數 ÷ 一般回合數。虛線是目標 5%。",card("每天重寫比例",bars(rows.map(function(x){return x.date.slice(5).replace("-","/")}),[{v:rows.map(function(x){return x.retry_rate||0}),c:"var(--stamp)"}],{pct:true,ref:RETRY_TARGET,aria:"每天重寫比例",tips:rows.map(function(x){return x.date+"　重寫 "+num(x.retries)+"、比例 "+pct(x.retry_rate)})})))}
  else if(p){
    var tl=p.timeline||[],why=p.retry_reasons||[],wt=why.reduce(function(a,x){return a+x.n},0);
    h+=sec("secRetry","重寫有多頻繁、為什麼","重寫次數 ÷ 一般回合數。虛線是目標 5%。",'<div class="grid">'+
      card((r==="7d"?"每天":"每小時")+"重寫比例",bars(tl.map(function(x){return r==="7d"?x.bucket:x.bucket.slice(0,2)}),[{v:tl.map(function(x){return x.retry_rate||0}),c:"var(--stamp)"}],{pct:true,ref:RETRY_TARGET,aria:"重寫比例",tips:tl.map(function(x){return x.bucket+"　重寫 "+x.retries+" ÷ 一般回合 "+x.turns+" ＝ "+pct(x.retry_rate)})}))+
      card("重寫原因",why.length?'<div class="scroll"><table><tr><th>原因</th><th class="n">次數</th><th class="n">佔重寫</th></tr>'+why.map(function(w){return '<tr><td>'+esc(w.label)+'</td><td class="n">'+num(w.n)+'</td><td class="n">'+pct0(wt?w.n/wt:null)+'</td></tr>'}).join("")+'</table></div>':'<p class="small">沒有重寫</p>',"下載的明細裡是原因代碼（例如「過短」「日期」）。")+
      regenToday()+'</div>')}
  // ⑦ 玩家有多少
  h+=sec("secPlayers","玩家有多少","綁信箱的一個信箱算一位；沒綁的一段人生算一位。人生段數＝玩過至少一回合的人生，一位玩家可以有好幾段。",playersBlock());
  $("report").innerHTML=h}
function plainFunnel(f){
  var big=-1,at=-1;for(var i=1;i<f.length;i++){if(f[i][1]==null||f[i-1][1]==null)continue;var l=f[i-1][1]-f[i][1];if(l>big){big=l;at=i}}
  if(at<0||!f[1][1])return "";
  var s="流失最多的一步是「"+f[at-1][0]+"」到「"+f[at][0]+"」，少了 "+num(big)+"。";
  var i3=-1,i10=-1;f.forEach(function(x,i){if(x[0]==="第 3 回合")i3=i;if(x[0]==="第 10 回合")i10=i});
  if(i3>0&&i10>0&&f[i3][1])s+="撐過第 3 回合的人，有 "+pct0(f[i10][1]/f[i3][1])+" 會玩到第 10 回合。";
  return s}
function plainStops(st,left){if(!left)return "還沒有人離開。";var a=st[0].lives+st[1].lives;return "「只有開場」和「第 2 回合就走」加起來 "+num(a)+" 條，佔離開的 "+pct0(a/left)+"。"}
function regenToday(){var q=D.sum&&D.sum.ai_usage&&D.sum.ai_usage.regen_today;if(!q)return "";
  var list=function(arr){return arr&&arr.length?arr.map(function(x){return esc(x.code)+" "+num(x.n)}).join("、"):"—"};
  return card("今天的自動重寫",'<div class="scroll"><table><tr><th>重寫</th><td>'+num(q.regens)+' 次 ÷ 一般回合 '+num(q.turn_calls)+' 次＝'+(q.pct==null?"—":q.pct+"%")+'</td></tr><tr><th>重寫原因前 5 名</th><td>'+list(q.reasons)+'</td></tr><tr><th>上回合紀錄前 5 名</th><td>'+list(q.notes)+'</td></tr></table></div>')}
function costBlock(o){
  var s=D.sum,a=s&&s.ai_usage,u=s&&s.usage,p=o.p,m=p&&p.summary,h="";
  var bal=a&&a.balance,todayCost=D.today?D.today.est_cost_twd:(u&&u.cost.today),hrs=curHourTW();
  var est=todayCost!=null&&hrs>=1?todayCost/hrs*24:null;
  h+='<div class="tiles">'+
    tile("今天",todayCost==null?"—":num(Math.round(todayCost)),"元",(u?"共 "+num(u.turns.today)+" 個回合":"")+(est!=null?"；推估全天約 "+num(Math.round(est))+" 元":""))+
    tile("近 7 天",u?num(Math.round(u.cost.last7)):"—","元",u?"每天平均 "+num(Math.round(u.cost.last7/7))+" 元":"")+
    tile("每條人生平均",m?n1(m.twd_per_life):"—","元",m&&m.twd_per_reach10_life!=null?"玩到第 10 回合的 "+n1(m.twd_per_reach10_life)+" 元":(D.range==="30d"?"只算得到近 7 天":""))+
    tile("AI 餘額還能撐",bal&&bal.days_left!=null?num(bal.days_left):"—",bal&&bal.days_left!=null?"天":"",bal?"剩 "+usd(bal.remaining_usd)+"（約 NT$ "+num(Math.round(bal.remaining_usd*RATE))+"）":"還沒設定餘額（後台 AI_BALANCE_USD、AI_BALANCE_BASE_USD）")+'</div>';
  var left="";
  if(D.range==="30d"){var rows=o.daily||[];left=card("每天花費",bars(rows.map(function(x){return x.date.slice(5).replace("-","/")}),[{v:rows.map(function(x){return x.cost||0}),c:"var(--blue)"}],{aria:"每天花費",tips:rows.map(function(x){return x.date+"　NT$"+n2(x.cost)+"，回合 "+num(x.turns)})}))}
  else if(p){var tl=p.timeline||[];left=card((D.range==="7d"?"每天":"每小時")+"花費",bars(tl.map(function(x){return D.range==="7d"?x.bucket:x.bucket.slice(0,2)}),[{v:tl.map(function(x){return x.twd}),c:"var(--blue)"}],{aria:"花費",tips:tl.map(function(x){return x.bucket+"　NT$"+n2(x.twd)+"，一般回合 "+x.turns+"、重寫 "+x.retries+"、有在玩的人生 "+x.lives})}),null)}
  var right="";
  if(p&&p.cost_split&&p.cost_split.length){var tot=p.cost_split.reduce(function(t,x){return t+x.twd},0)||1;
    var retry=p.cost_split.filter(function(x){return x.kind==="retry"})[0];
    right=card("錢花在哪裡",'<div class="bar">'+p.cost_split.map(function(x){return '<div style="flex:'+(x.twd||0.0001)+';background:'+(KCOL[x.kind]||"var(--soft)")+'"></div>'}).join("")+'</div>'+
      '<div class="legend">'+p.cost_split.map(function(x){return '<span><i style="background:'+(KCOL[x.kind]||"var(--soft)")+'"></i>'+esc(KIND[x.kind]||x.kind)+' NT$'+n2(x.twd)+'（'+pct0(x.twd/tot)+'，'+num(x.calls)+' 次）</span>'}).join("")+'</div>'+
      (m&&m.cache?'<div class="scroll"><table><tr><th>AI 讀進去的內容</th><th class="n">比例</th></tr><tr><td>從快取讀（便宜）</td><td class="n">'+pct0(m.cache.read)+'</td></tr><tr><td>寫進快取</td><td class="n">'+pct0(m.cache.write)+'</td></tr><tr><td>沒用快取</td><td class="n">'+pct0(m.cache.plain)+'</td></tr></table></div>':""),
      retry?"重寫花了 NT$"+n2(retry.twd)+"，佔 "+pct0(retry.twd/tot)+"。":"沒有重寫的花費。")}
  if(left||right)h+='<div class="grid">'+left+right+'</div>';
  h+=aiTable();
  return h}
// AI 花費明細(Anthropic回報，今天／近7天／累計)
function aiTable(){
  var a=D.sum&&D.sum.ai_usage,u=D.sum&&D.sum.usage;if(!a)return card("AI 花費明細",'<p class="err">'+NA+'</p>');
  var cols=[["今天",a.today,"today"],["近 7 天",a.last7,"last7"],["累計（"+(a.since||"—")+" 起）",a.total,"total"]];
  function row(label,f){return '<tr><td>'+label+'</td>'+cols.map(function(c){return '<td class="n">'+f(c[1],c[2])+'</td>'}).join("")+'</tr>'}
  return card("AI 花費明細（Anthropic 回報）",'<div class="scroll"><table><tr><th>項目</th>'+cols.map(function(c){return '<th class="n">'+esc(c[0])+'</th>'}).join("")+'</tr>'+
    row("台幣（元）",function(r,k){return u?n2(u.cost[k]):"—"})+row("美元",function(r){return usd(r.usd)})+
    row("每回合平均（元）",function(r,k){return u&&u.avg_cost_per_turn?n2(u.avg_cost_per_turn[k]):"—"})+
    row("AI 呼叫次數",function(r){return num(r.calls)})+
    Object.keys(KIND).map(function(k){return row("　"+KIND[k],function(r){return num((r.by_kind||{})[k]||0)})}).join("")+
    row("輸入 token",function(r){return num(r.input)})+row("快取寫入 token",function(r){return num(r.cache_write)})+row("快取讀取 token",function(r){return num(r.cache_read)})+row("輸出 token",function(r){return num(r.output)})+
    row("快取讀取佔輸入",function(r){return r.cache_read_pct==null?"—":r.cache_read_pct+"%"})+'</table></div>',
    "台幣是實際花費換算（沒有回報用量的呼叫照預估）；每回合平均＝所有 AI 呼叫（含開場、重寫、章節）的花費 ÷ 回合數。")}
function playersBlock(){
  var s=D.sum;if(!s)return '<p class="err">'+NA+'</p>';
  var f=s.players.free,pd=s.players.paid,tot=f.total+pd.total,b=s.accounts_bound||{},ub=s.lives_unbound||{},ls=s.lives_started||{},v=s.pageviews;
  return '<div class="tiles">'+
    tile("玩家總數",num(tot),"","今天新增 "+num(f.today+pd.today)+"；綁信箱 "+num(b.total)+"、<br>沒綁的人生 "+num(ub.total)+(pd.total>0?"；付費 "+num(pd.total):""))+
    tile("今天有玩的玩家",num(s.active.today),"","近 7 天 "+num(s.active.last7))+
    tile("開啟人生段數",num(ls.total),"","今天 "+num(ls.today)+"、近 7 天 "+num(ls.last7))+
    tile("瀏覽人次",num(v.today),"","今天；累計 "+num(v.total)+(v.since?"（"+v.since+" 起）":""))+'</div>'}

// ---- 長期趨勢 ----
function renderTrend(){
  var rows=(D.daily&&D.daily.rows)||[],k=D.trendKey,box=$("trend");
  if(!D.daily){box.innerHTML='<p class="err">'+NA+'</p>';$("dailyTable").innerHTML="";return}
  if(!rows.length){box.innerHTML='<p class="small">還沒有可顯示的資料</p>';$("dailyTable").innerHTML="";return}
  var W=820,H=240,L=46,R=14,T=14,B=28,n=rows.length,isPct=k==="retry_rate";
  var vals=rows.map(function(x){return x[k]==null?null:x[k]}),max=0;vals.forEach(function(v){if(v!=null)max=Math.max(max,v)});if(!max)max=isPct?0.1:1;
  var top=isPct?Math.ceil(max*20)/20:(function(){var e=Math.pow(10,Math.floor(Math.log10(max)));var st=max/e>5?2*e:max/e>2?e:e/2;if(st<1)st=1;return Math.ceil(max/st)*st})();
  function X(i){return L+(n>1?i*(W-L-R)/(n-1):(W-L-R)/2)}
  function Y(v){return T+(H-T-B)*(1-v/top)}
  var g="";for(var j=0;j<=4;j++){var v=top*j/4;g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="var(--line)"/><text x="'+(L-6)+'" y="'+(Y(v)+4)+'" text-anchor="end">'+(isPct?Math.round(v*100)+"%":Math.round(v))+'</text>'}
  var every=Math.max(1,Math.ceil(n/8));rows.forEach(function(x,i){if(i%every===0||i===n-1)g+='<text x="'+X(i)+'" y="'+(H-8)+'" text-anchor="middle">'+x.date.slice(5)+'</text>'});
  var pts=[],seg="";vals.forEach(function(v,i){if(v==null){if(pts.length>1)seg+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/>';pts=[];return}pts.push(X(i)+","+Y(v))});
  if(pts.length>1)seg+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/>';
  vals.forEach(function(v,i){if(v!=null)seg+='<circle data-i="'+i+'" cx="'+X(i)+'" cy="'+Y(v)+'" r="'+(n<=31?4:2.5)+'" fill="var(--blue)" stroke="var(--card)" stroke-width="1.5"/>'});
  var tips=rows.map(function(x,i){return x.date+"　"+(vals[i]==null?"沒有紀錄":(isPct?pct(vals[i]):n2(vals[i])))});
  box.innerHTML='<svg id="trendSvg" viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="每日趨勢">'+g+seg+'</svg>';hook("trendSvg",tips);
  var cols=[["date","日期"],["pageviews","瀏覽"],["new_players","新增玩家"],["lives","開局人生"],["reach10","到第10回合"],["turns","回合"],["cost","花費（元）"],["retry_rate","重寫比例"],["wait_s","AI 等待（秒）"],["quota_used","名額已用"],["wl_new","候補新增"],["bound_new","綁信箱新增"]];
  $("dailyTable").innerHTML='<table><tr>'+cols.map(function(c){return '<th'+(c[0]==="date"?'':' class="n"')+'>'+c[1]+'</th>'}).join("")+'</tr>'+
    rows.slice().reverse().map(function(x){return '<tr>'+cols.map(function(c){var v=x[c[0]];return c[0]==="date"?'<td>'+esc(v)+'</td>':'<td class="n">'+(v==null?"—":c[0]==="retry_rate"?pct(v):n2(v))+'</td>'}).join("")+'</tr>'}).join("")+'</table>'}

// ---- 名冊 ----
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
    box.innerHTML='<div class="scroll"><table><tr><th>信箱</th><th>綁定日期</th><th>人生數</th><th>回合數</th><th>最後存檔時間</th><th>候補狀態</th><th>留信箱時間</th><th>通知日期</th></tr>'+
      a.map(function(x){return '<tr><td>'+esc(x.email)+'</td><td>'+dd(x.bound_at)+'</td><td>'+num(x.lives)+'</td><td>'+num(x.turns)+'</td><td>'+dt(x.last_save)+'</td><td>'+esc(x.wl_status||"")+'</td><td>'+dt(x.joined_at)+'</td><td>'+dd(x.notified_at)+'</td></tr>'}).join("")+'</table></div>';
  }).catch(function(){box.innerHTML='<div class="err">'+NA+'</div>'});
}

// ---- 下載 ----
function dlFile(path,fallback){
  return fetch(path,{headers:{Authorization:"Bearer "+tok},cache:"no-store"}).then(function(r){
    if(!r.ok)throw new Error("http "+r.status);
    var cd=r.headers.get("Content-Disposition")||"",m=/filename[*]=UTF-8''([^;]+)/.exec(cd);
    return r.blob().then(function(bl){var u=URL.createObjectURL(bl),x=document.createElement("a");x.href=u;x.download=m?decodeURIComponent(m[1]):fallback;document.body.appendChild(x);x.click();x.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000)})})}
document.querySelectorAll("[data-f]").forEach(function(b){b.addEventListener("click",function(){var f=b.getAttribute("data-f");b.disabled=true;dlFile(f,f.slice(1)).then(function(){b.textContent="已下載"},function(){b.textContent="下載失敗"}).then(function(){b.disabled=false})})});
$("dl").addEventListener("click",function(){
  var b=$("dl");b.disabled=true;$("dlMsg").textContent="下載中…";
  dlFile("/daily.csv","daily.csv").then(function(){return dlFile("/hourly.csv","hourly.csv")}).then(function(){return dlFile("/usage-detail.csv","usage-detail.csv")})
  .then(function(){$("dlMsg").textContent="已下載三個檔案：每日總表、每小時總表、逐筆明細"},function(){$("dlMsg").textContent="下載失敗，請稍後再試"}).then(function(){b.disabled=false});
});

// ---- 載入與切換 ----
function renderAll(){
  renderQuota();
  var o=pick();renderTake(o);renderAlerts(o);renderKPI(o);renderReport(o);
  $("capPill").textContent=D.today&&D.today.daily_spend_cap_twd?"每日上限用了 "+pct0(D.today.est_cost_twd/D.today.daily_spend_cap_twd):"每日上限用了 —";
  document.querySelectorAll("#range button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-r")===D.range)});
}
function needPlay(r){return r==="30d"?[]:(r==="today"?["today"]:["today",r])}
function loadRange(){
  var jobs=needPlay(D.range).map(function(r){return soft("/stats-play?range="+r).then(function(j){D.play[r]=j})});
  if(D.range==="30d"&&!D.daily)jobs.push(soft("/stats-daily").then(function(j){D.daily=j}));
  return Promise.all(jobs).then(renderAll)}
$("range").addEventListener("click",function(ev){var r=ev.target.getAttribute&&ev.target.getAttribute("data-r");if(!r)return;D.range=r;try{sessionStorage.setItem("lifegame_dash_range",r)}catch(e){}
  renderAll();loadRange().catch(authFail)});
$("trendPick").addEventListener("click",function(ev){var k=ev.target.getAttribute&&ev.target.getAttribute("data-k");if(!k)return;D.trendKey=k;
  document.querySelectorAll("#trendPick button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-k")===k)});renderTrend()});
function showTab(n){
  document.documentElement.scrollTop=0;document.body.scrollTop=0;
  $("paneR").hidden=n!=="r";$("paneT").hidden=n!=="t";$("paneN").hidden=n!=="n";
  $("tabR").setAttribute("aria-selected",n==="r");$("tabT").setAttribute("aria-selected",n==="t");$("tabN").setAttribute("aria-selected",n==="n");
  if(n==="t"){if(D.daily)renderTrend();else soft("/stats-daily").then(function(j){D.daily=j;renderTrend()}).catch(authFail)}
  if(n==="n")loadRoster();
}
$("tabR").addEventListener("click",function(){showTab("r")});
$("tabT").addEventListener("click",function(){showTab("t")});
$("tabN").addEventListener("click",function(){showTab("n")});
function authFail(e){if(e&&e.auth){try{sessionStorage.removeItem(KEY)}catch(x){} tok="";$("app").hidden=true;$("login").hidden=false;$("loginErr").textContent="密碼錯誤"}}
var busy=false;
function load(){
  if(busy)return;busy=true;D.play={};D.daily=null;
  var jobs=[soft("/stats-summary").then(function(j){D.sum=j}),soft("/usage-today").then(function(j){D.today=j})];
  needPlay(D.range).forEach(function(r){jobs.push(soft("/stats-play?range="+r).then(function(j){D.play[r]=j}))});
  if(D.range==="30d"||!$("paneT").hidden)jobs.push(soft("/stats-daily").then(function(j){D.daily=j}));
  return Promise.all(jobs).then(function(){
    $("login").hidden=true;$("app").hidden=false;
    renderAll();if(!$("paneT").hidden)renderTrend();
    $("upd").textContent=new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei",hour12:false});
  }).catch(authFail).then(function(){busy=false});
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
