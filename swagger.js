/**
 * Swagger 配置
 * 扫描 modules 目录下所有路由文件的 JSDoc 注释，自动生成接口文档
 * 访问 /api-docs 查看文档
 */
const swaggerJSDoc = require('swagger-jsdoc')

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '游戏服务端 API 文档',
      version: '1.0.0',
      description: '基于 Koa 的游戏服务端，所有接口统一返回 { code, message, data }'
    },
    servers: [{ url: 'http://localhost:3000' }]
  },
  // 扫描这些文件中的 JSDoc 注释
  apis: ['./modules/*.js']
}

module.exports = swaggerJSDoc(options)
