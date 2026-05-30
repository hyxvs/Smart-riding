const jwt = require('jsonwebtoken');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log(`[AUTH] 请求: ${req.method} ${req.path}, Authorization头: ${authHeader ? '存在 (' + authHeader.substring(0, 30) + '...)' : '不存在'}`);
    
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      console.log('[AUTH] 失败: 没有token');
      return res.status(401).json({ code: 401, message: '请先登录' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    console.log(`[AUTH] 成功: userId=${decoded.userId}, role=${decoded.role}`);
    next();
  } catch (error) {
    console.log(`[AUTH] 失败: ${error.message}`);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ code: 401, message: '无效的登录凭证' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ code: 403, message: '需要管理员权限' });
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      req.userRole = decoded.role;
    }
    next();
  } catch (error) {
    next();
  }
};

module.exports = { auth, adminOnly, optionalAuth };
