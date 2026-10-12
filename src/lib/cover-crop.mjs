export const COVER_SIZE=512;
export function cropSquare(width,height,zoom=1,centerX=.5,centerY=.5){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('图片尺寸无效');
 zoom=Math.max(1,Math.min(4,Number(zoom)||1));
 const side=Math.min(width,height)/zoom;
 const x=Math.max(0,Math.min(width-side,(Number(centerX)||0)*width-side/2));
 const y=Math.max(0,Math.min(height-side,(Number(centerY)||0)*height-side/2));
 return {x,y,side,centerX:(x+side/2)/width,centerY:(y+side/2)/height,zoom};
}
export function panCrop(width,height,crop,dx,dy,viewport){
 const scale=viewport/crop.side;
 return cropSquare(width,height,crop.zoom,crop.centerX-dx/scale/width,crop.centerY-dy/scale/height);
}
export function zoomCrop(width,height,crop,zoom,anchorX=.5,anchorY=.5){
 const x=Math.max(0,Math.min(1,anchorX)),y=Math.max(0,Math.min(1,anchorY));
 const next=cropSquare(width,height,zoom,crop.centerX,crop.centerY);
 // Keep the source point under the cursor stable, except at the image edges.
 return cropSquare(width,height,next.zoom,(crop.x+x*crop.side+(.5-x)*next.side)/width,(crop.y+y*crop.side+(.5-y)*next.side)/height);
}
export function renderCover(image,crop,size=COVER_SIZE){
 const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 context.drawImage(image,crop.x,crop.y,crop.side,crop.side,0,0,size,size);
 return canvas.toDataURL('image/png');
}
