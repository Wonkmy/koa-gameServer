const config = require('../config')

function getArg(name, defaultValue = '') {
  const prefix = `--${name}=`
  const found = process.argv.find(item => item.startsWith(prefix))
  return found ? found.slice(prefix.length) : defaultValue
}

async function main() {
  const scene = getArg('scene', 'midAutumn')
  const templateId = getArg('templateId')
  const time = getArg('time', new Date().toISOString().slice(0, 16).replace('T', ' '))
  const content = getArg('content', '中秋月市限时开摊')
  const reward = getArg('reward', '节日限定旧物')
  const feature = getArg('feature', '高货专摊')
  const page = getArg('page', 'pages/index/index')
  const host = getArg('host', `http://127.0.0.1:${config.port}`)

  if (!templateId) {
    console.error('缺少 --templateId=订阅模板ID')
    process.exit(1)
  }

  const res = await fetch(`${host}/api/subscribe/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene, templateId, time, content, reward, feature, page })
  })
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
