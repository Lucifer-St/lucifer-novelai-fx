import {Agent,fetch as undiciFetch} from 'undici';
import {setTimeout as delay} from 'node:timers/promises';

export const GENERATION_TIMEOUT_MS=600_000;
export const GATEWAY_CONNECT_TIMEOUT_MS=30_000;

export async function fetchWithConnectionRetry(fetchImpl, url, options, {canReconnect, onReconnect}) {
 let reconnectAttempt = 0;
 let pauseMs = 1000;
 while (true) {
  try {
   return await fetchImpl(url, options);
  } catch (error) {
   const code = error.cause?.code || error.code;
   // Each connect timeout establishes that this attempt sent no HTTP request.
   if (code !== 'UND_ERR_CONNECT_TIMEOUT' || options.signal.aborted || !canReconnect?.()) throw error;
   onReconnect(++reconnectAttempt);
   try {
    await delay(pauseMs, undefined, {signal: options.signal});
   } catch {
    // During the wait the last attempt is still known to be unsent.
    throw error;
   }
   if (options.signal.aborted || !canReconnect()) throw error;
   pauseMs = Math.min(pauseMs * 2, 8000);
  }
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
