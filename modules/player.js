const Router = require('@koa/router');
const { query, execute } = require('../db');
const { ok, fail } = require('../util/response');

const router = new Router();
const TABLE = '`player`';
const APPID = "wx95b659fd6d604ea4";
const SECRET = "f44da78ebfc2d9fee1985964dbfee908";


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

module.exports = router;