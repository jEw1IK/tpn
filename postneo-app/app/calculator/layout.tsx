import type { Metadata } from 'next';

export const metadata:Metadata={
 title:'POSTNEO — калькулятор питания',
 description:'Энтеральное и парентеральное питание новорождённых: состав смесей, калории, белки, жиры, углеводы и баланс жидкости. Учебный прототип.',
};

export default function CalculatorLayout({children}:{children:React.ReactNode}){
 return children;
}
