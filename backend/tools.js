const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeather } = require('./weatherUtils');
const { getAirQuality, getPollenAmbee } = require('./airPollenUtils');
const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const { extractDateFromText, getNearestForecastTime } = require('./timeUtils');
/**
 * @fileoverview Gemini API에 제공할 "도구(Tool)"를 정의하고,
 * Gemini의 요청에 따라 해당 도구를 실행하는 로직을 담당합니다.
 * 이 파일은 새로운 LLM 기반 아키텍처의 핵심 중 하나입니다.
 */

// ==================================================================
// 1. Gemini API에 전달할 도구 명세 (Function Declarations)
// ==================================================================
// 각 도구의 'description'을 명확하고 상세하게 작성하는 것이 매우 중요합니다.
// Gemini는 이 설명을 보고 어떤 도구를 사용할지 결정하기 때문입니다.
const availableTools = {
  functionDeclarations: [
    {
      name: 'get_full_weather_with_context',
      // 설명을 대폭 상세화하여 LLM의 이해도를 높입니다.
      description: "날씨 정보를 조회하는 가장 기본적인 도구입니다. 사용자의 질문과 민감요소, 취미를 고려해 종합적인 날씨 정보를 조회합니다.",
      parameters: {
        type: 'OBJECT',
        properties: {
          location: {
            type: 'STRING',
            description: "지역명 (예: '서울'). 명시되지 않은 경우 'CURRENT_LOCATION'으로 설정하세요."
          },
          date: {
            type: 'STRING',
            description: "조회 날짜 (예: 오늘, 내일). 지정하지 않으면 오늘"
          },
          graph_needed: {
            type: 'BOOLEAN',
            description: "사용자가 '기온', '그래프' 같은 표현을 썼을 때 true로 설정하세요."
          },
          user_input: {
            type: 'STRING',
            description: '사용자의 원문 질문 텍스트'
          }
        },
        required: ['location', 'user_input']
      }
    }
  ]
};

// ==================================================================
// 2. Gemini의 요청에 따라 실제 함수를 실행하는 핸들러
// ==================================================================
async function executeTool(functionCall, userCoords) {
    const { name, args } = functionCall;
    
    let output;

    // 위치 인자(location)를 실제 좌표(lat, lon)로 변환하는 과정이 공통적으로 필요합니다.
    let lat, lon, locationName;
    if (name !== 'get_full_weather_with_context') throw new Error('정의되지 않은 도구입니다.');

    const userInput = args.user_input?.toLowerCase() || '';

    if (args.location.toUpperCase() === 'CURRENT_LOCATION') {
      if (!userCoords) throw new Error('현재 위치가 제공되지 않았습니다.');
      lat = userCoords.latitude;
      lon = userCoords.longitude;
      
      // 🔥 현재 위치의 지역명을 가져옴
      try {
        locationName = await reverseGeocode(lat, lon);
        console.log('📍 현재 위치 지역명:', locationName);
      } catch (error) {
        console.error('📍 현재 위치 지역명 조회 실패:', error);
        locationName = '현재 위치'; // 폴백
      }
    } else {
      const geo = await geocodeGoogle(args.location);
      if (!geo) throw new Error(`'${args.location}'의 좌표를 찾을 수 없습니다.`);
      lat = geo.lat;
      lon = geo.lon;
      locationName = args.location;
    }

    const [weather, air, pollen] = await Promise.all([
    getWeather(lat, lon),
    getAirQuality(lat, lon),
    getPollenAmbee(lat, lon)
    ]);

    const includeGraph =
      args.graph_needed ||
      userInput.includes('온도') ||
      userInput.includes('기온') ||
      userInput.includes('그래프')||
      userInput.includes('temperature') || 
      userInput.includes('temp') ||       
      userInput.includes('graph'); 
      userInput.includes('뭐 입을까') ||      
      userInput.includes('뭐 입지') ||        
      userInput.includes('옷') ||      
      userInput.includes('what should i wear') ||  
      userInput.includes('what to wear') ||       
      userInput.includes('clothing') ||           
      userInput.includes('outfit');               

  const hourlyTemps = [];

  if (weather?.hourly && includeGraph) {
    console.log('📈 hourlyTemps:', hourlyTemps);

    const hourly = weather.hourly;
    const offsetMs = (weather.timezone_offset || 0) * 1000;
    const localNow = new Date(Date.now() + offsetMs);
    localNow.setMinutes(0, 0, 0);

    for (let i = 0; i < 6; i++) {
      const targetLocalTime = new Date(localNow.getTime() + i * 3 * 3600000);
      const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);
      const closest = hourly.reduce((prev, curr) =>
        Math.abs(curr.dt * 1000 - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev
      );
      const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
      const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
      hourlyTemps.push({ hour: label, temp: Math.round(closest.temp) });
    }
  }

      // timeUtils를 사용하여 실제 날짜 계산 
      const requestedDate = extractDateFromText(args.user_input);
      const formattedDate = requestedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      console.log('📅 사용자 입력:', args.user_input);
      console.log('📅 추출된 날짜:', requestedDate);
      console.log('📅 포맷된 날짜:', formattedDate);

      return {
        tool_function_name: 'get_full_weather_with_context',
        output: {
          location: locationName, // 🔥 location 필드로 지역명 전달
          date: formattedDate, 
          weather,
          air,
          pollen,
          hourlyTemps
        }
      };
}

module.exports = {
  availableTools,
  executeTool
};