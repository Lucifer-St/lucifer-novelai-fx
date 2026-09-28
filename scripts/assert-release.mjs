import {readFile} from 'node:fs/promises';
import {RELEASE_CONFIG} from '../shared/release-config.mjs';
import {RELEASE_NOTES} from '../src/lib/release-notes.mjs';
// Both source export and portable packaging must identify the same announced release.
export async function assertReleaseMetadata(){
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 if(pkg.version!==RELEASE_CONFIG.version||pkg.version!==RELEASE_NOTES.version||!/^\d{4}-\d{2}-\d{2}$/.test(RELEASE_NOTES.date)||!RELEASE_NOTES.features?.length)throw Error('发布版本、更新公告或公告日期不一致，停止打包。');
}
