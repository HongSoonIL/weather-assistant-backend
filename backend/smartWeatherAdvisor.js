// smartWeatherAdvisor.js (수정 완료)
const { getWeather } = require('./weatherUtils');
const { getAirQuality, getPollenAmbee } = require('./airPollenUtils');
const { getUserProfile } = require('./userProfileUtils');
const conversationStore = require('./conversationStore');
const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 메인 스마트 응답 함수
async function handleSmartAdvice({ userInput, lat, lon, locationName, uid }, res) {
  try {
    // 1. 사용자 정보 불러오기
    const user = uid ? await getUserProfile(uid) : null;

    // 2. 사용자 질문 의도 해석 요청 프롬프트
    const intentPrompt = `"${userInput}" 이 문장에서 사용자가 알고 싶어하는 날씨 정보 항목을 다음 중에서 골라줘: \n[기온, 우산 여부, 미세먼지, 자외선, 이슬점, 구름, 바람, 옷차림, 일출일몰, 가시거리, 꽃가루, 비] 중 해당 항목만 한두개 정도 추려서 쉼표로 구분해줘.`;

    const intentResult = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [...conversationStore.getHistory(), { role: 'user', parts: [{ text: intentPrompt }] }]
      }
    );

    const intentText = intentResult.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const intentList = intentText.toLowerCase().split(/[\n,\s]+/).filter(Boolean);

    // 3. 날씨 데이터 모으기
    const weather = await getWeather(lat, lon);
    const air = intentList.includes('미세먼지') ? await getAirQuality(lat, lon) : null;
    const pollen = intentList.includes('꽃가루') ? await getPollenAmbee(lat, lon) : null;

    // 사용자 정보 프롬프트
    const userText = user ? `
사용자 정보:
- 이름: ${user.name}
- 민감 요소: ${user.sensitiveFactors?.join(', ') || '없음'}
- 취미: ${user.hobbies?.join(', ') || '없음'}
` : '';

    // 날씨 정보 프롬프트
    const weatherText = `
날씨 정보 (${locationName}):
- 기온: ${weather.temp}℃
- 체감 온도: ${weather.feelsLike}℃
- 최저 기온: ${weather.tempMin}℃
- 최고 기온: ${weather.tempMax}℃
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 자외선 지수: ${weather.uvi}
- 구름량: ${weather.cloud}%
- 이슬점: ${weather.dewPoint}℃
- 가시거리: ${weather.visibility}m
- 풍속: ${weather.wind}m/s
- 풍향: ${weather.windDeg}°
- 강수 확률: ${weather.pop !== null ? Math.round(weather.pop * 100) + '%' : '정보 없음'}
- 1시간 강수량: ${weather.rain}mm
- 일출: ${new Date(weather.sunrise * 1000).toLocaleTimeString('ko-KR')}
- 일몰: ${new Date(weather.sunset * 1000).toLocaleTimeString('ko-KR')}
${air ? `- 미세먼지: PM2.5 ${air.pm25}㎍/m³, PM10 ${air.pm10}㎍/m³` : ''}
${pollen ? `- 꽃가루: ${pollen.type} (${pollen.count}개, ${pollen.risk})` : ''}
`;

    // 4. 최종 프롬프트 구성
    const prompt = `
${userText}
${weatherText}

위 사용자와 날씨 정보를 바탕으로,
사용자가 궁금해한 "${userInput}"에 대해 친근하고 실용적으로 답변해주세요.
가능하다면 조언을 3~4문장 이내로 요약해주세요.
`;

    const finalResult = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }]
      }
    );

    let reply = finalResult.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';
    reply = reply.replace(/\*\*/g, ''); // 볼드 제거

    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10);

    // 응답 객체 구성
const response = {
  reply,
  resolvedCoords: { lat, lon }, // ✅ 그래프용 위치 정보 꼭 포함
};

// 미세먼지 정보 포함 시 → 미세먼지 데이터 추가
if (air) {
  response.airQuality = {
    pm25: air.pm25,
    pm10: air.pm10
  };
}
if (userInput.includes('기온') || userInput.includes('온도')) {
  response.userInput = userInput;
}

res.json(response); 
  } catch (err) {
    console.error('❌ 스마트 날씨 어드바이저 오류:', err.message);
    return { reply: '스마트 날씨 응답 생성에 실패했어요.' };
  }
}

module.exports = { handleSmartAdvice };
