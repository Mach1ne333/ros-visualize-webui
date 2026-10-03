export function bridgeAddress(value:string):string {
  const address=new URL(value);
  if(!['ws:','wss:'].includes(address.protocol)||!['localhost','127.0.0.1'].includes(address.hostname))throw new Error('本期只允许 localhost / 127.0.0.1 WebSocket 桥接');
  if(address.username||address.password||address.search||address.hash)throw new Error('本机桥接地址不可包含凭据、令牌查询或片段');
  return address.href;
}
