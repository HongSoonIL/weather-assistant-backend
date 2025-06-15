// placeExtractor.js
function extractLocationFromText(text) {
  // ✅ 시간 표현 제거 (장소 혼동 방지)
  const timePattern = /(지금|현재|오늘|내일|모레|이번주\s?[월화수목금토일]요일?|다음주\s?[월화수목금토일]요일?|[월화수목금토일]요일|하루|이틀|삼일|사흘|닷새|엿새|뒤|\d{1,2}일\s?뒤|\d{1,2}시간\s?뒤|\d{1,2}분\s?뒤)/g;

  const cleanText = text.replace(timePattern, '').trim();

  //장소 아님
  const excluded = ['기온', '날씨', '온도', '습도', '바람', '하늘', '옷', '이슬점', 'dew', '끈적', '불쾌', '습할까', '쾌적할까',  '흐림', '하늘 상태', '맑음', '흐려', 'cloud', 'cloudy', '가시거리', '앞이 잘 보일까', '시야', 'visibility', '안개', '흐릿',
    '풍속', '풍향', '세찬 바람', '바람세기', 'wind', '강풍', '자외선', 'uv', '햇빛', '선크림', '썬크림', '태양', '강한 햇살', '일출', '일몰', '해뜨는 시간', '해지는 시간', '해 뜨는', '해 지는', 'sunrise', 'sunset', '습도', '건조해', '촉촉해', 'humidity', '습하', '건조하', '습해', '건조', '축축',
    '뭘 입을까', '옷', '겉옷', '옷차림', '입을까', '패딩', '반팔', '두꺼운', '얇은', 'wearing', 'wear', '우산', '비', '비올까', '소나기', '강수확률', 'rain', 'umbrella', '미세먼지', '공기', '공기질', '초미세먼지', '황사', '먼지', '숨쉬기', '꽃가루', 'air', 'quality', '비와'
  ]; // 장소 아님
  
  // ✅ 주소 추출 패턴 (시/도/군/구/동/읍/면 단위까지)
  const locationMatch = cleanText.match(/([가-힣]+)(시|도|군|구|동|읍|면)?/);
  if (!locationMatch) return null;

  let location = locationMatch[0].replace(/(에서|으로|까지|은|는|이|가|의|에)?$/, '');;

  if (excluded.includes(location)) return null;

  const corrections = {
    '서울': '서울특별시',
    '부산': '부산광역시',
    '대전': '대전광역시',
    '대구': '대구광역시',
    '광주': '광주광역시',
    '울산': '울산광역시',
    '인천': '인천광역시',
    '세종': '세종특별자치시',
    '제주': '제주특별자치도'
  };

  if (corrections[location]) location = corrections[location];

  return location;
}

module.exports = {
  extractLocationFromText
};