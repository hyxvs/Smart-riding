const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const {
  callGaodeWeatherApi,
  buildCurrentWeatherData,
  formatWeatherResponse
} = require('../utils/weather');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

async function callOllama(prompt, context = '') {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const systemPrompt = `你是"小虔"，一个专业的骑行助手。你可以帮助用户：
1. 规划骑行路线（最快、最短、最安全、风景、红色研学）
2. 查询周边POI和红色景点
3. 查询天气预报和骑行建议
4. 解答骑行相关问题
5. 引导用户上报民生问题
6. 提供骑行安全建议

当用户询问天气时，请提取城市名称并告知将为您查询天气信息。
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

const WEATHER_INTENT_PATTERN = /天气|气温|温度|下雨|降雨|风力|湿度|空气质量|穿什么|适合骑行/;
const TRIP_INTENT_PATTERN = /行程|旅行|旅游|骑行.*天|去.*骑|几天|制定.*计划|规划.*行程|安排.*行程|旅行计划/;
const WEATHER_CITY_PATTERNS = [
  /(?<city>[\u4e00-\u9fa5]{2,20}?(?:特别行政区|自治州|自治县|自治区|地区|盟|州|市|区|县))(?:的)?(?:实时)?(?:天气|气温|温度|下雨|降雨|风力|湿度|空气质量)/,
  /(?<city>[\u4e00-\u9fa5]{2,20}?)(?:的)?(?:实时)?(?:天气|气温|温度|下雨|降雨|风力|湿度|空气质量)(?:怎么样|如何|怎样|咋样)?/,
  /(?:查询|查一下|查查|看看|想知道|告诉我|帮我查)(?<city>[\u4e00-\u9fa5]{2,20}?(?:特别行政区|自治州|自治县|自治区|地区|盟|州|市|区|县))(?:的)?(?:天气|气温|温度|下雨|降雨|风力|湿度|空气质量)?/,
  /(?<city>[\u4e00-\u9fa5]{2,20}?)(?:今|明|后)天(?:的)?(?:天气|气温|温度|下雨|降雨|风力|湿度|空气质量)/,
  /(?:天气|气温|温度|下雨|降雨|风力|湿度|空气质量)(?:怎么样|如何|怎样|咋样)?(?:在)?(?<city>[\u4e00-\u9fa5]{2,20}?(?:特别行政区|自治州|自治县|自治区|地区|盟|州|市|区|县))/
];

function normalizeCityCandidate(rawCity = '') {
  const city = rawCity
    .replace(/^[在从到去]/, '')
    .replace(/[，。！？、,.!?？\s]/g, '')
    .replace(/(今|明|后)天.*$/, '')
    .replace(/(天气|气温|温度|下雨|降雨|风力|湿度|空气质量|穿什么|适合骑行).*$/, '')
    .trim();

  if (['这里', '那里', '本地', '当地', '附近', '当前', '现在'].includes(city)) {
    return '';
  }

  return city;
}

function extractWeatherCity(text) {
  if (!WEATHER_INTENT_PATTERN.test(text)) {
    return '';
  }

  for (const pattern of WEATHER_CITY_PATTERNS) {
    const match = text.match(pattern);
    const city = normalizeCityCandidate(match?.groups?.city || '');

    if (city) {
      return city;
    }
  }

  const looseMatches = text.match(/[\u4e00-\u9fa5]{2,20}?(?:特别行政区|自治州|自治县|自治区|地区|盟|州|市|区|县)/g) || [];

  for (const item of looseMatches) {
    const city = normalizeCityCandidate(item);

    if (city && !['天气', '气温', '温度'].includes(city)) {
      return city;
    }
  }

  return '';
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
    /搜索(.+?)/,
    /去(.+?)(?:骑行|旅行|旅游|度假)/
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
  if (WEATHER_INTENT_PATTERN.test(text)) {
    entities.intents.push('weather');
  }
  if (TRIP_INTENT_PATTERN.test(text)) {
    entities.intents.push('trip_plan');
  }

  const weatherCity = extractWeatherCity(text);
  if (weatherCity && !entities.locations.includes(weatherCity)) {
    entities.locations.push(weatherCity);
  }

  return entities;
}

function extractTripParams(text) {
  const params = {
    destination: '',
    durationDays: 0,
    budget: 0,
    interests: []
  };

  const cityMatch = text.match(/去(.+?)(?:骑行|旅行|旅游|度假|$|\d)/);
  if (cityMatch) {
    params.destination = cityMatch[1].trim();
  }

  const durationMatch = text.match(/(\d+)天/);
  if (durationMatch) {
    params.durationDays = parseInt(durationMatch[1], 10);
  }

  const budgetMatch = text.match(/预算(\d+)/);
  if (budgetMatch) {
    params.budget = parseInt(budgetMatch[1], 10);
  }

  const interestKeywords = ['历史文化', '自然风光', '红色景点', '美食', '摄影', '登山', '休闲'];
  interestKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      params.interests.push(keyword);
    }
  });

  return params;
}

router.post('/chat', auth, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ code: 400, message: '消息不能为空' });
    }

    const currentSessionId = sessionId || uuidv4();

    const entities = extractEntities(message);
    const weatherCity = extractWeatherCity(message);

    if (weatherCity && !entities.locations.includes(weatherCity)) {
      entities.locations.push(weatherCity);
    }

    let response = '';
    let weatherData = null;

    if (entities.intents.includes('weather')) {
      if (!weatherCity) {
        response = '可以帮您查询天气，请告诉我要查询的城市，例如"赣州今天天气怎么样？"。';
      } else {
        try {
          const { data } = await callGaodeWeatherApi(weatherCity, 'base');
          const liveWeather = data?.lives?.[0];

          if (!liveWeather) {
            response = `暂时没有查到"${weatherCity}"的实时天气，您可以换一个更完整的城市或区县名称再试试。`;
          } else {
            weatherData = buildCurrentWeatherData(liveWeather);
            response = formatWeatherResponse(weatherData);
          }
        } catch (weatherError) {
          console.error('AI天气查询失败:', weatherError);
          response = `抱歉，暂时无法获取"${weatherCity}"的实时天气。${weatherError.message || '请稍后再试。'}`;
        }
      }
    } else if (entities.intents.includes('trip_plan')) {
      const tripParams = extractTripParams(message);
      let missingFields = [];

      if (!tripParams.destination && entities.locations.length > 0) {
        tripParams.destination = entities.locations[0];
      }
      if (!tripParams.destination) {
        missingFields.push('目的地');
      }
      if (tripParams.durationDays === 0) {
        missingFields.push('行程天数');
      }

      if (missingFields.length > 0) {
        response = `好的，我来帮您规划旅行行程！请告诉我：${missingFields.join('、')}等信息，例如"我想去赣州骑行3天，喜欢历史文化，预算500元"。`;
      } else {
        response = `好的，我来为您规划从${tripParams.destination}出发，共${tripParams.durationDays}天的骑行旅行计划，请稍等...`;

        try {
          const tripResponse = await fetch(`${req.protocol}://${req.get('host')}/api/trip/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.authorization
            },
            body: JSON.stringify({
              destination: tripParams.destination,
              durationDays: tripParams.durationDays,
              budget: tripParams.budget,
              interests: tripParams.interests,
              sessionId: currentSessionId
            })
          });

          const tripData = await tripResponse.json();

          if (tripData.code === 200) {
            const plan = tripData.data;
            let planSummary = `${plan.destination} ${plan.durationDays}天骑行旅行计划\n\n`;
            planSummary += `📍 目的地：${plan.destination}\n`;
            planSummary += `⏱️ 行程天数：${plan.durationDays}天\n`;
            if (plan.budget) {
              planSummary += `💰 预算：${plan.budget}元\n`;
            }
            if (plan.interests && plan.interests.length > 0) {
              planSummary += `❤️ 兴趣偏好：${plan.interests.join('、')}\n`;
            }
            planSummary += `\n📅 每日行程：\n`;

            for (const dayPlan of plan.dayPlans || []) {
              planSummary += `\n第${dayPlan.dayNumber}天 (${dayPlan.theme || '自由骑行'})：\n`;
              for (const attraction of dayPlan.attractions || []) {
                planSummary += `  • ${attraction.poiName} (${attraction.visitType}) - ${attraction.arrivalTime}\n`;
              }
            }

            if (plan.budgetSummary && plan.budgetSummary.length > 0) {
              planSummary += `\n💰 预算明细：\n`;
              let totalBudget = 0;
              for (const item of plan.budgetSummary) {
                planSummary += `  • ${item.category}：${item.total}元\n`;
                totalBudget += parseFloat(item.total);
              }
              planSummary += `  • 总计：约${totalBudget.toFixed(0)}元\n`;
            }

            if (plan.weatherForecast) {
              planSummary += `\n🌤️ 天气预报：\n`;
              for (const cast of plan.weatherForecast.casts || []) {
                planSummary += `  • ${cast.date}：${cast.dayweather} ${cast.nighttemp}°C - ${cast.daytemp}°C\n`;
              }
            }

            planSummary += `\n${plan.aiResponse || ''}`;
            planSummary += `\n\n如需查看完整行程详情或调整计划，请告诉我！`;

            response = planSummary;
            res.json({
              code: 200,
              data: {
                response,
                sessionId: currentSessionId,
                entities,
                weather: weatherData,
                tripPlan: plan
              }
            });
            return;
          } else {
            response = `抱歉，暂时无法为您创建行程规划，请稍后再试。`;
          }
        } catch (tripError) {
          console.error('调用行程规划失败:', tripError);
          response = `抱歉，行程规划服务暂时不可用，请稍后再试。`;
        }
      }
    } else {
      const knowledgeResults = await searchKnowledge(message);
      let context = '';
      if (knowledgeResults.length > 0) {
        context = '相关知识：\n' + knowledgeResults.map(k => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n');
      }
      response = await callOllama(message, context);
    }

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
        entities,
        weather: weatherData
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
    const weatherCity = extractWeatherCity(text);

    if (weatherCity && !entities.locations.includes(weatherCity)) {
      entities.locations.push(weatherCity);
    }

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
    } else if (entities.intents.includes('weather')) {
      if (!weatherCity) {
        response = '可以帮您查询天气，请补充城市名称，例如“赣州今天天气怎么样”。';
      } else {
        try {
          const { data } = await callGaodeWeatherApi(weatherCity, 'base');
          const liveWeather = data?.lives?.[0];

          if (!liveWeather) {
            response = `暂时没有查到“${weatherCity}”的实时天气，请换一个更完整的城市名称再试试。`;
          } else {
            response = formatWeatherResponse(buildCurrentWeatherData(liveWeather));
          }
        } catch (weatherError) {
          console.error('语音天气查询失败:', weatherError);
          response = `抱歉，暂时无法获取“${weatherCity}”的实时天气，请稍后再试。`;
        }
      }
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
