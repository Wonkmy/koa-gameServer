/**
 * 全局错误处理中间件
 * 捕获所有未处理的异常，统一返回错误响应，避免服务崩溃
 */
const { fail } = require('../util/response')

module.exports = async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    // 打印错误日志，方便排查问题
    console.error(`[错误] ${ctx.method} ${ctx.url}`, err)
    fail(ctx, err.message || '服务器内部错误', 500)
  }
}
