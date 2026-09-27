export function positionValue(value){const n=Number(value);return Number.isFinite(n)?Math.round(Math.max(0,Math.min(1,n))*1000)/1000:.5;}
export function pointerPosition(rect,x,y,offsetX=0,offsetY=0){return {x:positionValue((x-rect.left-offsetX)/Math.max(1,rect.width)),y:positionValue((y-rect.top-offsetY)/Math.max(1,rect.height))};}
export function fitPositionCanvas(width,height,availableWidth,availableHeight){const ratio=Math.max(1,Number(width)||1)/Math.max(1,Number(height)||1),w=Math.min(Math.max(1,availableWidth),Math.max(1,availableHeight)*ratio);return {width:w,height:w/ratio};}
