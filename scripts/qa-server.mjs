import {createStudioServer} from '../server/index.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../.local/qa-data/',import.meta.url));
createStudioServer({root,dataDir:root,releaseRepository:null,fetchImpl:async()=>{throw Error('Real upstream calls are forbidden on this QA server');},releaseFetchImpl:async()=>{throw Error('Release checks require isolated fixtures');}}).listen(18920,'127.0.0.1',()=>console.log('Isolated FX QA: http://127.0.0.1:18920'));
