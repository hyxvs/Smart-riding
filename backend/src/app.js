require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./config/database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const routeRoutes = require('./routes/route');
const reportRoutes = require('./routes/report');
const poiRoutes = require('./routes/poi');
const aiRoutes = require('./routes/ai');
const adminRoutes = require('./routes/admin');
const teamRoutes = require('./routes/team');
const notificationRoutes = require('./routes/notification');
const analysisRoutes = require('./routes/analysis');
const bufferRoutes = require('./routes/buffer');

const app = express();

app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175'],
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { code: 429, message: '请求过于频繁，请稍后再试' }
});
// 监听请求
app.use((req, res, next) => {
  console.log(`收到请求: ${req.method} ${req.url}`);
  next();
});

app.use('/api', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/poi', poiRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/buffer', bufferRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    code: err.status || 500,
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

const PORT = process.env.PORT || 3002;

const startServer = async () => {
  try {
    console.log('正在连接数据库...');
    await db.query('SELECT NOW()');
    console.log('✅ 数据库连接成功');
    
    console.log(`正在启动服务器，端口: ${PORT}...`);
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 服务器运行在 http://127.0.0.1:${PORT}`);
      console.log(`📚 API文档: http://127.0.0.1:${PORT}/api/health`);
      console.log('✅ 服务器启动成功');
    });
    
    // 监听服务器错误
    server.on('error', (error) => {
      console.error('服务器错误:', error);
    });
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
