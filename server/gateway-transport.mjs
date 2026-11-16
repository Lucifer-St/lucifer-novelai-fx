import {Agent,buildConnector,fetch as undiciFetch} from 'undici';
import {setTimeout as delay} from 'node:timers/promises';

export const GENERATION_TIMEOUT_MS=600_000;
export const GATEWAY_CONNECT_TIMEOUT_MS=30_000;

const connectionFailures = new WeakSet();
const transientConnectCodes = new Set([
 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT',
 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
 'ECONNREFUSED', 'EAI_AGAIN',
]);

export function isRetryablePreSendFailure(error) {
 const cause = error?.cause || error;
 return connectionFailures.has(cause) && transientConnectCodes.has(cause?.code);
}

export async function fetchWithConnectionRetry(fetchImpl, url, options, {canReconnect, onReconnect, retryBeforeSend}) {
 let reconnectAttempt = 0;
 let pauseMs = 1000;
 while (true) {
  try {
   return await fetchImpl(url, options);
  } catch (error) {
   const code = error?.cause?.code || error?.code;
   const preSendFailure = retryBeforeSend && isRetryablePreSendFailure(error);
   const retryable = code === 'UND_ERR_CONNECT_TIMEOUT' || preSendFailure;
   if (!retryable || options.signal.aborted || !canReconnect?.()) throw error;
   onReconnect(++reconnectAttempt);
   try {
    await delay(preSendFailure ? Math.max(3000, pauseMs) : pauseMs, undefined, {signal: options.signal});
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
  connect:Object.freeze({timeout:GATEWAY_CONNECT_TIMEOUT_MS,rejectUnauthorized:true}),
});

export function createGatewayTransport({origin='https://image.novelai.net'}={}){
 const connect = buildConnector({allowH2:false, ...GATEWAY_AGENT_OPTIONS.connect});
 const dispatcher = new Agent({
  ...GATEWAY_AGENT_OPTIONS,
  connect(options, callback) {
   return connect(options, (error, socket) => {
    // Undici has not received a connected socket, so it cannot have sent HTTP.
    if (error) connectionFailures.add(error);
    callback(error, socket);
   });
  },
 });
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
