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
// 返回图片预览链接
router.post('/api/upload', upload.single('file'), async (ctx) => {
    if (!ctx.file) return fail(ctx, '请选择图片文件')
    // 返回可直接在浏览器预览的链接
    const url = `http://${ctx.request.host}/uploads/${ctx.file.filename}`;
    ok(ctx, { url, filename: ctx.file.filename }, '上传成功')
});

module.exports = router;
