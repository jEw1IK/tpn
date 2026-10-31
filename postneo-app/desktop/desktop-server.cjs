// POSTNEO Карточки на одном ПК: запускает standalone-сервер Next на 127.0.0.1 и следит за окном.
// Данные: %LOCALAPPDATA%\POSTNEO\kart (Windows), ~/.local/share/postneo/kart (Linux).
// Переменные: PORT (иначе свободный), DATA_DIR, DESKTOP_WATCHDOG=0 — не гасить сервер без окна.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');

const here=__dirname;
const log=(...a)=>console.log(new Date().toISOString(),'[desktop]',...a);

function defaultDataDir(){
 if(process.platform==='win32')return path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'POSTNEO','kart');
 if(process.platform==='darwin')return path.join(os.homedir(),'Library','Application Support','POSTNEO','kart');
 return path.join(process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share'),'postneo','kart');
}
const dataDir=process.env.DATA_DIR||defaultDataDir();
fs.mkdirSync(dataDir,{recursive:true});
process.env.DATA_DIR=dataDir;
process.env.NODE_ENV='production';
process.env.NEXT_TELEMETRY_DISABLED='1';
process.env.HOSTNAME=process.env.HOSTNAME||'127.0.0.1';
// Приложение на ПК — калькулятор с печатью, без базы пациентов и входа. База живёт на сервере отделения.
// Включить базу локально: POSTNEO_DESKTOP_KART=1.
const kartEnabled=process.env.POSTNEO_DESKTOP_KART==='1';
if(!kartEnabled)process.env.KART_DISABLED='1';

/** Копия базы при каждом запуске, одна на день, хранится 30 последних. Делается до открытия базы сервером. */
function backupOnStart(){
 const file=path.join(dataDir,'postneo.sqlite');
 if(!fs.existsSync(file))return;
 const dir=path.join(dataDir,'backups');fs.mkdirSync(dir,{recursive:true});
 const stamp=new Date().toISOString().slice(0,10);
 const target=path.join(dir,`postneo-${stamp}.sqlite`);
 if(fs.existsSync(target))return;
 try{
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(file,{readOnly:true});
  db.exec(`vacuum into '${target.replaceAll("'","''")}'`);db.close();
  const old=fs.readdirSync(dir).filter(f=>/^postneo-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().reverse().slice(30);
  for(const f of old)fs.unlinkSync(path.join(dir,f));
  log('копия базы:',target);
 }catch(e){log('копия базы не удалась:',e&&e.message||e);}
}

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});}

const runFile=path.join(dataDir,'run.json');
function writeRun(port){fs.writeFileSync(runFile,JSON.stringify({port,pid:process.pid,startedAt:new Date().toISOString(),url:`http://127.0.0.1:${port}/${kartEnabled?'':'calculator'}`,path:kartEnabled?'/':'/calculator'}));}
function clearRun(){try{const r=JSON.parse(fs.readFileSync(runFile,'utf8'));if(r.pid===process.pid)fs.unlinkSync(runFile);}catch{}}

/** Сторожевой таймер: окно шлёт /api/ping раз в 10 с. Нет пингов 90 с после первого или 5 мин с запуска — сервер не нужен. */
function watchdog(){
 if(process.env.DESKTOP_WATCHDOG==='0')return;
 const started=Date.now();
 const grace=Number(process.env.DESKTOP_WATCHDOG_MS)||90*1000;
 const first=Number(process.env.DESKTOP_FIRST_PING_MS)||5*60*1000;
 setInterval(()=>{
  const last=globalThis.__postneoLastPing;
  const now=Date.now();
  if(!last&&now-started>first){log('окно так и не открылось, выход');shutdown(0);}
  if(last&&now-last>grace){log('окно закрыто, выход');shutdown(0);}
 },Math.min(5000,grace/3)).unref();
}
let stopping=false;
function shutdown(code){if(stopping)return;stopping=true;clearRun();setTimeout(()=>process.exit(code),200).unref();}
process.on('SIGINT',()=>shutdown(0));process.on('SIGTERM',()=>shutdown(0));process.on('exit',clearRun);
process.on('uncaughtException',e=>{log('ошибка:',e&&e.stack||e);});

(async()=>{
 if(kartEnabled)backupOnStart();
 const port=Number(process.env.PORT)||await freePort();
 process.env.PORT=String(port);
 writeRun(port);
 log(`данные: ${dataDir}`);
 log(`сервер: http://127.0.0.1:${port}/ · режим: ${kartEnabled?'база пациентов':'только калькулятор'}`);
 watchdog();
 require(path.join(here,'server.js'));
})().catch(e=>{log('не удалось запустить:',e&&e.stack||e);process.exit(1);});
