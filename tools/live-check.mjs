import { planRoutes } from '../js/api.js';
import { writeFileSync } from 'node:fs';
const from={lon:27.1045,lat:38.3695,acc:8},to={lon:27.2215,lat:38.4599};
const prefs={highways:true,hills:true,rough:true,tolls:false,maxExtraMinutes:5};
const routes=await planRoutes(from,to,prefs,[]);
if (process.argv.includes('--update-fixture')) writeFileSync('tests/fixtures/izmir-routes.json',JSON.stringify(routes));
console.log(JSON.stringify(routes.map(r=>({time:r.time,length:r.lengthM,extra:r.extraSeconds,best:r.best,fastest:r.fastest,reasons:r.reasons,stats:r.stats&&{total:r.stats.total,gradeKnown:r.stats.gradeKnown,surfaceKnown:r.stats.surfaceKnown,steep:r.stats.steep,rough:r.stats.rough},edges:r.stats?.edges.slice(0,2)})),null,2));
