// A clean sharing copy must clear pixel-channel steganography as well as EXIF/text chunks.
// Originals are never modified. Output is PNG with the same dimensions and transparency.
export function clearStealthBits(rgba){for(let at=0;at<rgba.length;at+=4){rgba[at]&=254;rgba[at+1]&=254;rgba[at+2]&=254;if(rgba[at+3]>0)rgba[at+3]|=1;}return rgba;}
export async function cleanSharingImage(url){
 const response=await fetch(url);if(!response.ok)throw Error('无法读取分享图片');const bitmap=await createImageBitmap(await response.blob());
 try{if(bitmap.width*bitmap.height>32000000)throw Error('图片超过 3200 万像素，无法在当前页面生成清洁副本');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  clearStealthBits(pixels.data);
  context.putImageData(pixels,0,0);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 导出失败')),'image/png'));
 }finally{bitmap.close();}
}
