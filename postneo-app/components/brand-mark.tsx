type BrandMarkProps={className?:string};

export function BrandMark({className}:BrandMarkProps){
 return <svg className={'brand-mark'+(className?' '+className:'')} viewBox="0 0 32 32" role="img" aria-label="POSTNEO" focusable="false"><path d="M7 3h10c6.6 0 10 3.4 10 8.7S23.4 20.5 17 20.5h-5V29H7V3Zm5 5v7.5h4.7c3.5 0 5.3-1.3 5.3-3.8S20.2 8 16.7 8H12Z" fill="currentColor" fillRule="evenodd"/></svg>;
}
