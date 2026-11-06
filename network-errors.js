export const CONNECTION_MESSAGE='서버 연결이 잠시 끊겼습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
export function isNetworkFailure(error){
  return ['auth/network-request-failed','functions/unavailable'].includes(error?.code)||/^(load failed|failed to fetch|fetch failed|networkerror.*|network request failed|the network connection was lost\.?|network connection lost\.?)$/i.test(error?.message||'');
}
export function readableNetworkError(error){
  if(!isNetworkFailure(error))return error;
  const result=new Error(CONNECTION_MESSAGE);result.code='functions/unavailable';return result;
}
