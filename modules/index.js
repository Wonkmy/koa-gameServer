/**
 * 路由统一注册入口
 * 新模块写好 router 后，在这里注册即可
 */
const Router = require('@koa/router')
const user = require('./user')
const tableMeta = require('./tableMeta')
const dynCrud = require('./dynCrud')

const router = new Router()

// 健康检查
router.get('/api/health', (ctx) => {
  ctx.body = { code: 0, message: 'ok', data: { time: Date.now() } }
})

// 注册各业务模块
router.use(user.routes(), user.allowedMethods())
router.use(tableMeta.routes(), tableMeta.allowedMethods())
router.use(dynCrud.routes(), dynCrud.allowedMethods())

module.exports = router
