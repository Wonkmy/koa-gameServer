/**
 * 服务入口文件
 * 启动流程：初始化数据库 -> 加载中间件 -> 注册路由 -> 监听端口
 */
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const serve = require('koa-static');
const { koaSwagger } = require('koa2-swagger-ui');
const path = require('path');
const config = require('./config');
const { init } = require('./db');
const errorHandler = require('./middlewares/errorHandler');
const router = require('./modules');
const swaggerSpec = require('./swagger');

async function main() {
  // 1. 初始化数据库（自动建库、建系统表、建示例表）
  await init();

  // 2. 创建 Koa 实例并挂载中间件
  const app = new Koa();
  app.use(errorHandler);// 全局错误处理
  app.use(cors());// 跨域
  app.use(bodyParser());// 解析 JSON 请求体

  // 3. Swagger 接口文档页面
  app.use(koaSwagger({ routePrefix: '/api-docs', swaggerOptions: { spec: swaggerSpec } }));

  // 4. 注册业务路由（图片预览也在这里面）
  app.use(router.routes());
  app.use(router.allowedMethods());

  // 5. 静态资源（可视化建表页面）
  app.use(serve(path.join(__dirname, 'public')));

  // 6. 启动服务（自动查找可用端口，避免冲突）
  const actualPort = await config.findAvailablePort(config.port)
  app.listen(actualPort, () => {
    console.log(`游戏服务端已启动: http://localhost:${actualPort}`)
    console.log(`可视化建表页面: http://localhost:${actualPort}/`)
    console.log(`Swagger 接口文档: http://localhost:${actualPort}/api-docs`)
  })
}

main().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});
