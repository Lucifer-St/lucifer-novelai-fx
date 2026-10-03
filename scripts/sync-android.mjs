import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
execFileSync(process.execPath,['scripts/prepare-android.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','sync','android'],{stdio:'inherit'});
// Capacitor resolves linked dependencies to absolute paths; keep published source portable.
const file='android/capacitor.settings.gradle';
writeFileSync(file,readFileSync(file,'utf8').replace(/project\(':capacitor-android'\)\.projectDir = new File\([^\n]+\)/,"project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')"));
