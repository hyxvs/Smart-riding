const express = require('express');
const router = express.Router();
const { query } = require('../../config/database');
const { auth } = require('../../middleware/auth');

router.get('/list', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, status } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT e.*,
                      (SELECT COUNT(*) FROM equipment_maintenance em WHERE em.equipment_id = e.id) as maintenance_count,
                      (SELECT MAX(em.maintenance_date) FROM equipment_maintenance em WHERE em.equipment_id = e.id) as last_maintenance_date
               FROM equipment e WHERE e.user_id = $1`;
    const params = [req.userId];
    let paramCount = 2;

    if (category) {
      sql += ` AND e.category = $${paramCount++}`;
      params.push(category);
    }
    if (status) {
      sql += ` AND e.status = $${paramCount++}`;
      params.push(status);
    }

    sql += ` ORDER BY e.is_default DESC, e.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    const countResult = await query(
      'SELECT COUNT(*) FROM equipment WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取装备列表失败:', error);
    res.status(500).json({ code: 500, message: '获取装备列表失败' });
  }
});

router.get('/categories', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM equipment_category WHERE user_id = $1 OR user_id IS NULL ORDER BY user_id ASC, name ASC`,
      [req.userId]
    );
    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取分类失败:', error);
    res.status(500).json({ code: 500, message: '获取分类失败' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await query(
      `SELECT
        (SELECT COUNT(*) FROM equipment WHERE user_id = $1 AND status = 'active') as active_count,
        (SELECT COUNT(*) FROM equipment WHERE user_id = $1) as total_count,
        (SELECT COALESCE(SUM(total_distance), 0) FROM equipment WHERE user_id = $1) as total_distance,
        (SELECT COUNT(*) FROM maintenance_reminder WHERE user_id = $1 AND is_reminded = false) as pending_reminders,
        (SELECT COUNT(*) FROM equipment WHERE user_id = $1 AND is_default = true) as default_count
      `,
      [req.userId]
    );

    const recentMaintenance = await query(
      `SELECT em.*, e.name as equipment_name
       FROM equipment_maintenance em
       JOIN equipment e ON em.equipment_id = e.id
       WHERE em.user_id = $1
       ORDER BY em.maintenance_date DESC
       LIMIT 5`,
      [req.userId]
    );

    res.json({
      code: 200,
      data: {
        ...stats.rows[0],
        recent_maintenance: recentMaintenance.rows
      }
    });
  } catch (error) {
    console.error('获取装备统计失败:', error);
    res.status(500).json({ code: 500, message: '获取统计失败' });
  }
});

router.get('/reminders', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT mr.*, e.name as equipment_name, e.category
       FROM maintenance_reminder mr
       JOIN equipment e ON mr.equipment_id = e.id
       WHERE mr.user_id = $1 AND mr.is_reminded = false
       ORDER BY mr.remind_at ASC, mr.mileage ASC`,
      [req.userId]
    );

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取保养提醒失败:', error);
    res.status(500).json({ code: 500, message: '获取保养提醒失败' });
  }
});

router.put('/reminders/:id/dismiss', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE maintenance_reminder
       SET is_reminded = true, reminded_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '提醒不存在' });
    }

    res.json({ code: 200, message: '已忽略提醒' });
  } catch (error) {
    console.error('忽略提醒失败:', error);
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT e.*,
              (SELECT json_agg(em.* ORDER BY em.maintenance_date DESC) FROM equipment_maintenance em WHERE em.equipment_id = e.id) as maintenance_history
       FROM equipment e WHERE e.id = $1 AND e.user_id = $2`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '装备不存在' });
    }

    const reminders = await query(
      `SELECT * FROM maintenance_reminder WHERE equipment_id = $1 AND user_id = $2 AND is_reminded = false ORDER BY remind_at ASC`,
      [id, req.userId]
    );

    res.json({
      code: 200,
      data: {
        ...result.rows[0],
        reminders: reminders.rows
      }
    });
  } catch (error) {
    console.error('获取装备详情失败:', error);
    res.status(500).json({ code: 500, message: '获取装备详情失败' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      category,
      brand,
      model,
      purchase_date,
      purchase_price,
      total_distance,
      current_mileage,
      description,
      images,
      is_default
    } = req.body;

    if (!name || !category) {
      return res.status(400).json({ code: 400, message: '装备名称和分类不能为空' });
    }

    if (is_default) {
      await query(
        'UPDATE equipment SET is_default = false WHERE user_id = $1',
        [req.userId]
      );
    }

    const result = await query(
      `INSERT INTO equipment (
        user_id, name, category, brand, model, purchase_date, purchase_price,
        total_distance, current_mileage, description, images, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        req.userId,
        name,
        category,
        brand || null,
        model || null,
        purchase_date || null,
        purchase_price || null,
        total_distance || 0,
        current_mileage || 0,
        description || null,
        images || [],
        is_default || false
      ]
    );

    res.json({ code: 200, data: { id: result.rows[0].id }, message: '添加成功' });
  } catch (error) {
    console.error('添加装备失败:', error);
    res.status(500).json({ code: 500, message: '添加装备失败' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      brand,
      model,
      purchase_date,
      purchase_price,
      total_distance,
      current_mileage,
      status,
      description,
      images,
      is_default
    } = req.body;

    const check = await query(
      'SELECT id FROM equipment WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '装备不存在' });
    }

    if (is_default) {
      await query(
        'UPDATE equipment SET is_default = false WHERE user_id = $1 AND id != $2',
        [req.userId, id]
      );
    }

    const updates = [];
    const values = [id, req.userId];
    let paramCount = 3;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (category) {
      updates.push(`category = $${paramCount++}`);
      values.push(category);
    }
    if (brand !== undefined) {
      updates.push(`brand = $${paramCount++}`);
      values.push(brand);
    }
    if (model !== undefined) {
      updates.push(`model = $${paramCount++}`);
      values.push(model);
    }
    if (purchase_date !== undefined) {
      updates.push(`purchase_date = $${paramCount++}`);
      values.push(purchase_date);
    }
    if (purchase_price !== undefined) {
      updates.push(`purchase_price = $${paramCount++}`);
      values.push(purchase_price);
    }
    if (total_distance !== undefined) {
      updates.push(`total_distance = $${paramCount++}`);
      values.push(total_distance);
    }
    if (current_mileage !== undefined) {
      updates.push(`current_mileage = $${paramCount++}`);
      values.push(current_mileage);
    }
    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (images !== undefined) {
      updates.push(`images = $${paramCount++}`);
      values.push(images);
    }
    if (is_default !== undefined) {
      updates.push(`is_default = $${paramCount++}`);
      values.push(is_default);
    }

    updates.push('updated_at = NOW()');

    await query(
      `UPDATE equipment SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2`,
      values
    );

    res.json({ code: 200, message: '更新成功' });
  } catch (error) {
    console.error('更新装备失败:', error);
    res.status(500).json({ code: 500, message: '更新装备失败' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM equipment WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '装备不存在' });
    }

    res.json({ code: 200, message: '删除成功' });
  } catch (error) {
    console.error('删除装备失败:', error);
    res.status(500).json({ code: 500, message: '删除装备失败' });
  }
});

router.post('/maintenance', auth, async (req, res) => {
  try {
    const {
      equipment_id,
      maintenance_type,
      description,
      maintenance_date,
      cost,
      mileage_at_maintenance,
      service_provider,
      contact_phone,
      next_maintenance_date,
      next_mileage,
      images
    } = req.body;

    if (!equipment_id || !maintenance_type || !maintenance_date) {
      return res.status(400).json({ code: 400, message: '缺少必要参数' });
    }

    const check = await query(
      'SELECT id, current_mileage FROM equipment WHERE id = $1 AND user_id = $2',
      [equipment_id, req.userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '装备不存在' });
    }

    const result = await query(
      `INSERT INTO equipment_maintenance (
        equipment_id, user_id, maintenance_type, description, maintenance_date,
        cost, mileage_at_maintenance, service_provider, contact_phone,
        next_maintenance_date, next_mileage, images
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        equipment_id,
        req.userId,
        maintenance_type,
        description || null,
        maintenance_date,
        cost || 0,
        mileage_at_maintenance || check.rows[0].current_mileage,
        service_provider || null,
        contact_phone || null,
        next_maintenance_date || null,
        next_mileage || null,
        images || []
      ]
    );

    if (next_maintenance_date || next_mileage) {
      await query(
        `INSERT INTO maintenance_reminder (
          equipment_id, user_id, reminder_type, remind_at, mileage, message
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          equipment_id,
          req.userId,
          next_maintenance_date ? 'date' : 'mileage',
          next_maintenance_date || null,
          next_mileage || null,
          `您的${maintenance_type}已到期，请及时进行保养`
        ]
      );
    }

    res.json({ code: 200, data: { id: result.rows[0].id }, message: '添加保养记录成功' });
  } catch (error) {
    console.error('添加保养记录失败:', error);
    res.status(500).json({ code: 500, message: '添加保养记录失败' });
  }
});

router.get('/maintenance/:equipmentId', auth, async (req, res) => {
  try {
    const { equipmentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const check = await query(
      'SELECT id FROM equipment WHERE id = $1 AND user_id = $2',
      [equipmentId, req.userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ code: 404, message: '装备不存在' });
    }

    const result = await query(
      `SELECT * FROM equipment_maintenance
       WHERE equipment_id = $1 AND user_id = $2
       ORDER BY maintenance_date DESC
       LIMIT $3 OFFSET $4`,
      [equipmentId, req.userId, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM equipment_maintenance WHERE equipment_id = $1 AND user_id = $2',
      [equipmentId, req.userId]
    );

    res.json({
      code: 200,
      data: {
        list: result.rows,
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取保养记录失败:', error);
    res.status(500).json({ code: 500, message: '获取保养记录失败' });
  }
});

module.exports = router;
