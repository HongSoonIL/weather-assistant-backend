// require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const { geocodeGoogle } = require('./locationUtils');
const conversationStore = require('./conversationStore');
const { extractDateFromText, getNearestForecastTime } = require('./timeUtils');
const { extractLocationFromText } = require('./placeExtractor');
const { getWeather } = require('./weatherUtils');

const app = express();
const PORT = 4000;

// ✅ 필수 API 키
const GEMINI_API_KEY = 'AIzaSyCTlo8oCxSpm6wqu87tpWP2J3jeZbryP6k';
const OPENWEATHER_API_KEY = '81e4f6ae97b20ee022116a9ddae47b63';
const AMBEE_POLLEN_API_KEY = '45896ba19d149d35482a8b46b587913bf89d13d0b82ca0427d7fcf9ede0dee2c';

app.use(cors());
app.use(bodyParser.json());

// ───────────────────────────────────────────────────────────────────────────────
// (A) Ambee Pollen API 호출 함수 (응답 구조에 맞춰 수정됨)
// ───────────────────────────────────────────────────────────────────────────────
async function getPollenAmbee(lat, lon) {
  try {
    const url = 'https://api.ambeedata.com/latest/pollen/by-lat-lng';

    const res = await axios.get(url, {
      params: {
        lat: lat,
        lng: lon
      },
      headers: {
        'x-api-key': AMBEE_POLLEN_API_KEY,
        'Accept': 'application/json'
      }
    });

    // 응답 전체를 콘솔에 찍어서 실제 구조를 재확인
    console.log('🌲 Ambee 응답 JSON:', JSON.stringify(res.data, null, 2));

    // Ambee 응답 내부의 data 배열
    const arr = res.data?.data;
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn('🌲 Ambee 응답에 data 배열이 없거나 비어 있습니다.');
      return null;
    }

    // 첫 번째(유일한) 객체를 꺼냄
    const info = arr[0];
    const risks  = info.Risk;  // { grass_pollen: "Low", tree_pollen: "Low", weed_pollen: "Low" }
    const counts = info.Count; // { grass_pollen: 27,   tree_pollen: 47,   weed_pollen: 13 }
    const updatedAt = info.updatedAt; // "2025-06-04T11:00:00.000Z"

    if (typeof risks !== 'object' || typeof counts !== 'object') {
      console.warn('🌲 Ambee 응답 형식이 예상과 다릅니다. Risk 또는 Count 필드가 없습니다.');
      return null;
    }

    // 위험도 우선순위 매핑
    const priorityMap = {
      'High':   3,
      'Medium': 2,
      'Low':    1
    };

    // "가장 높은 위험도"를 찾기 위해 기본값 세팅
    let topType = Object.keys(risks)[0]; // 예: "grass_pollen"
    for (const type of Object.keys(risks)) {
      if (priorityMap[risks[type]] > priorityMap[risks[topType]]) {
        topType = type;
      }
    }

    // 최종 선택된 항목
    const topRisk = risks[topType];       // “Low”/“Medium”/“High”
    const topCount = counts[topType];     // 숫자
    const topTime = updatedAt;            // ISO 문자열

    // ex) { type: "grass_pollen", count: 27, risk: "Low", time: "2025-06-04T11:00:00.000Z" }
    return {
      type:  topType,
      count: topCount,
      risk:  topRisk,
      time:  topTime
    };
  } catch (err) {
    console.error('🌲 Ambee Pollen API 호출 오류:', {
      status: err.response?.status,
      data:   err.response?.data || err.message
    });
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// (1) 위경도 기반 미세먼지 정보 가져오기
//     - v3.0 호출이 404(Internal error)일 경우 v2.5로 폴백
// ───────────────────────────────────────────────────────────────────────────────
async function getAirQuality(lat, lon) {
  // (A) 먼저 v3.0 엔드포인트 시도
  try {
    const urlV3 = `https://api.openweathermap.org/data/3.0/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    const res3 = await axios.get(urlV3);
    const data3 = res3.data;
    // v3.0에서도 PM2.5 키는 pm2_5입니다.
    const pm25 = data3.list[0].components.pm2_5;
    const pm10 = data3.list[0].components.pm10;
    return { pm25, pm10 };
  } catch (err) {
    // v3.0 호출 중 404(Internal error) 혹은 기타 에러가 나면 콘솔에 로깅
    const status = err.response?.status;
    const msg = err.response?.data || err.message;
    console.warn(`getAirQuality v3.0 호출 실패 (status: ${status}) → 폴백 시도:`, msg);

    // (B) v2.5 엔드포인트로 폴백
    try {
      const urlV25 = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
      const res25 = await axios.get(urlV25);
      const data25 = res25.data;
      const pm25 = data25.list[0].components.pm2_5;
      const pm10 = data25.list[0].components.pm10;
      return { pm25, pm10 };
    } catch (err25) {
      console.error('getAirQuality v2.5 호출 중 오류:', err25.response?.data || err25.message);
      return null;
    }
  }
}


// ───────────────────────────────────────────────────────────────────────────────
// (2) PM2.5 등급 분류 및 조언 반환 함수
// ───────────────────────────────────────────────────────────────────────────────
function classifyPm25(pm25) {
  if (pm25 <= 15) {
    return { grade: '좋음', advice: '좋은 공기입니다! 야외 활동에 무리 없어요 😊' };
  } else if (pm25 <= 35) {
    return { grade: '보통', advice: '보통 수준입니다. 민감한 분들은 주의해주세요.' };
  } else if (pm25 <= 75) {
    return { grade: '나쁨', advice: '나쁨 수준입니다. 마스크를 착용하고, 장시간 외출은 삼가세요.' };
  } else {
    return { grade: '매우 나쁨', advice: '매우 나쁨입니다! 외출을 최대한 자제하고, 실내 공기 관리에 신경 쓰세요.' };
  }
}


// ───────────────────────────────────────────────────────────────────────────────
// (3) /gemini 엔드포인트: “미세먼지” 분기 추가
// ───────────────────────────────────────────────────────────────────────────────
app.post('/gemini', async (req, res) => {
  const { userInput } = req.body;
  console.log('💬 사용자 질문:', userInput);

  // (A) 날짜/시간 추출
  const forecastDate = extractDateFromText(userInput);
  const forecastKey = getNearestForecastTime(forecastDate);

  // (B) 대화 기록에 유저 메시지 저장
  conversationStore.addUserMessage(userInput);

  // (C) 장소(지역) 추출
  const location = extractLocationFromText(userInput);
  if (!location) {
    return res.json({ reply: '어느 지역의 정보를 알려드릴까요?' });
  }

  try {
    // (D) 지오코딩(위경도) 가져오기
    const geo = await geocodeGoogle(location);
    if (!geo) {
      return res.json({ reply: `죄송해요. "${location}" 지역의 위치 정보를 찾을 수 없어요.` });
    }
    const { lat, lon } = geo;

    // ───────────────────────────────────────────────────────────────────────────
    // (E) ✨ “꽃가루” 키워드 분기 → getPollenAmbee() 호출
    // ───────────────────────────────────────────────────────────────────────────
    if (userInput.includes('꽃가루')) {
    const pollenData = await getPollenAmbee(lat, lon);
    if (!pollenData) {
      return res.json({
        reply:
          '죄송해요. 꽃가루 정보를 가져오는 데 실패했어요.\n' +
          '1) API 키가 유효한지  2) 위/경도(lat,lon)가 정확한지  3) Ambee 사용량 제한을 초과하지 않았는지 확인해주세요.'
      });
    }

    // Ambee에서 리턴된 데이터 예:
    // { type: "grass_pollen", count: 27, risk: "Low", time: "2025-06-04T11:00:00.000Z" }
    const { type, count, risk, time } = pollenData;

    // “type” 필드가 “grass_pollen”/“tree_pollen”/“weed_pollen” 등이므로
    // 사람이 보기 편하게 변환 (선택사항)
    const typeMap = {
      grass_pollen: '잔디 꽃가루',
      tree_pollen:  '수목 꽃가루',
      weed_pollen:  '잡초 꽃가루'
    };
    const friendlyType = typeMap[type] || type;

    let replyText = `📌 현재 "${location}"의 꽃가루 정보입니다 (${friendlyType} 기준):\n`;
    replyText += `- 입자 수: ${count}개\n`;
    replyText += `- 위험도: ${risk}\n`;
    replyText += `- 측정 시각: ${new Date(time).toLocaleString('ko-KR')} 기준\n\n`;
    replyText += '알레르기가 있다면 마스크를 착용하시고, 실내 환기를 자주 해주세요! 🌸';

    return res.json({ reply: replyText });
  }

    // ─────────────────────────────────────────────────────────────────────────
    // (F) "미세먼지" 키워드 분기 → getAirQuality() 호출
    // ─────────────────────────────────────────────────────────────────────────
    if (userInput.includes('미세먼지')) {
      const airData = await getAirQuality(lat, lon);

      if (!airData) {
        // v3.0 & v2.5 둘 다 실패했을 때
        return res.json({ reply: '죄송해요. 미세먼지 정보를 가져오는 데 실패했어요. 잠시 후 다시 시도해주세요.' });
      }

      const { pm25, pm10 } = airData;
      const { grade, advice } = classifyPm25(pm25);

      const replyText =
        `현재 "${location}"의 미세먼지 정보를 알려드릴게요:\n` +
        `- PM2.5: ${pm25}㎍/m³ (${grade})\n` +
        `- PM10: ${pm10}㎍/m³\n\n` +
        `${advice}`;

      return res.json({ reply: replyText });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // (G) "꽃가루", "미세먼지" 키워드가 없으면 날씨 조회 + Gemini 요약 (기존 로직 유지)
    // ─────────────────────────────────────────────────────────────────────────
    const now = new Date();
    const isToday = forecastDate.toDateString() === now.toDateString();
    const keyForWeather = isToday ? null : forecastKey;
    
    const weather = await getWeather(lat, lon, keyForWeather);

    const dayLabel = isToday
      ? '오늘'
      : forecastDate.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long'
        });

    const prompt = `
${dayLabel} "${location}"의 날씨 정보는 다음과 같습니다:
- 기온: ${weather.temp}℃
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 풍속: ${weather.wind}m/s

사용자에게 친근한 말투로 날씨를 요약하고, 실용적인 조언도 포함해 3~4문장으로 작성해주세요. 😊
`;

    const contents = [
      ...conversationStore.getHistory(),
      { role: 'user', parts: [{ text: prompt }] }
    ];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );

    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);

    // 포맷팅 후 응답
    let formatted = reply.replace(/\*\*/g, '');
    const parts = formatted
      .split('• ')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    const header = parts.shift();
    const items = parts.map(p => `- ${p}`);
    const idx = items.findIndex(p => p.startsWith('오늘 예상 날씨:'));
    if (idx !== -1) {
      items[idx] = `\n${items[idx]}`;
    }
    formatted = [header, ...items].join('\n');

    return res.json({ reply: formatted });

  } catch (err) {
    console.error('❌ 오류 발생!', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: '처리 중 오류가 발생했습니다.',
      message: err.response?.data?.error?.message || err.message
    });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Gemini+Weather 서버 실행 중: http://localhost:${PORT}`);
});