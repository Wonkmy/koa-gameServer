/**
 * 表结构元数据管理模块
 * 配合可视化页面，实现"不写代码就能建表"：
 * - 页面配置好字段后调用这里，服务端自动执行 CREATE TABLE 并保存元数据
 * - 元数据保存在 sys_tables 表，供动态 CRUD 模块使用
 */
const Router = require('@koa/router')
const { query, execute } = require('../db')
const { ok, fail } = require('../util/response')

const router = new Router()

// 表名/字段名合法性校验（防止 SQL 注入）
const NAME_REG = /^[a-zA-Z_][a-zA-Z0-9_]*$/
function isValidName(name) {
  return NAME_REG.test(name)
}

// 字段定义转 MySQL 类型
function toMysqlType(f) {
  const type = (f.type || 'varchar').toLowerCase()
  const len = f.length ? parseInt(f.length) : 0
  switch (type) {
    case 'int':
      return len ? `INT(${len})` : 'INT'
    case 'bigint':
      return len ? `BIGINT(${len})` : 'BIGINT'
    case 'tinyint':
      return len ? `TINYINT(${len})` : 'TINYINT'
    case 'decimal':
      return len ? `DECIMAL(${len})` : 'DECIMAL(10,2)'
    case 'float':
      return 'FLOAT'
    case 'double':
      return 'DOUBLE'
    case 'text':
      return 'TEXT'
    case 'longtext':
      return 'LONGTEXT'
    case 'datetime':
      return 'DATETIME'
    case 'timestamp':
      return 'TIMESTAMP'
    case 'json':
      return 'JSON'
    case 'varchar':
    default:
      // varchar 长度限制 1~5000，未填则默认 255
      return `VARCHAR(${Math.min(Math.max(len || 255, 1), 5000)})`
  }
}

// 转义字符串中的单引号，避免拼 SQL 时被破坏
function escapeStr(s) {
  return String(s == null ? '' : s).replace(/'/g, "''")
}

/**
 * 根据字段定义生成 CREATE TABLE 语句
 * fields: [{ name, type, length, comment, notNull, defaultValue, isPrimary, autoIncrement }]
 */
function buildCreateSql(tableName, tableComment, fields) {
  const cols = []
  const pks = [] // 主键字段
  for (const f of fields) {
    let def = `\`${f.name}\` ${toMysqlType(f)}`
    if (f.notNull) def += ' NOT NULL'
    if (f.autoIncrement) def += ' AUTO_INCREMENT'
    if (f.defaultValue !== undefined && f.defaultValue !== '') {
      def += ` DEFAULT '${escapeStr(f.defaultValue)}'`
    }
    if (f.comment) def += ` COMMENT '${escapeStr(f.comment)}'`
    cols.push(def)
    if (f.isPrimary) pks.push(`\`${f.name}\``)
  }
  if (pks.length) cols.push(`PRIMARY KEY (${pks.join(', ')})`)
  return `CREATE TABLE \`${tableName}\` (${cols.join(', ')}) COMMENT='${escapeStr(tableComment)}'`
}

// 校验并规整字段定义，返回 { ok, fields, error }
function normalizeFields(fields) {
  if (!Array.isArray(fields) || !fields.length) {
    return { ok: false, error: '至少需要一个字段' }
  }
  const names = new Set()
  for (const f of fields) {
    if (!f.name || !isValidName(f.name)) {
      return { ok: false, error: `字段名不合法: ${f.name}` }
    }
    if (names.has(f.name)) {
      return { ok: false, error: `字段名重复: ${f.name}` }
    }
    names.add(f.name)
  }
  return { ok: true, fields }
}

// 查询表列表（含元数据）  GET /api/table-meta
router.get('/api/table-meta', async (ctx) => {
  const rows = await query('SELECT id, table_name, table_comment, created_at, updated_at FROM sys_tables ORDER BY id DESC')
  ok(ctx, rows)
})

// 查询单个表元数据  GET /api/table-meta/:tableName
router.get('/api/table-meta/:tableName', async (ctx) => {
  const { tableName } = ctx.params
  if (!isValidName(tableName)) return fail(ctx, '非法表名')
  const rows = await query('SELECT * FROM sys_tables WHERE table_name = ?', [tableName])
  if (!rows.length) return fail(ctx, '表不存在', 404)
  const row = rows[0]
  ok(ctx, { ...row, fields: JSON.parse(row.fields) })
})

// 创建表  POST /api/table-meta  body: { tableName, tableComment, fields }
router.post('/api/table-meta', async (ctx) => {
  const { tableName, tableComment = '', fields } = ctx.request.body || {}
  if (!tableName || !isValidName(tableName)) return fail(ctx, '表名不合法')

  const check = normalizeFields(fields)
  if (!check.ok) return fail(ctx, check.error)

  // 表已存在则拒绝，避免误覆盖
  const exists = await query('SELECT id FROM sys_tables WHERE table_name = ?', [tableName])
  if (exists.length) return fail(ctx, `表 ${tableName} 已存在`)

  // 1. 真实建表
  await execute(buildCreateSql(tableName, tableComment, check.fields))
  // 2. 保存元数据
  await execute(
    'INSERT INTO sys_tables (table_name, table_comment, fields) VALUES (?, ?, ?)',
    [tableName, tableComment, JSON.stringify(check.fields)]
  )
  ok(ctx, { tableName }, '建表成功')
})

// 修改表配置  PUT /api/table-meta/:tableName
// 支持：修改表说明；新增字段（自动执行 ALTER TABLE ADD COLUMN，不会删除已有字段）
router.put('/api/table-meta/:tableName', async (ctx) => {
  const { tableName } = ctx.params
  const { tableComment, fields } = ctx.request.body || {}
  if (!isValidName(tableName)) return fail(ctx, '非法表名')

  const metaRows = await query('SELECT * FROM sys_tables WHERE table_name = ?', [tableName])
  if (!metaRows.length) return fail(ctx, '表不存在', 404)
  const meta = metaRows[0]

  // 解析出新增的字段并逐个 ALTER ADD
  if (Array.isArray(fields)) {
    const check = normalizeFields(fields)
    if (!check.ok) return fail(ctx, check.error)
    const oldFields = JSON.parse(meta.fields)
    const oldNames = new Set(oldFields.map((f) => f.name))
    const newFields = check.fields.filter((f) => !oldNames.has(f.name))
    for (const f of newFields) {
      let def = `ADD COLUMN \`${f.name}\` ${toMysqlType(f)}`
      if (f.notNull) def += ' NOT NULL'
      if (f.defaultValue !== undefined && f.defaultValue !== '') {
        def += ` DEFAULT '${escapeStr(f.defaultValue)}'`
      }
      if (f.comment) def += ` COMMENT '${escapeStr(f.comment)}'`
      await execute(`ALTER TABLE \`${tableName}\` ${def}`)
    }
    // 更新元数据为最新字段列表
    await execute('UPDATE sys_tables SET fields = ? WHERE table_name = ?', [JSON.stringify(check.fields), tableName])
  }

  // 修改表说明
  if (tableComment !== undefined) {
    await execute('UPDATE sys_tables SET table_comment = ? WHERE table_name = ?', [tableComment, tableName])
  }
  ok(ctx, null, '修改成功')
})

// 删除表  DELETE /api/table-meta/:tableName （会同时删除数据表和元数据）
router.delete('/api/table-meta/:tableName', async (ctx) => {
  const { tableName } = ctx.params
  if (!isValidName(tableName)) return fail(ctx, '非法表名')

  const metaRows = await query('SELECT id FROM sys_tables WHERE table_name = ?', [tableName])
  if (!metaRows.length) return fail(ctx, '表不存在', 404)

  await execute(`DROP TABLE \`${tableName}\``)
  await execute('DELETE FROM sys_tables WHERE table_name = ?', [tableName])
  ok(ctx, null, '删除成功')
})

module.exports = router
