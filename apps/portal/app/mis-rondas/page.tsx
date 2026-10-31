import {MisRondasComprador} from './vista-mis-rondas';
export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={
 title:'Mis solicitudes · Cotironda',
 description:'Rondas de materiales de tu empresa, con acceso privado'
};
export default function PaginaMisRondas(){
 return <main className="mvp014-page" style={{background:'#0b1829',minHeight:'100vh',
  padding:'24px max(18px, calc((100vw - 1080px)/2))',color:'#e9f3ff'}}>
  <MisRondasComprador/>
 </main>;
}
