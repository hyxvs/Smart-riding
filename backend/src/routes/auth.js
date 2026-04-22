const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { phone, password, nickname } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
    }

    const existingUser = await query('SELECT id FROM "user" WHERE phone = $1', [phone]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ code: 400, message: '该手机号已注册' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO "user" (phone, password_hash, nickname, status) 
       VALUES ($1, $2, $3, 'active') 
       RETURNING id, phone, nickname, role, status`,
      [phone, passwordHash, nickname || `用户${phone.slice(-4)}`]
    );

    const user = result.rows[0];
    await query('INSERT INTO user_point (user_id) VALUES ($1)', [user.id]);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      code: 200,
      message: '注册成功',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ code: 500, message: '注册失败' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
    }

    const result = await query(
      'SELECT * FROM "user" WHERE phone = $1',
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({ code: 403, message: '账号已被禁用' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ code: 401, message: '密码错误' });
    }

    await query(
      'UPDATE "user" SET last_login_at = NOW(), last_login_ip = $1 WHERE id = $2',
      [req.ip, user.id]
    );

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          nickname: user.nickname,
          avatar: user.avatar,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ code: 500, message: '登录失败' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.phone, u.nickname, u.avatar, u.gender, u.birthday, u.role, u.status,
              up.total_points, up.available_points, up.level, up.experience
       FROM "user" u
       LEFT JOIN user_point up ON u.id = up.user_id
       WHERE u.id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    res.json({ code: 200, data: result.rows[0] });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ code: 500, message: '获取用户信息失败' });
  }
});

router.post('/wechat-login', async (req, res) => {
  try {
    const { code } = req.body;
    
    res.status(501).json({ code: 501, message: '微信登录功能待配置' });
  } catch (error) {
    console.error('微信登录失败:', error);
    res.status(500).json({ code: 500, message: '微信登录失败' });
  }
});

module.exports = router;
