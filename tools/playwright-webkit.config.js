// Optional trusted-runtime runner for environments without a system ldconfig catalog.
// This uses Playwright's supported executablePath option; dependency checks must be done
// with ldd against the exact installed binary. It does not substitute a phone test.
import base from '../playwright.config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
if(!process.env.YOLCU_WEBKIT_EXECUTABLE)throw new Error('Set YOLCU_WEBKIT_EXECUTABLE to the verified Playwright WebKit runtime wrapper.');
export default {...base,testDir:root+'/tests',webServer:{...base.webServer,cwd:root},projects:[{name:'webkit',use:{browserName:'webkit',launchOptions:{executablePath:process.env.YOLCU_WEBKIT_EXECUTABLE}}}]};
