const Router = require('@koa/router');
const multer = require('@koa/multer');
const path = require('path');
const fs = require('fs');
const { ok, fail } = require('../util/response');

const router = new Router();

// 图片存储目录
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
// 确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// 配置 multer：限制图片类型和大小（5MB）
const upload = multer({
    storage: multer.diskStorage({
        destination: UPLOAD_DIR,
        filename: (ctx, file, cb) => {
            // 用时间戳+随机数生成文件名，保留原扩展名
            const ext = path.extname(file.originalname);
            const name = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
            cb(null, name);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (ctx, file, cb) => {
        // 只允许图片格式
        const allowed = /jpeg|jpg|png|gif|webp|bmp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype.split('/')[1]);
        if (ext || mime) cb(null, true);
        else cb(new Error('只支持图片格式'));
    }
});

// 上传图片  POST /api/upload  body: FormData (file字段)
// 返回图片预览链接（通过API接口访问，兼容宝塔Nginx反代）
router.post('/api/upload', upload.single('file'), async (ctx) => {
    if (!ctx.file) return fail(ctx, '请选择图片文件')
    // 通过 /api/image/ 接口访问，避免宝塔Nginx反代拦截静态路径
    // 宝塔Nginx做了SSL终止（443端口），Node是HTTP（3000端口），链接不能带端口号
    const hostname = ctx.request.hostname; // 只取域名/IP，不带端口
    const url = `https://${hostname}/api/image/${ctx.file.filename}`;
    ok(ctx, { url, filename: ctx.file.filename }, '上传成功')
});

// 预览图片  GET /api/image/:filename
// 通过API接口返回图片，浏览器直接预览不下载
router.get('/api/image/:filename', async (ctx) => {
    const { filename } = ctx.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        ctx.status = 404;
        ctx.body = '图片不存在';
        return;
    }

    // 设置响应头，让浏览器直接预览
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    ctx.set('Content-Type', mimeType);
    ctx.set('Content-Disposition', 'inline'); // inline 表示预览，attachment 表示下载
    ctx.body = fs.createReadStream(filePath);
});

module.exports = router;
