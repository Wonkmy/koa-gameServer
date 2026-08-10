/**
 * 全局配置文件
 * 修改这里的配置即可切换数据库、端口等
 */
const net = require('net');

module.exports = {
  // 服务监听端口（优先读环境变量 PORT，未指定则默认 3000）
  port: parseInt(process.env.PORT) || 3000,

  // MySQL 数据库配置
  db: {
    host: '117.72.189.194',
    port: 3306,
    user: 'game_rank',
    password: '266973',
    // 数据库名，启动时若不存在会自动创建
    database: 'game_rank'
  },

  // 自动查找可用端口：如果指定端口被占用，自动 +1 直到找到可用端口
  findAvailablePort(startPort) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        resolve(this.findAvailablePort(startPort + 1));
      });
    });
  }
};
