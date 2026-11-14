// Seconds at every boundary. Delay is already included in provider travelTime.
export const TRAFFIC_MAX_AGE = 6 * 60_000;
const positive = n => Number.isFinite(n) && n > 0;
export function hasFreshTraffic(route, now=Date.now()) {
 return positive(route?.trafficTime) && positive(route?.trafficCheckedAt) && now-route.trafficCheckedAt>=-5000 && now-route.trafficCheckedAt<TRAFFIC_MAX_AGE;
}
export function routeSeconds(route, now=Date.now()) {return hasFreshTraffic(route,now)?route.trafficTime:route.time;}
export function timingEvidence(route) {
 const times=(route.maneuvers||[]).map(m=>m.time),sum=times.reduce((n,t)=>n+(Number.isFinite(t)&&t>=0?t:0),0);
 return {summarySeconds:route.time,maneuverSeconds:sum,maneuverValid:times.every(t=>Number.isFinite(t)&&t>=0),mismatch:positive(route.time)&&positive(sum)&&Math.abs(sum-route.time)>Math.max(3,route.time*.02)};
}
export function navigationTiming(route, state, dwellSeconds=0, remainingTraffic=null, now=Date.now()) {
 const evidence=timingEvidence(route);
 // A service summary and its maneuver total must share a single clock.
 const fraction=positive(evidence.maneuverSeconds)?Math.max(0,Math.min(1,state.remS/evidence.maneuverSeconds)):Math.max(0,Math.min(1,state.remM/(route.lengthM||1)));
 const baseSeconds=Math.max(0,route.time*fraction);
 const sampleFresh=remainingTraffic&&positive(remainingTraffic.baseSeconds)&&positive(remainingTraffic.seconds)&&now-remainingTraffic.at>=-5000&&now-remainingTraffic.at<TRAFFIC_MAX_AGE;
 const live=!!sampleFresh||hasFreshTraffic(route,now);
 const driveSeconds=sampleFresh?baseSeconds/remainingTraffic.baseSeconds*remainingTraffic.seconds:(live?route.trafficTime:route.time)*fraction;
 const dwell=Math.max(0,Number.isFinite(dwellSeconds)?dwellSeconds:0);
 return {baseSeconds,driveSeconds,dwellSeconds:dwell,totalSeconds:driveSeconds+dwell,live,evidence};
}
export function stopImpact(option, context, dwellMinutes=0, now=Date.now()) {
 const dwell=Math.max(0,Math.min(180,Number(dwellMinutes)||0))*60;
 const existing=(context?.stops||[]).reduce((n,s)=>n+Math.max(0,s.dwellMinutes||0)*60,0)+(context?.activeDwellSeconds||0);
 // Parking's total already includes existing stops and the walking leg.
 const totalSeconds=option.totalSeconds+(option.walkRoute?0:existing)+dwell;
 return {totalSeconds,extraSeconds:option.extraSeconds+dwell,arrivalAt:now+totalSeconds*1000,dwellSeconds:dwell};
}
