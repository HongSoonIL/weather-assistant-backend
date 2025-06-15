require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { handleSmartAdvice } = require('./smartWeatherAdvisor');

// 서버 시작 시 API 키 확인 (테스트)
console.log('=== API 키 상태 확인 ===');
console.log('Gemini API 키:', process.env.GEMINI_API_KEY ? '있음' : '없음');
console.log('OpenWeather API 키:', process.env.OPENWEATHER_API_KEY ? '있음' : '없음');


// Module import
const { getUserProfile } = require('./userProfileUtils');
const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeather, getWeatherByCoords } = require('./weatherUtils');
const conversationStore = require('./conversationStore');
const { extractDateFromText, getNearestForecastTime } = require('./timeUtils');
const { extractLocationFromText } = require('./placeExtractor');
const weatherAdvice = require('./weatherAdviceRouter');

const app = express();
const PORT = 4000;

// ✅ 필수 API 키
// 키 외부 노출을 막기 위해 배포 후 .env 파일로 분리할 수 있음.
const GEMINI_API_KEY       = process.env.GEMINI_API_KEY;
const OPENWEATHER_API_KEY  = process.env.OPENWEATHER_API_KEY;
const GOOGLE_MAPS_API_KEY  = process.env.GOOGLE_MAPS_API_KEY;
const AMBEE_POLLEN_API_KEY = process.env.AMBEE_POLLEN_API_KEY;

app.use(cors());
app.use(bodyParser.json());


//  채팅 제목 자동 생성 API
app.post('/generate-title', async (req, res) => {
  const { userInput } = req.body;
  
  try {
    const prompt = `
Generate a concise English title for this weather-related conversation based on the user's question.

Rules:
- Maximum 4 words
- Use title case (First Letter Capitalized)
- No emojis or special characters
- Focus on the main topic (weather, location, condition)
- Be specific and descriptive

User question: "${userInput}"

Examples:
"What's the weather like today?" → "Today’s Weather"
"오늘 날씨 어때?" → "Today’s Weather"
"오늘 서울 날씨 어때?" → "Seoul Weather Today"
"내일 부산 비 올까?" → "Busan Rain Tomorrow"
"미세먼지 농도 궁금해" → "Air Quality Check"
"꽃가루 알레르기 조심해야 할까?" → "Pollen Allergy Alert"
"이번주 날씨 어떨까?" → "Weekly Weather Forecast"
"습도가 높아?" → "Humidity Levels"

Title:`;

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      }
    );

    let title = result.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'New Weather Chat';
    
    // "Title:" 접두사 제거 및 정리
    title = title.replace(/^Title:\s*/i, '').trim();
    title = title.replace(/[""]/g, ''); // 따옴표 제거
    
    // 4단어 초과시 자르기
    const words = title.split(' ');
    if (words.length > 4) {
      title = words.slice(0, 4).join(' ');
    }
    
    console.log('🏷️ 생성된 제목:', title);
    res.json({ title });
    
  } catch (err) {
    console.error('❌ 제목 생성 실패:', err.message);
    
    // 폴백: 키워드 기반 영어 제목 생성
    const fallbackTitle = generateEnglishFallbackTitle(userInput);
    res.json({ title: fallbackTitle });
  }
});

// 폴백 영어 제목 생성 함수 (한국어 + 영어 지원)
function generateEnglishFallbackTitle(input) {
  const patterns = [
    { keywords: ['날씨', 'weather', '기온', '온도', 'temperature'], title: 'Weather Inquiry' },
    { keywords: ['미세먼지', 'pm2.5', 'pm10', 'air quality', 'pollution'], title: 'Air Quality Check' },
    { keywords: ['꽃가루', '알레르기', 'pollen', 'allergy'], title: 'Pollen Alert' },
    { keywords: ['비', '폭우', 'rain', 'shower', 'precipitation'], title: 'Rain Forecast' },
    { keywords: ['눈', '폭설', 'snow', 'snowfall'], title: 'Snow Forecast' },
    { keywords: ['태풍', '바람', 'wind', 'typhoon', 'storm'], title: 'Wind Weather' },
    { keywords: ['습도', 'humidity', 'moisture'], title: 'Humidity Check' },
    { keywords: ['내일', 'tomorrow'], title: 'Tomorrow Weather' },
    { keywords: ['오늘', 'today'], title: 'Today Weather' },
    { keywords: ['이번주', 'week', 'weekly'], title: 'Weekly Forecast' }
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => input.includes(keyword))) {
      return pattern.title;
    }
  }

  // 지역명 추출 시도
  const cityMap = {
    '서울': 'Seoul Weather',
    '부산': 'Busan Weather', 
    '대구': 'Daegu Weather',
    '인천': 'Incheon Weather',
    '광주': 'Gwangju Weather',
    '대전': 'Daejeon Weather',
    '울산': 'Ulsan Weather'
  };
  
  for (const [korean, english] of Object.entries(cityMap)) {
    if (input.includes(korean)) {
      return english;
    }
  }

  return 'Weather Chat';
}

// … (getPollenAmbee, getAirQuality, classifyPm25, /reverse-geocode, /weather 엔드포인트 등은 그대로) …

// Ambee Pollen API 호출 함수 (응답 구조에 맞춰 수정됨)
async function getPollenAmbee(lat, lon) {
  try {
    const url = 'https://api.ambeedata.com/latest/pollen/by-lat-lng';

    const res = await axios.get(url, {
      params: { lat, lng: lon },
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
    const info      = arr[0];
    const risks     = info.Risk;    // { grass_pollen: "Low", tree_pollen: "Low", weed_pollen: "Low" }
    const counts    = info.Count;   // { grass_pollen: 27, tree_pollen: 47, weed_pollen: 13 }
    const updatedAt = info.updatedAt; // "2025-06-04T11:00:00.000Z"

    if (typeof risks !== 'object' || typeof counts !== 'object') {
      console.warn('🌲 Ambee 응답 형식이 예상과 다릅니다. Risk 또는 Count 필드가 없습니다.');
      return null;
    }

    // 위험도 우선순위 매핑
    const priorityMap = { 'High': 3, 'Medium': 2, 'Low': 1 };

    // "가장 높은 위험도"를 찾기 위해 기본값 세팅
    let topType = Object.keys(risks)[0]; // 예: "grass_pollen"
    for (const type of Object.keys(risks)) {
      if (priorityMap[risks[type]] > priorityMap[risks[topType]]) {
        topType = type;
      }
    }

    // 최종 선택된 항목
    const topRisk  = risks[topType];    // “Low”/“Medium”/“High”
    const topCount = counts[topType];   // 숫자
    const topTime  = updatedAt;         // ISO 문자열

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

// 위경도 기반 미세먼지 정보 가져오기
//     - v3.0 호출이 404(Internal error)일 경우 v2.5로 폴백
async function getAirQuality(lat, lon) {
  // (A) 먼저 v3.0 엔드포인트 시도
  try {
    const urlV3 = `https://api.openweathermap.org/data/3.0/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
    const res3 = await axios.get(urlV3);
    const data3 = res3.data;
    const pm25 = data3.list[0].components.pm2_5;
    const pm10 = data3.list[0].components.pm10;
    return { pm25, pm10 };
  } catch (err) {
    // v3.0 호출 중 404(Internal error) 혹은 기타 에러가 나면 콘솔에 로깅
    const status = err.response?.status;
    const msg    = err.response?.data || err.message;
    console.warn(`getAirQuality v3.0 호출 실패 (status: ${status}) → v2.5 폴백 시도:`, msg);

    // (B) v2.5 엔드포인트로 폴백
    try {
      const urlV25 = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
      const res25 = await axios.get(urlV25);
      const data25 = res25.data;
      const pm25   = data25.list[0].components.pm2_5;
      const pm10   = data25.list[0].components.pm10;
      return { pm25, pm10 };
    } catch (err25) {
      console.error('getAirQuality v2.5 호출 중 오류:', err25.response?.data || err25.message);
      return null;
    }
  }
}

// 실시간 위치
// 1. 위도/경도로 지역명 반환
app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const region = await reverseGeocode(latitude, longitude);
    res.json({ region });
  } catch (err) {
    console.error('📍 reverse-geocode 실패:', err.message);
    res.status(500).json({ error: '주소 변환 실패' });
  }
});


// 사용자의 위도/경도로 날씨 정보만 반환하는 API
// 2. 위도/경도로 날씨 정보
app.post('/weather', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const weather = await getWeatherByCoords(latitude, longitude);
    res.json(weather);
  } catch (err) {
    console.error('🌧️ 날씨 정보 가져오기 실패:', err.message);
    res.status(500).json({ error: '날씨 정보를 불러오는 데 실패했습니다.' });
  }
});

// 3. 특정 시간 기온 변화 그래프 출력용
app.post('/weather-graph', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
    const result = await axios.get(url);
    const data = result.data; // 한 번에 hourly + timezone_offset 사용

    const hourly = data.hourly;
    const timezoneOffsetSec = data.timezone_offset || 0;
    const offsetMs = timezoneOffsetSec * 1000;

    // 1. 현재 UTC 시각
    const utcNow = new Date();  // 무조건 UTC

    // 2. 해당 지역 현지 기준 시각을 계산
    const localNow = new Date(utcNow.getTime() + offsetMs);
    localNow.setMinutes(0, 0, 0); // 분, 초 제거 → 정각으로

    const hourlyTemps = [];

    for (let i = 0; i < 6; i++) {
      // 3. 3시간 간격 target UTC 시각 생성
      const targetLocalTime = new Date(localNow.getTime() + i * 3 * 60 * 60 * 1000);
      const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);
      // 4. UTC 기준에서 가장 가까운 hourly 데이터 찾기
      const closest = hourly.reduce((prev, curr) => {
        const currTime = curr.dt * 1000;
        return Math.abs(currTime - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev;
      });

      // 5. label은 현지 시간 기준
      const localTime = new Date(targetUTC.getTime() + offsetMs);
      const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
      const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
      console.log(`✅ label=${label} | local=${localTime.toISOString()} | UTC=${targetUTC.toISOString()} | temp=${Math.round(closest.temp)}`);

      hourlyTemps.push({
        hour: label,
        temp: Math.round(closest.temp)
      });
    }

        res.json({ hourlyTemps });
        console.log('📡 최종 hourlyTemps:', hourlyTemps);

      } catch (err) {
        console.error('📊 시간별 기온 그래프용 API 실패:', err.message);
        res.status(500).json({ error: '그래프용 날씨 데이터를 불러오는 데 실패했습니다.' });
      }
    });

app.post('/gemini', async (req, res) => {
  const { userInput, coords, uid } = req.body;
  console.log('💬 사용자 질문:', userInput);

  const forecastDate = extractDateFromText(userInput);
  const forecastKey  = getNearestForecastTime(forecastDate);

  const extractedLocation = extractLocationFromText(userInput);
  console.log('📍 추출된 장소:', extractedLocation);

  let lat, lon, locationName;

  try {
    const uid = req.body.uid || null;

    if (extractedLocation) {
      const geo = await geocodeGoogle(extractedLocation);
      if (!geo || !geo.lat || !geo.lon) {
        return res.json({ reply: `죄송해요. "${extractedLocation}" 지역의 위치를 찾을 수 없어요.` });
      }
      lat = geo.lat;
      lon = geo.lon;
      locationName = extractedLocation;
    } else if (coords) {
      lat = coords.latitude;
      lon = coords.longitude;
      locationName = await reverseGeocode(lat, lon);
    } else {
      return res.json({ reply: '어느 지역의 날씨를 알려드릴까요?' });
    }

    console.log(`📍 "${locationName}" → lat: ${lat}, lon: ${lon}`);

    // ✅ 여기까지 포함해서 try로 감싸야 함
    await handleSmartAdvice({ userInput, lat, lon, locationName, uid }, res);

  } catch (err) {
    console.error('❌ Gemini API 오류 발생!');
    console.error('↳ 메시지:', err.message);
    console.error('↳ 상태 코드:', err.response?.status);
    console.error('↳ 상태 텍스트:', err.response?.statusText);
    console.error('↳ 응답 데이터:', JSON.stringify(err.response?.data, null, 2));
    console.error('↳ 요청 내용:', err.config?.data);

    return res.status(err.response?.status || 500).json({
      error: 'Gemini API 호출 실패',
      message: err.response?.data?.error?.message || err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Gemini+Weather 서버 실행 중: http://localhost:${PORT}`);
});

