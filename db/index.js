/**
 * 数据库模块：连接池 + 通用查询
 * 所有模块统一从这里访问 MySQL
 */
const mysql = require('mysql2/promise')
const config = require('../config')

let pool = null

/**
 * 初始化：自动创建数据库、连接池、系统表
 * 服务启动时调用一次
 */
async function init() {
  // 先不带库名连接，用于创建数据库（如果还不存在）
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password
  })
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  )
  await conn.end()

  // 创建连接池
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    connectionLimit: 10,
    // 日期直接以字符串返回，方便前端展示
    dateStrings: true
  })

  // 系统表：保存可视化页面配置的表结构元数据（fields 为 JSON 字符串）
  await execute(`
    CREATE TABLE IF NOT EXISTS sys_tables (
      id INT AUTO_INCREMENT PRIMARY KEY,
      table_name VARCHAR(64) NOT NULL UNIQUE COMMENT '表名',
      table_comment VARCHAR(255) NOT NULL DEFAULT '' COMMENT '表说明',
      fields TEXT NOT NULL COMMENT '字段定义JSON数组',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) COMMENT='表结构元数据'
  `)

  // 示例表：user（对应 user 模块示例）
  await execute(`
    CREATE TABLE IF NOT EXISTS \`user\` (
      id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
      username VARCHAR(64) NOT NULL UNIQUE COMMENT '用户名',
      password VARCHAR(128) NOT NULL DEFAULT '' COMMENT '密码',
      nickname VARCHAR(64) NOT NULL DEFAULT '' COMMENT '昵称',
      email VARCHAR(128) NOT NULL DEFAULT '' COMMENT '邮箱',
      status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1正常 0禁用',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
    ) COMMENT='用户表'
  `)
}

/**
 * 通用查询（SELECT 等返回行数据的操作）
 * @param {string} sql    SQL 语句（参数用 ? 占位）
 * @param {Array}  params 参数数组
 * @returns 行数据数组
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

/**
 * 通用执行（INSERT / UPDATE / DELETE / DDL 等）
 * @param {string} sql    SQL 语句（参数用 ? 占位）
 * @param {Array}  params 参数数组
 * @returns 执行结果对象（含 affectedRows / insertId 等）
 */
async function execute(sql, params = []) {
  const [result] = await pool.query(sql, params)
  return result
}

module.exports = { init, query, execute }
