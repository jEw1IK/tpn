/** Display precision never exceeds hundredths: the paper sheet and the screen round like the ward does. */
export const maxDisplayDigits=2;
/** Keep positive values visible when the selected display precision is too small. */
export function formatNumber(value:number|null|undefined,digits=2):string {
 if(value==null||!Number.isFinite(value))return '—';
 digits=Math.min(digits,maxDisplayDigits);
 const format=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(n);
 const threshold=10**-digits;
 if(value!==0&&Math.abs(value)<threshold)return (value>0?'< ': '> −')+format(threshold);
 return format(Object.is(value,-0)?0:value);
}

/** Concentration in mg/ml; below 0,1 mg/ml it switches to mcg/ml so hundredths still carry the number. */
export function formatConcentration(mgPerMl:number|null|undefined):string {
 if(mgPerMl==null||!Number.isFinite(mgPerMl))return '—';
 if(mgPerMl!==0&&Math.abs(mgPerMl)<0.1)return formatNumber(mgPerMl*1000,1)+' мкг/мл';
 return formatNumber(mgPerMl,2)+' мг/мл';
}
