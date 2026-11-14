// One in-flight request, newest intent wins, bounded retry. Transport is injectable for tests.
export class Replanner {
  constructor({getContext,request,commit,status=()=>{},clock=()=>performance.now(),schedule=setTimeout,unschedule=clearTimeout}){
    Object.assign(this,{getContext,request,commit,status,clock,schedule,unschedule});this.version=0;this.controller=null;this.retry=null;this.failures=0;this.metrics=[];
  }
  async run(reason='deviation',replace=false){
    if(!replace&&(this.controller||this.retry))return;
    if(replace)this.cancel();
    const context=this.getContext();if(!context)return;
    const version=++this.version,controller=new AbortController();this.controller=controller;
    const metric={reason,detectionMs:context.deviationMs??null,confirmedAt:context.confirmedAt??this.clock()};
    this.status('Rota yenileniyor');metric.requestedAt=this.clock();metric.dispatchMs=Math.max(0,metric.requestedAt-metric.confirmedAt);
    try{
      const route=await this.request(context,controller.signal);metric.serviceMs=this.clock()-metric.requestedAt;
      if(version!==this.version||controller.signal.aborted||!this.getContext())return;
      const applied=await this.commit(route,context);metric.applied=applied!==false;metric.totalMs=this.clock()-metric.requestedAt;this.failures=0;this.status('');
      if(applied===false){this.controller=null;this.retry=this.schedule(()=>{this.retry=null;this.run('moving-origin');},0);}
    }catch(error){
      if(version!==this.version||controller.signal.aborted)return;
      metric.error=error.name||'Error';this.failures++;const delay=Math.min(30000,1000*2**Math.min(this.failures,5));
      this.status('Bağlantı bekleniyor · rota tekrar denenecek');
      this.retry=this.schedule(()=>{this.retry=null;this.run('retry');},delay);
    }finally{
      if(version===this.version)this.controller=null;
      if(metric.serviceMs!=null||metric.error){this.metrics.push(metric);if(this.metrics.length>50)this.metrics.shift();}
    }
  }
  cancel(){this.version++;this.controller?.abort();this.controller=null;if(this.retry!=null)this.unschedule(this.retry);this.retry=null;this.failures=0;this.status('');}
}
