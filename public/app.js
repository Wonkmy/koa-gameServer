/**
 * 可视化配置页面逻辑
 * - 表列表展示 / 新建表 / 表结构编辑（新增字段）
 * - 数据管理：自动生成新增表单、分页列表、删除
 */

let currentTable = null   // 当前选中表名
let currentMeta = null    // 当前表的元数据
let currentPage = 1
let currentTotal = 0
let currentPageSize = 10

// 字段类型选项
const FIELD_TYPES = ['varchar', 'int', 'bigint', 'tinyint', 'decimal', 'float', 'double', 'text', 'longtext', 'datetime', 'timestamp', 'json']

// ---------- 工具 ----------

// 请求封装，自动处理 JSON
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(data.message || '请求失败')
  return data.data
}

// HTML 转义，防止特殊字符破坏页面
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 提示条
function toast(msg, type = 'success') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 2000)
}

// 读取一行字段编辑器的值
function readFieldRow(row) {
  return {
    name: row.querySelector('.f-name').value.trim(),
    type: row.querySelector('.f-type').value,
    length: row.querySelector('.f-length').value,
    notNull: row.querySelector('.f-null').checked,
    isPrimary: row.querySelector('.f-pk').checked,
    autoIncrement: row.querySelector('.f-auto').checked,
    defaultValue: row.querySelector('.f-default').value,
    comment: row.querySelector('.f-comment').value
  }
}

// 添加一行字段编辑器（默认添加到新建表区域）
function addFieldRow(container = document.getElementById('newFields'), field = {}) {
  const row = document.createElement('div')
  row.className = 'field-row'
  row.innerHTML = `
    <input class="f-name" placeholder="字段名" value="${esc(field.name)}" />
    <select class="f-type">
      ${FIELD_TYPES.map((t) => `<option ${field.type === t ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <input class="f-length" type="number" placeholder="长度" value="${esc(field.length)}" />
    <label><input class="f-null" type="checkbox" ${field.notNull ? 'checked' : ''} />非空</label>
    <label><input class="f-pk" type="checkbox" ${field.isPrimary ? 'checked' : ''} />主键</label>
    <label><input class="f-auto" type="checkbox" ${field.autoIncrement ? 'checked' : ''} />自增</label>
    <input class="f-default" placeholder="默认值" value="${esc(field.defaultValue)}" />
    <input class="f-comment" placeholder="注释" value="${esc(field.comment)}" />
    <button class="remove" onclick="this.parentElement.remove()">✕</button>
  `
  container.appendChild(row)
}

// 添加自增主键字段（默认结构，默认添加到新建表区域）
function addPkRow(container = document.getElementById('newFields')) {
  addFieldRow(container, { name: 'id', type: 'int', notNull: true, isPrimary: true, autoIncrement: true, comment: '主键' })
}

// ---------- 表列表 ----------

async function loadTables() {
  const list = await api('/api/table-meta')
  const ul = document.getElementById('tableList')
  if (!list.length) {
    ul.innerHTML = '<li style="color:#95a5a6">暂无表，请在右侧新建</li>'
    return
  }
  ul.innerHTML = list.map((t) => `
    <li class="${t.table_name === currentTable ? 'active' : ''}" onclick="openTable('${t.table_name}')">
      <div>
        <div class="t-name">${esc(t.table_name)}</div>
        <div class="t-comment">${esc(t.table_comment || '')}</div>
      </div>
      <div>
        <button class="btn-mini btn" onclick="event.stopPropagation();openTable('${t.table_name}')">管理</button>
      </div>
    </li>
  `).join('')
}

// ---------- 新建表 ----------

function collectFields(containerId) {
  const container = document.getElementById(containerId)
  const rows = container.querySelectorAll('.field-row')
  const fields = []
  for (const row of rows) {
    const f = readFieldRow(row)
    if (!f.name) continue
    fields.push(f)
  }
  return fields
}

async function createTable() {
  const tableName = document.getElementById('newTableName').value.trim()
  const tableComment = document.getElementById('newTableComment').value.trim()
  const fields = collectFields('newFields')
  if (!tableName) return toast('请填写表名', 'error')
  if (!fields.length) return toast('请至少添加一个字段', 'error')
  try {
    await api('/api/table-meta', { method: 'POST', body: { tableName, tableComment, fields } })
    toast('建表成功')
    document.getElementById('newTableName').value = ''
    document.getElementById('newTableComment').value = ''
    document.getElementById('newFields').innerHTML = ''
    await loadTables()
    openTable(tableName)
  } catch (e) {
    toast(e.message, 'error')
  }
}

// ---------- 表详情 ----------

async function openTable(tableName) {
  currentTable = tableName
  document.getElementById('detailTitle').textContent = `表：${tableName}`
  document.getElementById('configBox').classList.remove('hidden')
  document.getElementById('dataBox').classList.remove('hidden')
  document.getElementById('dataApiTable').textContent = tableName
  await loadTables()
  await loadMeta()
  await loadData(1)
}

async function loadMeta() {
  currentMeta = await api(`/api/table-meta/${currentTable}`)
  document.getElementById('editTableComment').value = currentMeta.table_comment
  const box = document.getElementById('editFields')
  box.innerHTML = ''
  currentMeta.fields.forEach((f) => addFieldRow(box, f))
}

// 保存表配置（新增字段会执行 ALTER，已有字段仅更新元数据）
async function saveConfig() {
  const tableComment = document.getElementById('editTableComment').value
  const fields = collectFields('editFields')
  if (!fields.length) return toast('至少保留一个字段', 'error')
  try {
    await api(`/api/table-meta/${currentTable}`, { method: 'PUT', body: { tableComment, fields } })
    toast('配置已保存')
    await loadMeta()
    await loadData(1)
  } catch (e) {
    toast(e.message, 'error')
  }
}

function addEditFieldRow() {
  addFieldRow(document.getElementById('editFields'))
}

async function deleteTable() {
  if (!confirm(`确定删除表 ${currentTable} 及其所有数据？此操作不可恢复！`)) return
  try {
    await api(`/api/table-meta/${currentTable}`, { method: 'DELETE' })
    toast('表已删除')
    currentTable = null
    document.getElementById('detailTitle').textContent = '选择左侧的表查看详情'
    document.getElementById('configBox').classList.add('hidden')
    document.getElementById('dataBox').classList.add('hidden')
    await loadTables()
  } catch (e) {
    toast(e.message, 'error')
  }
}

// ---------- 数据管理 ----------

// 根据字段自动生成新增数据表单
function renderInsertForm() {
  const form = document.getElementById('insertForm')
  form.innerHTML = ''
  const { fields, pk } = currentMeta
  // 自增主键不参与手工输入
  for (const f of fields) {
    if (f.isPrimary && f.autoIncrement) continue
    const item = document.createElement('div')
    item.className = 'i-item'
    item.innerHTML = `
      <span>${esc(f.name)}${f.comment ? '（' + esc(f.comment) + '）' : ''}${f.notNull ? ' *' : ''}</span>
      <input class="i-val" data-name="${esc(f.name)}" placeholder="请输入${esc(f.comment || f.name)}" />
    `
    form.appendChild(item)
  }
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'btn btn-primary'
  btn.textContent = '新增'
  btn.onclick = insertData
  form.appendChild(btn)
}

async function insertData() {
  const body = {}
  const items = document.querySelectorAll('#insertForm .i-val')
  // 数值类型字段留空时不传，避免 MySQL 报 "Incorrect integer value: ''"
  const NUMERIC_TYPES = ['int', 'bigint', 'tinyint', 'decimal', 'float', 'double']
  for (const item of items) {
    const val = item.value
    const field = currentMeta.fields.find((f) => f.name === item.dataset.name)
    if (val === '' && field && NUMERIC_TYPES.includes(field.type)) continue
    body[item.dataset.name] = val
  }
  // 去掉空字符串以外的空值检查：让服务端做必填校验
  try {
    await api(`/api/dyn/${currentTable}`, { method: 'POST', body })
    toast('新增成功')
    await loadData(currentPage)
  } catch (e) {
    toast(e.message, 'error')
  }
}

// 渲染基础接口文档
function renderApiDoc(fields, pkName) {
  const box = document.getElementById('apiDoc')
  const t = currentTable
  // 非自增主键字段和必填字段在新增时必须传
  const required = fields.filter((f) => f.notNull && !(f.isPrimary && f.autoIncrement)).map((f) => f.name)
  const example = {}
  fields.forEach((f) => {
    if (f.isPrimary && f.autoIncrement) return
    example[f.name] = f.type === 'int' || f.type === 'bigint' || f.type === 'tinyint' ? 0 : ''
  })

  const items = [
    {
      method: 'GET',
      url: `/api/dyn/${t}?page=1&pageSize=10`,
      desc: '分页查询列表',
      body: null
    },
    {
      method: 'GET',
      url: `/api/dyn/${t}/:id`,
      desc: '查询单条（:id 替换为实际主键值）',
      body: null
    },
    {
      method: 'POST',
      url: `/api/dyn/${t}`,
      desc: '新增一条数据',
      body: JSON.stringify(example, null, 2),
      note: required.length ? `必填字段：${required.join(', ')}` : ''
    },
    {
      method: 'PUT',
      url: `/api/dyn/${t}/:id`,
      desc: '修改一条数据（:id 替换为实际主键值）',
      body: JSON.stringify(example, null, 2)
    },
    {
      method: 'DELETE',
      url: `/api/dyn/${t}/:id`,
      desc: '删除一条数据（:id 替换为实际主键值）',
      body: null
    }
  ]

  box.innerHTML = items.map((it) => `
    <div class="api-item">
      <span class="api-method method-${it.method.toLowerCase()}">${it.method}</span>
      <code>${esc(it.url)}</code>
      <span class="api-desc">${esc(it.desc)}</span>
      ${it.note ? `<div class="api-note">${esc(it.note)}</div>` : ''}
      ${it.body ? `<pre class="api-body">${esc(it.body)}</pre>` : ''}
    </div>
  `).join('')
}

async function loadData(page) {
  if (!currentTable) return
  currentPage = page
  // 数据接口不再返回 fields/pk，单独请求元数据
  const [data, meta] = await Promise.all([
    api(`/api/dyn/${currentTable}?page=${page}&pageSize=${currentPageSize}`),
    api(`/api/table-meta/${currentTable}`)
  ])
  currentMeta = meta
  currentTotal = data.total
  const fields = meta.fields
  const pk = fields.find((f) => f.isPrimary) || fields.find((f) => f.name === 'id')
  const pkName = pk ? pk.name : 'id'

  renderApiDoc(fields, pkName)
  renderInsertForm()

  // 渲染表头
  const thead = document.querySelector('#dataTable thead')
  thead.innerHTML = '<tr>' + fields.map((f) => `<th>${esc(f.name)}</th>`).join('') + '<th>操作</th></tr>'

  // 渲染数据行
  const tbody = document.querySelector('#dataTable tbody')
  if (!data.list.length) {
    tbody.innerHTML = '<tr><td colspan="99" style="text-align:center;color:#95a5a6">暂无数据</td></tr>'
  } else {
    tbody.innerHTML = data.list.map((row) => `
      <tr>
        ${fields.map((f) => `<td>${esc(row[f.name])}</td>`).join('')}
        <td class="op"><button class="btn btn-mini" onclick="deleteRow('${pkName}', '${row[pkName]}')">删除</button></td>
      </tr>
    `).join('')
  }

  // 分页信息
  const totalPages = Math.max(Math.ceil(data.total / currentPageSize), 1)
  document.getElementById('pageInfo').textContent = `共 ${data.total} 条，第 ${data.page} / ${totalPages} 页`
  document.getElementById('prevPage').disabled = page <= 1
  document.getElementById('nextPage').disabled = page >= totalPages
}

async function deleteRow(pk, id) {
  if (!confirm('确定删除这条数据？')) return
  try {
    await api(`/api/dyn/${currentTable}/${id}`, { method: 'DELETE' })
    toast('删除成功')
    await loadData(currentPage)
  } catch (e) {
    toast(e.message, 'error')
  }
}

// ---------- 初始化 ----------

// 新建表区域默认放一个自增主键字段
addPkRow(document.getElementById('newFields'))
loadTables()
