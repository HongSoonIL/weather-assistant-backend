// ───────────────────────────────────────────────────────────────────────────────
// require('dotenv').config();
// ───────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = 4000;

// ───────────────────────────────────────────────────────────────────────────────
// 중요한 API 키들은 실제 배포 시 .env에 넣으세요 (여기서는 예시를 위해 하드코딩).
// ───────────────────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = 'AIzaSyAsxn4RLgLzEc8FuuEh9F5fo4JzQp9YjZo';
const OPENWEATHER_API_KEY = 'a72c7174a9b30d55f73d52a104868e49';
const GOOGLE_MAPS_API_KEY = 'AIzaSyAiZGWeaxSGW5pHHl7DvlMFp80y_pnO1Fg';

app.use(cors());
app.use(bodyParser.json());

// ───────────────────────────────────────────────────────────────────────────────
// 1) Reverse Geocoding: 위도·경도 → “도시, 국가” 반환
// ───────────────────────────────────────────────────────────────────────────────
app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: GOOGLE_MAPS_API_KEY,
          language: 'ko'  // 한글 주소를 원하면 'ko' 로 바꿔주세요
        }
      }
    );

    const results = response.data.results;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(404).json({ error: '주소 정보를 찾을 수 없습니다.' });
    }

    const components = results[0].address_components;
    const city = components.find(c =>
      c.types.includes('locality') ||
      c.types.includes('administrative_area_level_1')
    )?.long_name;

    const country = components.find(c =>
      c.types.includes('country')
    )?.short_name;

    const region = city && country
      ? `${city}, ${country}`
      : 'Unknown';

    res.json({ region });
  } catch (error) {
    console.error('📍 Google Geocoding 실패:', error.message);
    res.status(500).json({ error: '주소 변환 실패' });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// 2) getWeatherByCoords: 위도·경도 → OpenWeather에서 날씨 정보 리턴
// ───────────────────────────────────────────────────────────────────────────────
async function getWeatherByCoords(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather`;
  const response = await axios.get(url, {
    params: {
      lat,
      lon,
      appid: OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'kr'
    }
  });
  const data = response.data;
  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].description,
    humidity: data.main.humidity,
    wind: data.wind.speed
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 3) getSeoulWeather: '서울' 고정 조회 (필요 시 그대로 두셔도 됩니다)
// ───────────────────────────────────────────────────────────────────────────────
async function getSeoulWeather() {
  const url = `https://api.openweathermap.org/data/2.5/weather`;
  const response = await axios.get(url, {
    params: {
      q: 'Seoul',
      appid: OPENWEATHER_API_KEY,
      units: 'metric',
      lang: 'kr'
    }
  });
  const data = response.data;
  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].description,
    humidity: data.main.humidity,
    wind: data.wind.speed
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// 4) /gemini 엔드포인트: “coords가 있고 userInput에 '날씨'만 들어가면 위치 기반 날씨”
//                       “서울+날씨"면 서울 정보, 그 외는 일반 Gemini 질문.
// ───────────────────────────────────────────────────────────────────────────────
app.post('/gemini', async (req, res) => {
  // userInput, location(예: "고양시, KR"), coords({ latitude, longitude }) 를 body에서 받음
  const { userInput, location, coords } = req.body;
  console.log('📩 POST /gemini 요청 수신됨');
  console.log('💬 사용자 질문:', userInput);

  try {
    // ───────────────────────────────────────────────────────────────────────────
    // 4-1) “coords가 존재” + “날씨” 포함 → 위치 기반 날씨 조회 분기
    //      (이제 “현재 위치” 키워드 없이도 동작함)
    // ───────────────────────────────────────────────────────────────────────────
    if (
      coords?.latitude != null &&
      coords?.longitude != null &&
      typeof userInput === 'string' &&
      userInput.includes('날씨')
    ) {
      const weather = await getWeatherByCoords(coords.latitude, coords.longitude);
      const place = location || '알 수 없는 위치';

      // Gemini prompt 생성
      const prompt = `
사용자의 현재 위치는 ${place}입니다. (위도: ${coords.latitude}, 경도: ${coords.longitude})
다음은 실시간 날씨 정보입니다:
- 기온: ${weather.temp}도
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 풍속: ${weather.wind}m/s

이 정보를 바탕으로 사용자에게 친근한 말투로 오늘 날씨 요약과 조언을 해주세요.
답변은 3~4문장 이내로, 너무 길지 않게 써주세요. 문장 마지막에 이모지도 붙여주세요.
      `;

      const result = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }]
        }
      );
      let raw = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // (필요하다면 Markdown 제거 + <br/> 삽입 → 클라이언트에서 줄바꿈 처리)
      // 여기서는 일단 raw 상태로 내려보겠습니다.
      return res.json({ reply: raw });
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 4-2) “서울 + 날씨” 분기
    // ───────────────────────────────────────────────────────────────────────────
    if (
      typeof userInput === 'string' &&
      userInput.includes('서울') &&
      userInput.includes('날씨')
    ) {
      const weather = await getSeoulWeather();
      const prompt = `
사용자가 오늘 서울 날씨에 대해 물어봤습니다.
현재 날씨 정보는 다음과 같습니다:
- 기온: ${weather.temp}도
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 풍속: ${weather.wind}m/s

이 정보를 바탕으로 사용자에게 친근한 말투로 오늘 날씨 요약과 조언을 해주세요.
답변은 3~4문장 이내로, 너무 길지 않게 써주세요. 문장 마지막에 이모지를 붙여주세요.
      `;
      const result = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }]
        }
      );
      const raw = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('[🌤️ Gemini 날씨 응답]', raw);
      return res.json({ reply: raw });
    }

    // ───────────────────────────────────────────────────────────────────────────
    // 4-3) 그 외 일반 질문 → Gemini로 그대로 전달
    // ───────────────────────────────────────────────────────────────────────────
    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: userInput }] }]
      }
    );
    // ───────────────────────────────────────────────────────────────────────────
    // 5) 텍스트 클렌징
    // ───────────────────────────────────────────────────────────────────────────
    const raw = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '';    
    // 1) 볼드 마크다운 제거
    let formatted = raw.replace(/\*\*/g, '');

    // 2) “• ” 기준으로 분리하여 앞뒤 공백 제거
    const parts = formatted
      .split('• ')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // 3) 첫 줄(소개 문장)과 나머지 항목을 구분해서 재조합
    const header = parts.shift();
    const items = parts.map(p => `- ${p}`);

    // 4) “오늘 예상 날씨:” 앞뒤로 빈 줄 추가
    const idx = items.findIndex(p => p.startsWith('오늘 예상 날씨:'));
    if (idx !== -1) {
      items[idx] = `\n${items[idx]}`;
    }

    // 5) 최종 문자열 만들기
    formatted = [
      header,
      ...items
    ].join('\n');

    // 6) 응답으로 보내기
    res.json({ reply: formatted });

  } catch (err) {
    console.error('❌ Gemini API 오류 발생!');
    console.error('↳ 상태 코드:', err.response?.status);
    console.error('↳ 응답 데이터:', JSON.stringify(err.response?.data, null, 2));
    return res.status(err.response?.status || 500).json({
      error: 'Gemini API 호출 실패',
      message: err.response?.data?.error?.message || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Gemini 백엔드 서버 실행 중: http://localhost:${PORT}`);
});