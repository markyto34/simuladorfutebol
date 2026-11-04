(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.MetricCoverage=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const MIN_METRIC_SAMPLE=3,MIN_XG_SAMPLE=5;
  const minimumFor=metric=>metric==="xgFor"||metric==="xgAgainst"?MIN_XG_SAMPLE:MIN_METRIC_SAMPLE;
  const validCount=values=>Array.isArray(values)?values.filter(value=>value!==null&&value!==undefined&&!(typeof value==="string"&&value.trim()==="")&&Number.isFinite(Number(value))&&Number(value)>=0).length:0;
  const hasSufficientSample=(values,metric)=>validCount(values)>=minimumFor(metric);
  const hasPairedCoverage=(homeValues,awayValues,metric)=>hasSufficientSample(homeValues,metric)&&hasSufficientSample(awayValues,metric);
  return Object.freeze({MIN_METRIC_SAMPLE,MIN_XG_SAMPLE,minimumFor,validCount,hasSufficientSample,hasPairedCoverage});
});
