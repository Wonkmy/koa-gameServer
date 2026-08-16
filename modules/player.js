const Router = require('@koa/router');
const { query, execute } = require('../db');
const { ok, fail } = require('../util/response');

const router = new Router();
const TABLE = '`player`';
const COMMENT_TABLE = '`player_comment`';
const TRACK_TABLE = '`player_track`';

// ==================== 玩家基础接口 ====================

// 创建玩家  POST /api/player/create  body: { nickName, totalmoney }
// 客户端刚进入游戏时调用，记录昵称和初始金币，返回玩家id
router.post('/api/player/create', async (ctx) => {
    const { nickName, totalmoney } = ctx.request.body || {}
    if (!nickName) return fail(ctx, '缺少 nickName')
    const money = parseInt(totalmoney) || 1000
    const result = await execute(
        `INSERT INTO ${TABLE} (nickName, totalmoney) VALUES (?, ?)`,
        [nickName, money]
    )
    ok(ctx, { id: result.insertId }, '创建成功')
})

// 更新金币  POST /api/player/:id/money  body: { totalmoney }
// 通过玩家id更新总金币（覆盖写入）
router.post('/api/player/:id/money', async (ctx) => {
    const { id } = ctx.params
    const { totalmoney } = ctx.request.body || {}
    if (totalmoney === undefined || totalmoney === null) return fail(ctx, '缺少 totalmoney')
    const result = await execute(
        `UPDATE ${TABLE} SET totalmoney = ? WHERE id = ?`,
        [parseInt(totalmoney), id]
    )
    if (!result.affectedRows) return fail(ctx, '玩家不存在', 404)
    ok(ctx, null, '更新成功')
})

// 更新昵称  POST /api/player/:id/nickName  body: { nickName }
// 通过玩家id更新昵称（覆盖写入）
router.post('/api/player/:id/nickName', async (ctx) => {
    const { id } = ctx.params
    const { nickName } = ctx.request.body || {}
    if (nickName === undefined || nickName === null) return fail(ctx, '缺少 nickName')
    const result = await execute(
        `UPDATE ${TABLE} SET nickName = ? WHERE id = ?`,
        [nickName, id]
    )
    if (!result.affectedRows) return fail(ctx, '玩家不存在', 404)
    ok(ctx, null, '更新成功')
})



// 查询玩家信息  GET /api/player/:id
// 通过玩家id获取完整信息
router.get('/api/player/:id', async (ctx) => {
    const { id } = ctx.params
    const rows = await query(`SELECT * FROM ${TABLE} WHERE id = ?`, [id])
    if (!rows.length) return fail(ctx, '玩家不存在', 404)
    ok(ctx, rows[0])
})

// 查询金币  GET /api/player/:id/money
// 获取指定玩家的总金币
router.get('/api/player/:id/money', async (ctx) => {
    const { id } = ctx.params
    const rows = await query(`SELECT id, nickName, totalmoney FROM ${TABLE} WHERE id = ?`, [id])
    if (!rows.length) return fail(ctx, '玩家不存在', 404)
    ok(ctx, rows[0])
})

// ==================== 评价接口 ====================

// 提交评价  POST /api/player/:id/comment  body: { content }
// 客户端提交评价内容，通过玩家id关联
router.post('/api/player/:id/comment', async (ctx) => {
    const { id } = ctx.params
    const { content } = ctx.request.body || {}
    if (!content) return fail(ctx, '缺少 content')
    await execute(
        `INSERT INTO ${COMMENT_TABLE} (playerId, content) VALUES (?, ?)`,
        [id, content]
    )
    ok(ctx, null, '评价成功')
})

// 查询评价  GET /api/player/:id/comment
// 获取指定玩家的所有评价记录
router.get('/api/player/:id/comment', async (ctx) => {
    const { id } = ctx.params
    const list = await query(
        `SELECT * FROM ${COMMENT_TABLE} WHERE playerId = ? ORDER BY createTime DESC`,
        [id]
    )
    ok(ctx, list)
})

// ==================== 埋点接口 ====================

// 上报埋点  POST /api/player/:id/track  body: { scene }
// 玩家进入某个场景或点击某个功能时调用，自动累加次数
router.post('/api/player/:id/track', async (ctx) => {
    const { id } = ctx.params
    const { scene } = ctx.request.body || {}
    if (!scene) return fail(ctx, '缺少 scene')

    // 查是否已有该场景记录，有则累加次数，没有则新增
    const rows = await query(
        `SELECT * FROM ${TRACK_TABLE} WHERE playerId = ? AND scene = ?`,
        [id, scene]
    )
    if (rows.length) {
        await execute(
            `UPDATE ${TRACK_TABLE} SET count = count + 1, updateTime = CURRENT_TIMESTAMP WHERE playerId = ? AND scene = ?`,
            [id, scene]
        )
    } else {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await execute(
            `INSERT INTO ${TRACK_TABLE} (playerId, scene, count, updateTime) VALUES (?, ?, 1, ?)`,
            [id, scene, now]
        )
    }
    ok(ctx, null, '上报成功')
})

// 查询埋点  GET /api/player/:id/track
// 获取指定玩家的所有埋点记录，按次数倒序
router.get('/api/player/:id/track', async (ctx) => {
    const { id } = ctx.params
    const list = await query(
        `SELECT * FROM ${TRACK_TABLE} WHERE playerId = ? ORDER BY count DESC`,
        [id]
    )
    ok(ctx, list)
})

module.exports = router;
