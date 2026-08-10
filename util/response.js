/**
 * 统一响应格式工具
 * 所有接口统一返回 { code, message, data }
 * code = 0 表示成功，非 0 表示失败
 */

// 成功响应
function ok(ctx, data = null, message = 'ok') {
  ctx.body = { code: 0, message, data }
}

// 失败响应，status 为 HTTP 状态码
function fail(ctx, message, status = 400) {
  ctx.status = status
  ctx.body = { code: status, message, data: null }
}

module.exports = { ok, fail }
