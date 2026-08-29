const config = require('../config')

let tokenCache = {
  accessToken: '',
  expireTime: 0
}

function checkWxConfig() {
  if (!config.wx.appid || !config.wx.secret) {
    throw new Error('缺少 WX_APPID 或 WX_SECRET')
  }
}

async function codeToOpenid(code) {
  checkWxConfig()
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wx.appid}&secret=${config.wx.secret}&js_code=${code}&grant_type=authorization_code`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.openid) {
    throw new Error(`code2session 失败: ${JSON.stringify(data)}`)
  }
  return data.openid
}

async function getAccessToken() {
  checkWxConfig()
  const now = Date.now()
  if (tokenCache.accessToken && tokenCache.expireTime > now + 60000) {
    return tokenCache.accessToken
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${config.wx.appid}&secret=${config.wx.secret}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`)
  }

  tokenCache.accessToken = data.access_token
  tokenCache.expireTime = now + (Number(data.expires_in) || 7200) * 1000
  return tokenCache.accessToken
}

async function sendSubscribeMessage(openid, templateId, page, data) {
  const accessToken = await getAccessToken()
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: openid,
      template_id: templateId,
      page: page || 'pages/index/index',
      data
    })
  })
  const result = await res.json()
  return result
}

module.exports = {
  codeToOpenid,
  sendSubscribeMessage
}
