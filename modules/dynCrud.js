/**
 * 动态表通用 CRUD 模块
 * 只要表在可视化页面创建过（有元数据），就自动拥有以下接口，无需写任何代码：
 *   GET    /api/dyn/:table?page=1&pageSize=10    分页查询
 *   GET    /api/dyn/:table/:id                    查询单条
 *   POST   /api/dyn/:table                        新增（body 为字段名 -> 值的对象）
 *   PUT    /api/dyn/:table/:id                    修改（body 为字段名 -> 值的对象）
 *   DELETE /api/dyn/:table/:id                    删除
 * 主键取元数据中 isPrimary 的字段，默认取名为 id 的字段
 */
const Router = require('@koa/router')
const { query, execute } = require('../db')
const { ok, fail } = require('../util/response')

const router = new Router()

// 表名合法性校验（防止 SQL 注入）
const NAME_REG = /^[a-zA-Z_][a-zA-Z0-9_]*$/
function isValidName(name) {
  return NAME_REG.test(name)
}

/**
 * 中间件：根据 :table 加载表元数据，挂到 ctx.state
 * 后续路由处理时直接使用 ctx.state.fields / ctx.state.pk
 */
async function loadTable(ctx, next) {
  const { table } = ctx.params
  if (!isValidName(table)) return fail(ctx, '非法表名')

  const rows = await query('SELECT * FROM sys_tables WHERE table_name = ?', [table])
  if (!rows.length) return fail(ctx, `表 ${table} 不存在，请先在可视化页面创建`, 404)

  ctx.state.table = table
  ctx.state.fields = JSON.parse(rows[0].fields)
  // 主键：优先取标记 isPrimary 的字段，否则默认 id
  const pkField = ctx.state.fields.find((f) => f.isPrimary) || ctx.state.fields.find((f) => f.name === 'id')
  ctx.state.pk = pkField ? pkField.name : 'id'
  await next()
}

/**
 * @swagger
 * /api/dyn/{table}:
 *   get:
 *     summary: 分页查询（通用接口，适用于所有可视化创建的表）
 *     tags: [动态CRUD]
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema: { type: string }
 *         description: 表名
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
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
router.get('/api/dyn/:table', loadTable, async (ctx) => {
  const { table, pk, fields } = ctx.state
  const page = Math.max(parseInt(ctx.query.page) || 1, 1)
  const pageSize = Math.min(Math.max(parseInt(ctx.query.pageSize) || 10, 1), 100)
  // 支持自定义排序字段，默认按主键倒序
  const sortBy = ctx.query.sortBy || ''
  const validField = fields.find(f => f.name === sortBy)
  const orderField = validField ? validField.name : pk

  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM \`${table}\``)
  const list = await query(
    `SELECT * FROM \`${table}\` ORDER BY \`${orderField}\` DESC LIMIT ? OFFSET ?`,
    [pageSize, (page - 1) * pageSize]
  )
  // 只返回分页数据，fields 元数据由 /api/table-meta/:tableName 接口提供
  ok(ctx, { total, page, pageSize, list })
})

/**
 * @swagger
 * /api/dyn/{table}/{id}:
 *   get:
 *     summary: 查询单条（通用接口）
 *     tags: [动态CRUD]
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 *       404:
 *         description: 数据不存在
 */
router.get('/api/dyn/:table/:id', loadTable, async (ctx) => {
  const { table, pk } = ctx.state
  const rows = await query(`SELECT * FROM \`${table}\` WHERE \`${pk}\` = ?`, [ctx.params.id])
  if (!rows.length) return fail(ctx, '数据不存在', 404)
  ok(ctx, rows[0])
})

/**
 * @swagger
 * /api/dyn/{table}:
 *   post:
 *     summary: 新增数据（通用接口，body 传字段名和值）
 *     tags: [动态CRUD]
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: 字段名和值的对象，具体字段由表结构决定
 *             example: { name: "面包", itemid: 10002 }
 *     responses:
 *       200:
 *         description: 新增成功
 */
router.post('/api/dyn/:table', loadTable, async (ctx) => {
  const { table, pk, fields } = ctx.state
  const body = ctx.request.body || {}

  // 过滤出元数据中存在的字段；自增主键不参与插入
  const insertFields = fields.filter((f) => !(f.isPrimary && f.autoIncrement))
  const cols = []
  const params = []
  for (const f of insertFields) {
    if (body[f.name] !== undefined) {
      cols.push(f.name)
      params.push(body[f.name])
    } else if (f.notNull && f.defaultValue === undefined) {
      // 必填字段且无默认值，校验是否缺失
      return fail(ctx, `字段 ${f.name} 不能为空`)
    }
  }
  if (!cols.length) return fail(ctx, '没有可写入的字段')

  const result = await execute(
    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params
  )
  ok(ctx, { [pk]: result.insertId }, '新增成功')
})

/**
 * @swagger
 * /api/dyn/{table}/{id}:
 *   put:
 *     summary: 修改数据（通用接口，body 传要修改的字段和值）
 *     tags: [动态CRUD]
 *     parameters:
 *       - in: path
 *         name: table
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: 要修改的字段名和值
 *             example: { name: "面包改", itemid: 10003 }
 *     responses:
 *       200:
 *         description: 修改成功
 *       404:
 *         description: 数据不存在
 */
router.put('/api/dyn/:table/:id', loadTable, async (ctx) => {
  const { table, pk, fields } = ctx.state
  const body = ctx.request.body || {}

  // 只更新元数据中存在的字段，主键不允许修改
  const sets = []
  const params = []
  for (const f of fields) {
    if (f.name === pk) continue
    if (body[f.name] !== undefined) {
      sets.push(`\`${f.name}\` = ?`)
      params.push(body[f.name])
    }
  }
  if (!sets.length) return fail(ctx, '没有需要修改的字段')

  const result = await execute(
    `UPDATE \`${table}\` SET ${sets.join(', ')} WHERE \`${pk}\` = ?`,
    [...params, ctx.params.id]
  )
  if (!result.affectedRows) return fail(ctx, '数据不存在', 404)
  ok(ctx, null, '修改成功')
})

// 删除  DELETE /api/dyn/:table/:id
router.delete('/api/dyn/:table/:id', loadTable, async (ctx) => {
  const { table, pk } = ctx.state
  const result = await execute(`DELETE FROM \`${table}\` WHERE \`${pk}\` = ?`, [ctx.params.id])
  if (!result.affectedRows) return fail(ctx, '数据不存在', 404)
  ok(ctx, null, '删除成功')
})

module.exports = router
