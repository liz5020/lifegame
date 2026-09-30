// 回應小工具(從worker.js抽出來，帳號相關的路由檔也要用)
export function corsHeaders(origin, extra) {
  return Object.assign({
    "Access-Control-Allow-Origin": origin || "",
    "Content-Type": "application/json"
  }, extra || {});
}
export function jsonResponse(origin, obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: corsHeaders(origin) });
}
