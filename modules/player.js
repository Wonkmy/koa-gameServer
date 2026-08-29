const Router = require('@koa/router');
const { query, execute } = require('../db');
const { ok, fail } = require('../util/response');
const { codeToOpenid, sendSubscribeMessage } = require('../util/wechat');

const router = new Router();
const TABLE = '`player`';
const COMMENT_TABLE = '`player_comment`';
const TRACK_TABLE = '`player_track`';
const CONFIG_TABLE = '`sys_config`';
const SUBSCRIBE_TABLE = '`player_subscribe`';

async function ensureSubscribeTable() {
    // 给 player 表补 openid 字段，重复执行会被 catch 忽略。
    try {
        await execute(`ALTER TABLE ${TABLE} ADD COLUMN openid VARCHAR(128) NOT NULL DEFAULT '' COMMENT '微信openid'`)
    } catch (e) {}

    await execute(`
        CREATE TABLE IF NOT EXISTS ${SUBSCRIBE_TABLE} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            playerId INT NOT NULL,
            openid VARCHAR(128) NOT NULL,
            scene VARCHAR(64) NOT NULL,
            templateId VARCHAR(128) NOT NULL,
            used TINYINT NOT NULL DEFAULT 0,
            createTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            sendTime DATETIME NULL,
            UNIQUE KEY uniq_player_scene_template (playerId, scene, templateId)
        ) COMMENT='玩家订阅消息记录'
    `)
}

// ==================== 玩家基础接口 ====================

// 创建玩家  POST /api/player/create  body: { nickName, totalmoney }
// 客户端刚进入游戏时调用，记录昵称和初始金币，返回玩家id
router.post('/api/player/create', async (ctx) => {
    const { nickName, totalmoney } = ctx.request.body || {}
    if (!nickName) return fail(ctx, '缺少 nickName')
    const money = parseInt(totalmoney) || 1000
    const result = await execute(
        `INSERT INTO ${TABLE} (nickName, totalmoney, createTime,avatarUrl,rankTotal) VALUES (?, ?, NOW(),"",0)`,
        [nickName, money]
    )
    ok(ctx, { id: result.insertId }, '创建成功')
})

// 保存微信openid  POST /api/player/:id/wx-login  body: { code }
// 客户端 wx.login 后把 code 发来，服务端换 openid 并保存到 player 表。
router.post('/api/player/:id/wx-login', async (ctx) => {
    const { id } = ctx.params
    const { code } = ctx.request.body || {}
    if (!code) return fail(ctx, '缺少 code')

    try {
        await ensureSubscribeTable()
        const openid = await codeToOpenid(code)
        const result = await execute(
            `UPDATE ${TABLE} SET openid = ? WHERE id = ?`,
            [openid, id]
        )
        if (!result.affectedRows) return fail(ctx, '玩家不存在', 404)
        ok(ctx, { openid }, '保存openid成功')
    } catch (err) {
        console.error('保存openid失败', err)
        fail(ctx, err.message || '保存openid失败', 500)
    }
})

// 保存订阅记录  POST /api/player/:id/subscribe  body: { code, scene, templateId }
// 用户同意订阅后调用，一次订阅通常只能发送一次。
router.post('/api/player/:id/subscribe', async (ctx) => {
    const { id } = ctx.params
    const { code, scene, templateId } = ctx.request.body || {}
    if (!scene) return fail(ctx, '缺少 scene')
    if (!templateId) return fail(ctx, '缺少 templateId')

    try {
        await ensureSubscribeTable()
        let rows = await query(`SELECT openid FROM ${TABLE} WHERE id = ?`, [id])
        if (!rows.length) return fail(ctx, '玩家不存在', 404)

        let openid = rows[0].openid
        if (!openid && code) {
            openid = await codeToOpenid(code)
            await execute(`UPDATE ${TABLE} SET openid = ? WHERE id = ?`, [openid, id])
        }
        if (!openid) return fail(ctx, '缺少 openid，请先调用 wx-login')

        await execute(
            `INSERT INTO ${SUBSCRIBE_TABLE} (playerId, openid, scene, templateId, used, createTime)
             VALUES (?, ?, ?, ?, 0, NOW())
             ON DUPLICATE KEY UPDATE openid = VALUES(openid), used = 0, createTime = NOW(), sendTime = NULL`,
            [id, openid, scene, templateId]
        )
        ok(ctx, null, '订阅记录保存成功')
    } catch (err) {
        console.error('保存订阅记录失败', err)
        fail(ctx, err.message || '保存订阅记录失败', 500)
    }
})

// 发送订阅消息  POST /api/subscribe/send  body: { scene, templateId, page, time, content, reward, feature }
// 这个接口建议只由你自己在服务器命令行或后台调用，不要暴露给普通玩家。
router.post('/api/subscribe/send', async (ctx) => {
    const { scene, templateId, page, time, content, reward, feature } = ctx.request.body || {}
    if (!scene) return fail(ctx, '缺少 scene')
    if (!templateId) return fail(ctx, '缺少 templateId')

    try {
        await ensureSubscribeTable()
        const list = await query(
            `SELECT * FROM ${SUBSCRIBE_TABLE} WHERE scene = ? AND templateId = ? AND used = 0`,
            [scene, templateId]
        )

        let success = 0
        let failCount = 0
        for (const item of list) {
            // 对应微信后台“活动提醒”模板字段：活动时间、活动内容、活动奖励、功能。
            const data = {
                time1: { value: time || new Date().toISOString().slice(0, 16).replace('T', ' ') },
                thing2: { value: content || '中秋月市限时开摊' },
                thing3: { value: reward || '节日限定旧物' },
                thing4: { value: feature || '高货专摊' }
            }
            const result = await sendSubscribeMessage(item.openid, templateId, page, data)
            if (result.errcode === 0) {
                success++
                await execute(`UPDATE ${SUBSCRIBE_TABLE} SET used = 1, sendTime = NOW() WHERE id = ?`, [item.id])
            } else {
                failCount++
                console.error('发送订阅消息失败', item.playerId, result)
            }
        }

        ok(ctx, { total: list.length, success, fail: failCount }, '发送完成')
    } catch (err) {
        console.error('发送订阅消息异常', err)
        fail(ctx, err.message || '发送订阅消息失败', 500)
    }
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

// 更新头像  POST /api/player/:id/avatar  body: { avatarUrl }
// 通过玩家id更新头像地址（覆盖写入）
router.post('/api/player/:id/avatar', async (ctx) => {
    const { id } = ctx.params
    const { avatarUrl } = ctx.request.body || {}
    if (!avatarUrl) return fail(ctx, '缺少 avatarUrl')
    const result = await execute(
        `UPDATE ${TABLE} SET avatarUrl = ? WHERE id = ?`,
        [avatarUrl, id]
    )
    if (!result.affectedRows) return fail(ctx, '玩家不存在', 404)
    ok(ctx, null, '更新成功')
})

// 更新段位  POST /api/player/:id/rankTotal  body: { rankTotal }
// 通过玩家id更新段位值（覆盖写入）
router.post('/api/player/:id/rankTotal', async (ctx) => {
    const { id } = ctx.params
    const { rankTotal } = ctx.request.body || {}
    if (rankTotal === undefined || rankTotal === null) return fail(ctx, '缺少 rankTotal')
    const result = await execute(
        `UPDATE ${TABLE} SET rankTotal = ? WHERE id = ?`,
        [parseInt(rankTotal), id]
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
        `INSERT INTO ${COMMENT_TABLE} (playerId, content, createTime) VALUES (?, ?, NOW())`,
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
        await execute(
            `INSERT INTO ${TRACK_TABLE} (playerId, scene, count, updateTime) VALUES (?, ?, 1, NOW())`,
            [id, scene]
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

// ==================== 通用配置读取 ====================

// 读取配置值  GET /api/config?key=xxx
// 客户端传 key，返回对应的 value，数据库里手动增删改
router.get('/api/config', async (ctx) => {
    const { key } = ctx.query
    if (!key) return fail(ctx, '缺少 key 参数')
    const rows = await query(
        `SELECT value FROM ${CONFIG_TABLE} WHERE \`key\` = ?`,
        [key]
    )
    if (!rows.length) return fail(ctx, '配置不存在', 404)
    ok(ctx, { key, value: rows[0].value })
})

module.exports = router;
