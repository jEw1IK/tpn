import {redirect} from 'next/navigation';
import {getDb} from '@/lib/server/db';
import {listAudit} from '@/lib/server/auth';
import {currentUser,isAdmin} from '@/lib/server/session';

export const dynamic='force-dynamic';
const actionNames:Record<string,string>={login:'вход',logout:'выход','login-failed':'неверный пароль','login-blocked':'вход закрыт: перебор',join:'регистрация по приглашению','password-change':'сменил свой пароль','invite-create':'создал приглашение','invite-delete':'отозвал приглашение',setup:'первый запуск',view:'просмотр',open:'открыл лист',create:'завёл пациента',update:'правка карточки',discharge:'выписка',return:'возврат в отделение',weight:'взвешивание','weight-delete':'удалил взвешивание',sign:'подписал лист',unsign:'снял подпись','delete-draft':'удалил черновик','vault-create':'создал ключ отделения','vault-rewrap':'сменил фразу или код','vault-encrypt':'зашифровал старые записи','user-create':'новый пользователь','user-password':'смена пароля','user-disable':'отключил пользователя','user-enable':'включил пользователя'};
export default async function JournalPage(){
 const user=(await currentUser())!;if(!isAdmin(user))redirect('/patients');
 const rows=listAudit(getDb(),300);
 return <div className="kwrap"><div className="khead"><h1>Журнал действий</h1><span className="hint">последние {rows.length}</span></div>
  <div className="card"><table className="ktab"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробности</th><th>IP</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td style={{whiteSpace:'nowrap'}}>{new Date(r.at).toLocaleString('ru-RU')}</td><td>{r.name??r.login??'—'}</td><td>{actionNames[r.action]??r.action}</td><td>{r.entity}{r.entity_id?' #'+r.entity_id:''}</td><td>{r.details}</td><td>{r.ip??''}</td></tr>)}</tbody></table></div></div>;
}
