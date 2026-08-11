const Router = require('@koa/router');
const { query, execute } = require('../db');
const { ok, fail } = require('../util/response');

const router = new Router();
const TABLE = '`player`';
const BAG_TABLE = '`player_bag`';
const APPID = "wx95b659fd6d604ea4";
const SECRET = "f44da78ebfc2d9fee1985964dbfee908";

// ==================== 登录接口 ====================

router.post('/api/player/wechatlogin', async (ctx) => {
    const { code, nickName, avatarUrl } = ctx.request.body || {}
    if (!code) return fail(ctx, 'code不能为空')

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`
    let wxData
    try {
        const res = await fetch(url)
        wxData = await res.json()
    } catch (e) {
        return fail(ctx, '微信接口请求失败')
    }
    if (wxData.errcode) return fail(ctx, wxData.errmsg)

    // 检查用户是否存在
    const rows = await query(`SELECT * FROM ${TABLE} WHERE openid = ?`, [wxData.openid])
    if (rows.length) return ok(ctx, rows[0])

    // 新用户注册：openid 必填，session_key 建议保存，nickName/avatarUrl 由客户端传入
    await execute(
        `INSERT INTO ${TABLE} (openid, score, nickName, avatarUrl,session_key) VALUES (?, ?, ?, ?, ?)`,
        [wxData.openid, 0, nickName || '', avatarUrl || '', wxData.session_key]
    )

    const newRows = await query(`SELECT * FROM ${TABLE} WHERE openid = ?`, [wxData.openid])
    ok(ctx, newRows[0])
})

// ==================== 背包接口 ====================

// 获取背包列表  GET /api/player/:playerId/bag
router.get('/api/player/:playerId/bag', async (ctx) => {
    const { playerId } = ctx.params
    const list = await query(`SELECT * FROM ${BAG_TABLE} WHERE playerId = ?`, [playerId])
    ok(ctx, list)
})

// 添加物品  POST /api/player/:playerId/bag/add  body: { itemId, count }
router.post('/api/player/:playerId/bag/add', async (ctx) => {
    const { playerId } = ctx.params
    const { itemId, count } = ctx.request.body || {}
    if (!itemId) return fail(ctx, '缺少 itemId')
    const n = Math.max(1, parseInt(count) || 1)

    // 查是否已有该物品
    const rows = await query(`SELECT * FROM ${BAG_TABLE} WHERE playerId = ? AND itemId = ?`, [playerId, itemId])
    if (rows.length) {
        // 已有则累加数量
        await execute(`UPDATE ${BAG_TABLE} SET count = count + ? WHERE playerId = ? AND itemId = ?`, [n, playerId, itemId])
    } else {
        // 没有则新增
        await execute(`INSERT INTO ${BAG_TABLE} (playerId, itemId, count) VALUES (?, ?, ?)`, [playerId, itemId, n])
    }
    ok(ctx, null, '添加成功')
})

// 使用物品  POST /api/player/:playerId/bag/use  body: { itemId, count }
router.post('/api/player/:playerId/bag/use', async (ctx) => {
    const { playerId } = ctx.params
    const { itemId, count } = ctx.request.body || {}
    if (!itemId) return fail(ctx, '缺少 itemId')
    const n = Math.max(1, parseInt(count) || 1)

    const rows = await query(`SELECT * FROM ${BAG_TABLE} WHERE playerId = ? AND itemId = ?`, [playerId, itemId])
    if (!rows.length) return fail(ctx, '物品不存在')
    if (rows[0].count < n) return fail(ctx, '数量不足')

    const newCount = rows[0].count - n
    if (newCount <= 0) {
        // 用完删除记录
        await execute(`DELETE FROM ${BAG_TABLE} WHERE playerId = ? AND itemId = ?`, [playerId, itemId])
    } else {
        await execute(`UPDATE ${BAG_TABLE} SET count = ? WHERE playerId = ? AND itemId = ?`, [newCount, playerId, itemId])
    }
    ok(ctx, null, '使用成功')
})

// 丢弃物品  POST /api/player/:playerId/bag/discard  body: { itemId, count }
router.post('/api/player/:playerId/bag/discard', async (ctx) => {
    const { playerId } = ctx.params
    const { itemId, count } = ctx.request.body || {}
    if (!itemId) return fail(ctx, '缺少 itemId')
    const n = Math.max(1, parseInt(count) || 1)

    const rows = await query(`SELECT * FROM ${BAG_TABLE} WHERE playerId = ? AND itemId = ?`, [playerId, itemId])
    if (!rows.length) return fail(ctx, '物品不存在')
    if (rows[0].count < n) return fail(ctx, '数量不足')

    const newCount = rows[0].count - n
    if (newCount <= 0) {
        await execute(`DELETE FROM ${BAG_TABLE} WHERE playerId = ? AND itemId = ?`, [playerId, itemId])
    } else {
        await execute(`UPDATE ${BAG_TABLE} SET count = ? WHERE playerId = ? AND itemId = ?`, [newCount, playerId, itemId])
    }
    ok(ctx, null, '丢弃成功')
})

module.exports = router;