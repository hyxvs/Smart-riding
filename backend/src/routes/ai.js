const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

async function callOllama(prompt, context = '') {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const systemPrompt = `你是"小虔"，一个专业的骑行助手。你可以帮助用户：
1. 规划骑行路线（最快、最短、最安全、风景、红色研学）
2. 查询周边POI和红色景点
3. 解答骑行相关问题
4. 引导用户上报民生问题
5. 提供骑行安全建议

请用友好、专业的语气回答用户问题。如果用户想要规划路线，请提取起点和终点信息。`;

    const fullPrompt = context ? `${context}\n\n用户问题：${prompt}` : prompt;
    
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: fullPrompt,
        system: systemPrompt,
        stream: false
      }),
      timeout: 30000
    });

    if (!response.ok) {
      throw new Error(`Ollama API错误: ${response.status}`);
    }

    const data = await response.json();
    return data.response || '抱歉，我暂时无法回答这个问题。';
  } catch (error) {
    console.error('调用Ollama失败:', error);
    return '抱歉，AI服务暂时不可用，请稍后再试。';
  }
}

async function searchKnowledge(question) {
  try {
    const result = await query(
      `SELECT question, answer, keywords
       FROM ai_knowledge
       WHERE is_active = true
         AND (question ILIKE $1 OR EXISTS (
           SELECT 1 FROM unnest(keywords) k WHERE $2 ILIKE '%' || k || '%'
         ))
       ORDER BY 
         similarity(question, $1) DESC,
         use_count ASC
       LIMIT 3`,
      [`%${question}%`, question]
    );

    return result.rows;
  } catch (error) {
    console.error('搜索知识库失败:', error);
    return [];
  }
}

function extractEntities(text) {
  const entities = {
    locations: [],
    intents: [],
    params: {}
  };

  const locationPatterns = [
    /从(.+?)到(.+?)(?:的|路线|怎么)/,
    /附近(?:的)?(.+?)/,
    /(.+?)在哪里/,
    /搜索(.+?)/
  ];

  locationPatterns.forEach(pattern => {
    const match = text.match(pattern);
    if (match) {
      entities.locations.push(...match.slice(1).filter(Boolean));
    }
  });

  if (text.includes('路线') || text.includes('导航') || text.includes('怎么走')) {
    entities.intents.push('route_plan');
  }
  if (text.includes('红色') || text.includes('革命') || text.includes('景点')) {
    entities.intents.push('red_spot');
  }
  if (text.includes('上报') || text.includes('投诉') || text.includes('问题')) {
    entities.intents.push('report');
  }
  if (text.includes('天气')) {
    entities.intents.push('weather');
  }

  return entities;
}

router.post('/chat', auth, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ code: 400, message: '消息不能为空' });
    }

    const currentSessionId = sessionId || uuidv4();

    const entities = extractEntities(message);

    const knowledgeResults = await searchKnowledge(message);
    let context = '';
    if (knowledgeResults.length > 0) {
      context = '相关知识：\n' + knowledgeResults.map(k => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n');
    }

    const response = await callOllama(message, context);

    await query(
      `INSERT INTO ai_chat_log (user_id, session_id, role, content, intent, entities)
       VALUES ($1, $2, 'user', $3, $4, $5)`,
      [req.userId, currentSessionId, message, entities.intents[0] || 'chat', JSON.stringify(entities)]
    );

    await query(
      `INSERT INTO ai_chat_log (user_id, session_id, role, content)
       VALUES ($1, $2, 'assistant', $3)`,
      [req.userId, currentSessionId, response]
    );

    res.json({
      code: 200,
      data: {
        response,
        sessionId: currentSessionId,
        entities
      }
    });
  } catch (error) {
    console.error('AI对话失败:', error);
    res.status(500).json({ code: 500, message: 'AI对话失败' });
  }
});

router.get('/history/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;

    const result = await query(
      `SELECT role, content, created_at
       FROM ai_chat_log
       WHERE user_id = $1 AND session_id = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [req.userId, sessionId, limit]
    );

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取对话历史失败:', error);
    res.status(500).json({ code: 500, message: '获取对话历史失败' });
  }
});

router.post('/voice', auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ code: 400, message: '语音文本不能为空' });
    }

    const entities = extractEntities(text);

    let response = '';
    let action = null;

    if (entities.intents.includes('route_plan') && entities.locations.length >= 2) {
      action = {
        type: 'route_plan',
        params: {
          start: entities.locations[0],
          end: entities.locations[1]
        }
      };
      response = `好的，我来为您规划从${entities.locations[0]}到${entities.locations[1]}的骑行路线。`;
    } else if (entities.intents.includes('red_spot')) {
      action = {
        type: 'search_poi',
        params: {
          isRedSpot: true
        }
      };
      response = '好的，我来为您查找附近的红色景点。';
    } else if (entities.intents.includes('report')) {
      action = {
        type: 'open_report'
      };
      response = '好的，我来帮您打开民情上报页面，请描述您要反映的问题。';
    } else {
      response = await callOllama(text);
    }

    res.json({
      code: 200,
      data: {
        response,
        action,
        entities
      }
    });
  } catch (error) {
    console.error('语音处理失败:', error);
    res.status(500).json({ code: 500, message: '语音处理失败' });
  }
});

router.get('/knowledge/list', async (req, res) => {
  try {
    const { category } = req.query;

    let sql = 'SELECT id, category, question, keywords FROM ai_knowledge WHERE is_active = true';
    const params = [];

    if (category) {
      sql += ' AND category = $1';
      params.push(category);
    }

    sql += ' ORDER BY use_count DESC';

    const result = await query(sql, params);

    res.json({ code: 200, data: result.rows });
  } catch (error) {
    console.error('获取知识库失败:', error);
    res.status(500).json({ code: 500, message: '获取知识库失败' });
  }
});

module.exports = router;
