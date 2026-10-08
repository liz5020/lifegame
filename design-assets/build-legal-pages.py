#!/usr/bin/env python3
# 十、10.16（2026-10-08）：從設計文件10.16.6～10.16.8的全文區塊（逐字）產生三個靜態頁面 terms.html／privacy.html／pricing.html（放在根目錄，build-pages.sh會放進dist/）。
# 用法：python3 design-assets/build-legal-pages.py   （條款、隱私或收費說明改文字時：先改設計文件，再重跑這支）
import re, html, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
doc = open(os.path.join(ROOT, "life-sim-design/10-存檔與帳號系統.md"), encoding="utf-8").read()
def block(heading):
    i = doc.index("### " + heading)
    a = doc.index("````markdown\n", i) + len("````markdown\n")
    b = doc.index("\n````", a)
    return doc[a:b]
OPERATOR = ["經營者：人生草稿（個人經營）", "客服信箱：support@draftmylife.com", "回覆時間：3 個工作天內"]
PAGES = {
    "terms": ("10.16.6", "服務條款", "人生草稿服務條款"),
    "privacy": ("10.16.7", "隱私權政策", "人生草稿隱私權政策"),
    "pricing": ("10.16.8", "收費說明", "收費說明"),
}
def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = t.replace("support@draftmylife.com", '<a href="mailto:support@draftmylife.com">support@draftmylife.com</a>')
    t = t.replace("draftmylife.com", "draftmylife.com")
    return t
def convert(md, page):
    out = []; lines = md.split("\n"); i = 0
    def flush_list(items, tag):
        if items: out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % inline(x) for x in items), tag))
    while i < len(lines):
        ln = lines[i]
        if not ln.strip(): i += 1; continue
        if ln.startswith("# "):
            out.append("<h1>%s</h1>" % inline(ln[2:])); i += 1; continue
        if ln.startswith("## "):
            title = ln[3:]
            out.append('<h2%s>%s</h2>' % (' id="refund"' if "退款說明" in title and page == "terms" else "", inline(title))); i += 1; continue
        if re.match(r"^(版本 [\d.]+｜)?最後更新", ln):
            out.append('<p class="meta">%s</p>' % inline(ln)); i += 1; continue
        if re.match(r"^（.*(出現條件|加錨點|開放購買|優惠期間|第七條連到).*）$", ln.strip()) or ln.strip().startswith("（此標題加錨點"):
            i += 1; continue  # 給程式的出現條件說明，不放上網頁
        if ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            head, body = rows[0], [r for r in rows[2:]]
            out.append('<div class="table-wrap"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (
                "".join("<th>%s</th>" % inline(c) for c in head),
                "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in body)))
            continue
        if re.match(r"^\d+\. ", ln):
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]): items.append(re.sub(r"^\d+\. ", "", lines[i])); i += 1
            flush_list(items, "ol"); continue
        if ln.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "): items.append(lines[i][2:]); i += 1
            flush_list(items, "ul"); continue
        if ln.strip() == "**購買功能準備中，開放時會在遊戲內公告。**":
            out.append('<p class="notice" id="prep-note"><strong>購買功能準備中，開放時會在遊戲內公告。</strong></p>'); i += 1; continue
        if ln.strip() == "**開站首月，第一次購買多送 10%。**":
            out.append('<p class="notice" id="launch-offer" hidden><strong>開站首月，第一次購買多送 10%。</strong></p>'); i += 1; continue
        para = [ln]; i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#|\d+\. |- |\||（)", lines[i]): para.append(lines[i]); i += 1
        out.append("<p>%s</p>" % "<br>".join(inline(x) for x in para))
    return "\n".join(out)
CSS = """
:root{--paper:#F7F0E3;--card:#FAF4EA;--ink:#4A2E1F;--soft:#8A6F5E;--line:rgba(74,46,31,.16);--stamp:#C8553D;
--serif:"Noto Serif TC","Songti TC","PMingLiU",serif;--sans:"PingFang TC","Noto Sans TC","Microsoft JhengHei","Heiti TC",sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#1F1712;--card:#2A201A;--ink:#F1E6D6;--soft:#B49C89;--line:rgba(241,230,214,.18);--stamp:#E58B73}}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.8;-webkit-font-smoothing:antialiased}
main{max-width:720px;margin:0 auto;padding:16px 16px 40px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 0 12px;border-bottom:1px solid var(--line);font-size:14px}
.top a{color:var(--stamp);text-decoration:none;font-weight:600}
.top .nav a{margin-left:12px;font-weight:400;color:var(--soft)}
h1{font-family:var(--serif);font-size:26px;margin:22px 0 4px;line-height:1.35}
h2{font-family:var(--serif);font-size:19px;margin:28px 0 6px;line-height:1.4;scroll-margin-top:12px}
p,li{font-size:16px}
p{margin:8px 0}
.meta{color:var(--soft);font-size:14px;margin:0 0 14px}
ol,ul{padding-left:1.4em;margin:8px 0}
li{margin:6px 0}
a{color:var(--stamp)}
.notice{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--stamp);border-radius:8px;padding:10px 14px;margin:14px 0}
.table-wrap{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;min-width:420px;background:var(--card);border:1px solid var(--line);border-radius:8px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);font-size:15px;white-space:nowrap}
th{color:var(--soft);font-weight:600}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);font-size:14px;color:var(--soft)}
footer p{margin:2px 0;font-size:14px}
footer .links{margin-top:12px}
footer .links a{margin-right:14px}
"""
PRICING_JS = """
<script>
// 開站首月優惠與「購買功能準備中」的出現條件（十、10.16.8）：開放購買前顯示「準備中」；開放購買後（填入開放當天）拿掉，並在優惠期間內顯示首月優惠一行
var PURCHASE_OPENED_ON = null;   // 開放購買當天（台灣日期 "YYYY-MM-DD"），開放購買時填入
var LAUNCH_OFFER_DAYS = 30;      // 開站首月優惠天數（與後台設定值一致，預設30）
(function(){
  if(!PURCHASE_OPENED_ON) return;
  var prep = document.getElementById("prep-note"); if(prep) prep.hidden = true;
  var start = Date.parse(PURCHASE_OPENED_ON + "T00:00:00+08:00"), now = Date.now();
  var offer = document.getElementById("launch-offer");
  if(offer && now >= start && now < start + LAUNCH_OFFER_DAYS * 86400000) offer.hidden = false;
})();
</script>"""
def page(slug):
    sec, label, h1 = PAGES[slug]
    body = convert(block(sec + " "), slug)
    others = [(s, PAGES[s][1]) for s in ("pricing", "terms", "privacy") if s != slug]
    return """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#F7F0E3">
<title>%s｜人生草稿</title>
<style>%s</style></head><body><main>
<div class="top"><a href="/">← 回到遊戲</a><span class="nav">%s</span></div>
%s
<footer>
<p>%s</p><p>%s</p><p>%s</p>
<p class="links">%s</p>
</footer>%s
</main></body></html>
""" % (label, CSS,
       "".join('<a href="/%s">%s</a>' % (s, l) for s, l in others),
       body, inline(OPERATOR[0]), inline(OPERATOR[1]), inline(OPERATOR[2]),
       "".join('<a href="/%s">%s</a>' % (s, l) for s, l in others),
       PRICING_JS if slug == "pricing" else "")
for slug in PAGES:
    open(os.path.join(ROOT, slug + ".html"), "w", encoding="utf-8").write(page(slug))
    print("wrote", slug + ".html")
