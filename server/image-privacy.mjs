import {PNG} from 'pngjs';
import {readStealthMetadata} from '../src/lib/metadata.mjs';
import {clearStealthBits} from '../src/lib/share-image.mjs';
export function stripImageMetadata(input){
 const b=Buffer.from(input);
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  const width=b.readUInt32BE(16),height=b.readUInt32BE(20);if(width*height>32000000)throw Error('图片超过 3200 万像素');
  const decoded=PNG.sync.read(b);let stealth;
  try{stealth=readStealthMetadata(decoded.data,decoded.width,decoded.height);}catch{stealth=true;}
  if(stealth){clearStealthBits(decoded.data);return PNG.sync.write(decoded);}
  const chunks=[b.subarray(0,8)];let offset=8;
  while(offset+12<=b.length){const length=b.readUInt32BE(offset),end=offset+12+length;if(end>b.length)throw Error('PNG 数据不完整');const type=b.toString('ascii',offset+4,offset+8);if(!['tEXt','zTXt','iTXt','eXIf'].includes(type))chunks.push(b.subarray(offset,end));offset=end;if(type==='IEND')break;}
  return Buffer.concat(chunks);
 }
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  const chunks=[];let offset=12;while(offset+8<=b.length){const type=b.toString('ascii',offset,offset+4),size=b.readUInt32LE(offset+4),end=offset+8+size+(size%2);if(end>b.length)throw Error('WebP 数据不完整');if(!['EXIF','XMP '].includes(type)){const chunk=Buffer.from(b.subarray(offset,end));if(type==='VP8X')chunk[8]&=~12;chunks.push(chunk);}offset=end;}const out=Buffer.concat([b.subarray(0,12),...chunks]);out.writeUInt32LE(out.length-8,4);return out;
 }
 if(b[0]===255&&b[1]===216){const parts=[b.subarray(0,2)];let at=2;while(at<b.length){if(b[at]!==255)throw Error('JPEG 标记无效');const marker=b[at+1];if(marker===218||marker===217){parts.push(b.subarray(at));break;}const end=at+2+b.readUInt16BE(at+2);if(end>b.length)throw Error('JPEG 数据不完整');if(![225,237,254].includes(marker))parts.push(b.subarray(at,end));at=end;}return Buffer.concat(parts);}
 throw Error('此格式暂不支持无元数据导出，请使用 PNG、JPEG 或 WebP。');
}
