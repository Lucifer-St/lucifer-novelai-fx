// Public reference services only; never include credentials, raw URLs or gateway
// billing language in their network errors. This does not change proxy routing.
export function publicNetworkMessage(error,service){
 const code=String(error?.cause?.code||error?.code||'');
 const reason=['ENOTFOUND','EAI_AGAIN'].includes(code)?'域名解析失败':
  ['UND_ERR_CONNECT_TIMEOUT','ETIMEDOUT'].includes(code)?'建立连接超时':
  error?.name==='TimeoutError'?'读取超时':
  ['ECONNRESET','UND_ERR_SOCKET','ECONNREFUSED'].includes(code)?'连接中断或被拒绝':
  /CERT|TLS|SSL/.test(code)?'安全连接验证失败':'暂时无法连接';
 return `${service}${reason}。请检查网络后手动重试，也可在原站查看；这不代表生图服务离线。`;
}
