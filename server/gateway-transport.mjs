import {Agent,fetch as undiciFetch} from 'undici';
import {setTimeout as delay} from 'node:timers/promises';

export const GENERATION_TIMEOUT_MS=600_000;
export const GATEWAY_CONNECT_TIMEOUT_MS=30_000;

export async function fetchWithConnectionRetry(fetchImpl, url, options, {canReconnect, onReconnect}) {
 try {
  return await fetchImpl(url, options);
 } catch (error) {
  const code = error.cause?.code || error.code;
  // A connect timeout occurs before HTTP dispatch. A reset can occur after it.
  if (code !== 'UND_ERR_CONNECT_TIMEOUT' || options.signal.aborted || !canReconnect?.()) throw error;
  onReconnect();
  try {
   await delay(1000, undefined, {signal: options.signal});
  } catch {
   throw error;
  }
  if (options.signal.aborted || !canReconnect()) throw error;
  return fetchImpl(url, options);
 }
}
export const GATEWAY_AGENT_OPTIONS=Object.freeze({
  // Keep this gateway on HTTP/1.1; do not negotiate a different multiplexed path
  // or inherit the global Node fetch dispatcher's HTTP/2 replay behavior.
  allowH2:false,connections:2,pipelining:1,
  headersTimeout:0,bodyTimeout:0,
  keepAliveTimeout:4000,keepAliveMaxTimeout:4000,
  connect:Object.freeze({timeout:GATEWAY_CONNECT_TIMEOUT_MS}),
});

export function createGatewayTransport({origin='https://image.novelai.net'}={}){
 const dispatcher=new Agent(GATEWAY_AGENT_OPTIONS);
 return {
  fetch(url,options={}){
   if(new URL(url).origin!==origin)throw Error('Gateway transport origin mismatch');
   if(!options.signal)throw Error('Gateway transport requires a bounded request signal');
   // A single dispatch, no RetryAgent/interceptor and no redirected credentials.
   return undiciFetch(url,{...options,redirect:'manual',dispatcher});
  },
  close:()=>dispatcher.close(),
 };
}
