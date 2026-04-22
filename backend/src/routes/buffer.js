const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// 缓冲区分析API
router.post('/', async (req, res) => {
  try {
    const { targetType, targetId, distances, targetCoords } = req.body;
    
    if (!targetType || (!targetId && !targetCoords)) {
      return res.status(400).json({ code: 400, message: '缺少必要参数' });
    }

    const results = [];
    
    for (const distance of distances) {
      let targetGeom;
      
      // 获取目标几何形状
      if (targetCoords) {
        // 使用用户提供的坐标
        targetGeom = `ST_SetSRID(ST_MakePoint(${targetCoords[0]}, ${targetCoords[1]}), 4326)`;
      } else {
        // 从数据库获取目标
        if (targetType === 'poi') {
          const poiResult = await query('SELECT geom FROM poi WHERE id = $1', [targetId]);
          if (poiResult.rows.length === 0) {
            return res.status(404).json({ code: 404, message: 'POI不存在' });
          }
          targetGeom = 'p.geom';
        } else if (targetType === 'road') {
          const roadResult = await query('SELECT geom FROM road WHERE id = $1', [targetId]);
          if (roadResult.rows.length === 0) {
            return res.status(404).json({ code: 404, message: '道路不存在' });
          }
          targetGeom = 'r.geom';
        } else {
          return res.status(400).json({ code: 400, message: '不支持的目标类型' });
        }
      }

      // 计算缓冲区
      let bufferQuery;
      if (targetCoords) {
        bufferQuery = `
          WITH buffer AS (
            SELECT ST_Buffer(${targetGeom}::geography, ${distance})::geometry as buffer_geom
          )
          SELECT 
            ST_AsGeoJSON(buffer_geom)::json as buffer,
            (SELECT COUNT(*) FROM poi WHERE ST_Intersects(poi.geom, buffer_geom)) as poi_count,
            (SELECT COUNT(*) FROM road WHERE ST_Intersects(road.geom, buffer_geom)) as road_count
          FROM buffer
        `;
      } else if (targetType === 'poi') {
        bufferQuery = `
          WITH buffer AS (
            SELECT ST_Buffer(p.geom::geography, $1)::geometry as buffer_geom
            FROM poi p
            WHERE p.id = $2
          )
          SELECT 
            ST_AsGeoJSON(buffer_geom)::json as buffer,
            (SELECT COUNT(*) FROM poi WHERE ST_Intersects(poi.geom, buffer_geom) AND id != $2) as poi_count,
            (SELECT COUNT(*) FROM road WHERE ST_Intersects(road.geom, buffer_geom)) as road_count
          FROM buffer
        `;
      } else if (targetType === 'road') {
        bufferQuery = `
          WITH buffer AS (
            SELECT ST_Buffer(r.geom::geography, $1)::geometry as buffer_geom
            FROM road r
            WHERE r.id = $2
          )
          SELECT 
            ST_AsGeoJSON(buffer_geom)::json as buffer,
            (SELECT COUNT(*) FROM poi WHERE ST_Intersects(poi.geom, buffer_geom)) as poi_count,
            (SELECT COUNT(*) FROM road WHERE ST_Intersects(road.geom, buffer_geom)) as road_count
          FROM buffer
        `;
      }

      let bufferResult;
      if (targetCoords) {
        bufferResult = await query(bufferQuery);
      } else {
        bufferResult = await query(bufferQuery, [distance, targetId]);
      }
      
      if (bufferResult.rows.length > 0) {
        const bufferData = bufferResult.rows[0];
        
        // 获取缓冲区内的POI列表
        let poiQuery;
        if (targetCoords) {
          poiQuery = `
            WITH buffer AS (
              SELECT ST_Buffer(${targetGeom}::geography, ${distance})::geometry as buffer_geom
            )
            SELECT 
              p.id, 
              p.name, 
              p.category, 
              ST_AsGeoJSON(p.geom)::json as location,
              ST_Distance(${targetGeom}::geography, p.geom::geography) as distance_m
            FROM poi p, buffer
            WHERE ST_Intersects(p.geom, buffer.buffer_geom)
            ORDER BY distance_m ASC
            LIMIT 50
          `;
        } else if (targetType === 'poi') {
          poiQuery = `
            WITH buffer AS (
              SELECT ST_Buffer(p.geom::geography, $1)::geometry as buffer_geom
              FROM poi p
              WHERE p.id = $2
            )
            SELECT 
              p2.id, 
              p2.name, 
              p2.category, 
              ST_AsGeoJSON(p2.geom)::json as location,
              ST_Distance(p.geom::geography, p2.geom::geography) as distance_m
            FROM poi p, buffer, poi p2
            WHERE ST_Intersects(p2.geom, buffer.buffer_geom)
            AND p.id = $2
            AND p2.id != $2
            ORDER BY distance_m ASC
            LIMIT 50
          `;
        } else if (targetType === 'road') {
          poiQuery = `
            WITH buffer AS (
              SELECT ST_Buffer(r.geom::geography, $1)::geometry as buffer_geom
              FROM road r
              WHERE r.id = $2
            )
            SELECT 
              p.id, 
              p.name, 
              p.category, 
              ST_AsGeoJSON(p.geom)::json as location,
              ST_Distance(r.geom::geography, p.geom::geography) as distance_m
            FROM road r, buffer, poi p
            WHERE ST_Intersects(p.geom, buffer.buffer_geom)
            AND r.id = $2
            ORDER BY distance_m ASC
            LIMIT 50
          `;
        }
        
        let poiResult;
        if (targetCoords) {
          poiResult = await query(poiQuery);
        } else {
          poiResult = await query(poiQuery, [distance, targetId]);
        }
        
        results.push({
          distance,
          buffer: bufferData.buffer,
          poiCount: bufferData.poi_count,
          roadCount: bufferData.road_count,
          pois: poiResult.rows
        });
      }
    }

    // 保存分析结果到数据库
    if (targetId) {
      for (const result of results) {
        await query(`
          INSERT INTO buffer_result (user_id, target_type, target_id, buffer_distance, buffer_geom)
          VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
        `, [req.userId || null, targetType, targetId, result.distance, JSON.stringify(result.buffer)]);
      }
    }

    res.json({
      code: 200,
      message: '缓冲区分析成功',
      data: results
    });
    
  } catch (error) {
    console.error('缓冲区分析失败:', error);
    res.status(500).json({ code: 500, message: '缓冲区分析失败' });
  }
});

module.exports = router;
