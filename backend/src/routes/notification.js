const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');

router.get('/list', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isRead } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT id, title, content, type, is_read, extra_data, created_at
               FROM notification
               WHERE user_id = $1`;
    
    const params = [req.userId];
    let paramCount = 2;

    if (type) {
      sql += ` AND type = $${paramCount++}`;
      params.push(type);
    }

    if (isRead !== undefined) {
      sql += ` AND is_read = $${paramCount++}`;
      params.push(isRead === 'true');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const unreadCount = await query(
      'SELECT COUNT(*) FROM notification WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        list: result.rows,
        unreadCount: parseInt(unreadCount.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取通知列表失败:', error);
    res.status(500).json({ code: 500, message: '获取通知列表失败' });
  }
});

router.post('/:id/read', auth, async (req, res) => {
  try {
    await query(
      'UPDATE notification SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    res.json({ code: 200, message: '标记已读' });
  } catch (error) {
    console.error('标记已读失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

router.post('/read-all', auth, async (req, res) => {
  try {
    await query(
      'UPDATE notification SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );

    res.json({ code: 200, message: '全部已读' });
  } catch (error) {
    console.error('全部已读失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await query(
      'DELETE FROM notification WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );

    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除通知失败:', error);
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

router.get('/unread-count', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT COUNT(*) FROM notification WHERE user_id = $1 AND is_read = false',
      [req.userId]
    );

    res.json({
      code: 200,
      data: { count: parseInt(result.rows[0].count) }
    });
  } catch (error) {
    console.error('获取未读数量失败:', error);
    res.status(500).json({ code: 500, message: '获取未读数量失败' });
  }
});

module.exports = router;
