/** Keep positive values visible when the selected display precision is too small. */
export function formatNumber(value:number|null|undefined,digits=2):string {
 if(value==null||!Number.isFinite(value))return '—';
 const format=(n:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:digits}).format(n);
 const threshold=10**-digits;
 if(value!==0&&Math.abs(value)<threshold)return (value>0?'< ': '> −')+format(threshold);
 return format(Object.is(value,-0)?0:value);
}
