/**
 * user 模块示例
 * 一个标准的增删改查模块，作为后续新模块的模板：
 * 1. 用 @koa/router 创建路由
 * 2. 通过 db.query / db.execute 操作数据库
 * 3. 用 util/response 的 ok / fail 返回统一格式
 */
const Router = require('@koa/router')
const { query, execute } = require('../db')
const { ok, fail } = require('../util/response')

const router = new Router()
const TABLE = '`user`'

/**
 * @swagger
 * /api/user/list:
 *   get:
 *     summary: 分页查询用户列表
 *     tags: [user]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *         description: 每页条数
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 按用户名/昵称模糊搜索
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 message: { type: string, example: ok }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     pageSize: { type: integer }
 *                     list: { type: array, items: { type: object } }
 */
router.get('/api/user/list', async (ctx) => {
  const page = Math.max(parseInt(ctx.query.page) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(ctx.query.pageSize) || 10, 1), 100)
  const keyword = (ctx.query.keyword || '').trim()

  // 支持按用户名/昵称模糊搜索
  let where = ''
  const params = []
  if (keyword) {
    where = 'WHERE username LIKE ? OR nickname LIKE ?'
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  // 总数与列表分开查询，简单直观
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${TABLE} ${where}`, params)
  const list = await query(
    `SELECT * FROM ${TABLE} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  )
  ok(ctx, { total, page, pageSize, list })
})

// 查询单个用户  GET /api/user/:id
/**
 * @swagger
 * /api/user/{id}:
 *   get:
 *     summary: 查询单个用户
 *     tags: [user]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 用户ID
 *     responses:
 *       200:
 *         description: 成功
 *       404:
 *         description: 用户不存在
 */
router.get('/api/user/:id', async (ctx) => {
  const id = parseInt(ctx.params.id)
  const rows = await query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id])
  if (!rows.length) return fail(ctx, '用户不存在', 404)
  ok(ctx, rows[0])
})

// 新增用户  POST /api/user  body: { username, password, nickname, email }
/**
 * @swagger
 * /api/user:
 *   post:
 *     summary: 新增用户
 *     tags: [user]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username: { type: string, description: 用户名（必填） }
 *               password: { type: string, default: '' }
 *               nickname: { type: string, default: '' }
 *               email: { type: string, default: '' }
 *     responses:
 *       200:
 *         description: 创建成功
 *       400:
 *         description: 参数错误
 */
router.post('/api/user', async (ctx) => {
  const { username, password = '', nickname = '', email = '' } = ctx.request.body || {}
  if (!username) return fail(ctx, '用户名不能为空')

  // 检查用户名是否重复
  const exists = await query(`SELECT id FROM ${TABLE} WHERE username = ?`, [username])
  if (exists.length) return fail(ctx, '用户名已存在')

  const result = await execute(
    `INSERT INTO ${TABLE} (username, password, nickname, email) VALUES (?, ?, ?, ?)`,
    [username, password, nickname, email]
  )
  ok(ctx, { id: result.insertId }, '创建成功')
})

// 修改用户  PUT /api/user/:id  body: { password, nickname, email, status }
/**
 * @swagger
 * /api/user/{id}:
 *   put:
 *     summary: 修改用户
 *     tags: [user]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string }
 *               nickname: { type: string }
 *               email: { type: string }
 *               status: { type: integer, description: '状态：1正常 0禁用' }
 *     responses:
 *       200:
 *         description: 修改成功
 *       404:
 *         description: 用户不存在
 */
router.put('/api/user/:id', async (ctx) => {
  const id = parseInt(ctx.params.id)
  const body = ctx.request.body || {}
  // 允许修改的字段白名单，防止传入非法字段
  const fields = ['password', 'nickname', 'email', 'status']
  const sets = []
  const params = []
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`)
      params.push(body[f])
    }
  }
  if (!sets.length) return fail(ctx, '没有需要修改的字段')

  const result = await execute(`UPDATE ${TABLE} SET ${sets.join(', ')} WHERE id = ?`, [...params, id])
  if (!result.affectedRows) return fail(ctx, '用户不存在', 404)
  ok(ctx, null, '修改成功')
})

// 删除用户  DELETE /api/user/:id
/**
 * @swagger
 * /api/user/{id}:
 *   delete:
 *     summary: 删除用户
 *     tags: [user]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 用户不存在
 */
router.delete('/api/user/:id', async (ctx) => {
  const id = parseInt(ctx.params.id)
  const result = await execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id])
  if (!result.affectedRows) return fail(ctx, '用户不存在', 404)
  ok(ctx, null, '删除成功')
})

module.exports = router
