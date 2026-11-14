import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'*.spec.js',timeout:45000,workers:1,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{longitude:27.1045,latitude:38.3695,accuracy:8},colorScheme:'light',serviceWorkers:'block',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
  webServer:{command:'npm start',url:'http://127.0.0.1:4173',reuseExistingServer:true},
});
