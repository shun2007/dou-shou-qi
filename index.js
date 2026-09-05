const R=9,C=7;
const DEFS={MOUSE:{n:'鼠',rk:1},CAT:{n:'猫',rk:2},DOG:{n:'狗',rk:3},WOLF:{n:'狼',rk:4},LEOPARD:{n:'豹',rk:5},TIGER:{n:'虎',rk:6},LION:{n:'狮',rk:7},ELEPHANT:{n:'象',rk:8}};
const RENAME_TYPES=['MOUSE','CAT','DOG','WOLF','LEOPARD','ELEPHANT'];
const SKILLS=[
{id:'thrust',n:'突刺',d:'连走2步'},{id:'thrust2',n:'突刺2',d:'永久2步'},
{id:'swap',n:'扭转',d:'互换'},{id:'river',n:'过河',d:'跳河'},{id:'river2',n:'过河2',d:'永久跳河'},
{id:'mutate',n:'变异',d:'+1级'},{id:'dig',n:'挖坑',d:'草→河'},{id:'fill',n:'埋坑',d:'河→草'},
{id:'suicide',n:'自杀',d:'同归'},{id:'laststand',n:'背水',d:'3步2回合'},
{id:'golden',n:'★金身',d:'Lv2'},{id:'hunter',n:'猎人',d:'陷阱'},{id:'harden',n:'硬化',d:'HP+1'},
{id:'fate',n:'天机',d:'赌命运'},{id:'firstchance',n:'先机',d:'赌回合'},{id:'killchance',n:'杀机',d:'强回合'},
{id:'float',n:'★浮空',d:'飞行/挤格'},{id:'rename',n:'改名',d:'变身份'},
{id:'aqua',n:'水生',d:'鼠强化',passive:1},{id:'counterattack',n:'反攻',d:'逆转×1',passive:1},
{id:'pile',n:'堆积',d:'化障',passive:1},{id:'longhand',n:'长手',d:'远程',passive:1},
{id:'sweep',n:'排雷',d:'拆雷',passive:1},{id:'lifechance',n:'生机',d:'存活×4',passive:1},
{id:'counterchance',n:'反机',d:'反杀×3',passive:1},{id:'hope',n:'希望',d:'复活×1',passive:1}
];
const SK_IDS=SKILLS.map(s=>s.id);
const PASSIVE_LIMITS={lifechance:4,counterchance:3,hope:1,counterattack:1};
const CANCELLABLE=new Set(['thrust','swap','river','mutate','dig','fill','suicide','laststand','golden','hunter','harden','fate','firstchance','killchance','thrust2','river2','rename']);
const CHANCE_SKILLS=new Set(['fate','firstchance','killchance']);
let board,curPlayer,selPos,moves,over,captured,lastMv,cells,trapUsed,history,isThinking;
let terrainMap,skillConfig,skillUses,activeSkill,remainingSteps,riverBuff,swapFirstPos,turnSnapSaved,barriers,placedTraps,fateFailPl,extraTurns,passiveTrigRemaining,hopeTriggered,chanceUsedThisTurn;
let stacked,floatBuff,renameTarget,counterattackState,counterattackJustTriggered;

/* Dynamic aqua */
function hasAqua(pl){return skillConfig[pl]['aqua']>0}
function getEffRk(pc){return pc.rk+(hasAqua(pc.pl)&&pc.t==='MOUSE'?1:0)}
function isAquatic(pc){return hasAqua(pc.pl)&&pc.t==='MOUSE'}

/* Stacking */
function stkKey(r,c){return r+','+c}
function stkPush(r,c,p){const k=stkKey(r,c);if(!stacked[k])stacked[k]=[];stacked[k].push(p)}
function stkPop(r,c){const k=stkKey(r,c);if(stacked[k]&&stacked[k].length>0)return stacked[k].pop();return null}
function stkClear(r,c){const k=stkKey(r,c);const a=stacked[k]||[];stacked[k]=[];return a}
function stkCnt(r,c){const k=stkKey(r,c);return stacked[k]?stacked[k].length:0}
function hasFloat(pl){return skillConfig[pl]['float']>0}
function isRiver(r,c){return terrainMap[r][c]==='river'}
function getDen(p){return p===1?[8,3]:[0,3]}
function getTrapOwner(r,c){if((r===8&&(c===2||c===4))||(r===7&&c===3))return 1;if((r===0&&(c===2||c===4))||(r===1&&c===3))return 2;const k=r+','+c;if(placedTraps[k])return placedTraps[k];return 0}
function isTrapCell(r,c){return getTrapOwner(r,c)!==0}
function isDenCell(r,c){return(r===0&&c===3)||(r===8&&c===3)}
function defaultConfig(){const c={};for(const pl of[1,2]){c[pl]={};for(const s of SK_IDS)c[pl][s]=(s==='pile'||s==='longhand'||s==='sweep'||s==='lifechance'||s==='counterchance'||s==='hope'||s==='float'||s==='aqua'||s==='counterattack')?0:1;}return c}
function initTerrain(){terrainMap=Array.from({length:R},()=>Array(C).fill('grass'));for(let r=3;r<=5;r++)for(const c of[1,2,4,5])terrainMap[r][c]='river'}
function initPassiveTrig(){passiveTrigRemaining={1:{},2:{}};for(const pl of[1,2])for(const sid of['lifechance','counterchance','hope','counterattack'])passiveTrigRemaining[pl][sid]=skillConfig[pl][sid]>0?PASSIVE_LIMITS[sid]:0}
function mkPiece(t,pl){return{...DEFS[t],t,pl,buffs:null,lastStand:-1,permaThrust:false,permaRiver:false}}
function init(){initTerrain();board=Array.from({length:R},()=>Array(C).fill(null));barriers={};placedTraps={};fateFailPl=null;extraTurns={1:0,2:0};hopeTriggered={1:false,2:false};chanceUsedThisTurn=false;initPassiveTrig();stacked={};floatBuff={1:0,2:0};renameTarget=null;counterattackState=null;counterattackJustTriggered=false;
  const p1=[[6,0,'ELEPHANT'],[6,2,'WOLF'],[6,4,'LEOPARD'],[6,6,'MOUSE'],[7,1,'DOG'],[7,5,'CAT'],[8,0,'TIGER'],[8,6,'LION']];
  const p2=[[0,0,'LION'],[0,6,'TIGER'],[1,1,'CAT'],[1,5,'DOG'],[2,0,'MOUSE'],[2,2,'LEOPARD'],[2,4,'WOLF'],[2,6,'ELEPHANT']];
  for(const[r,c,t]of p1)board[r][c]=mkPiece(t,1);for(const[r,c,t]of p2)board[r][c]=mkPiece(t,2);
  curPlayer=1;selPos=null;moves=[];over=false;lastMv=null;captured={1:[],2:[]};trapUsed={};history=[];isThinking=false;
  skillUses={1:{...skillConfig[1]},2:{...skillConfig[2]}};activeSkill=null;remainingSteps=0;riverBuff=false;swapFirstPos=null;turnSnapSaved=false}

/* Combat */
function canCapture(atk,ar,ac,def,dr,dc){const aK=(atk.buffs&&atk.buffs.kill)||0;const dI=(def.buffs&&def.buffs.inv)||0;
  if(dI>0&&!(aK>0&&aK>=dI))return 0;if(aK>0)return 1;
  if(atk.t==='MOUSE'&&def.t==='MOUSE')return 2;if(atk.t==='MOUSE'&&def.t==='ELEPHANT')return isRiver(ar,ac)?0:1;
  if(atk.t==='ELEPHANT'&&def.t==='MOUSE')return 0;
  const aRk=getEffRk(atk),dRk=getEffRk(def);if(aRk===dRk)return 2;if(aRk>dRk)return 1;return 0}
function tryCreateBarrier(pl,r,c){const k=r+','+c;if(skillConfig[pl]['pile']>0&&!barriers[k]&&!board[r][c])barriers[k]={pl,hp:3}}
function tryAbsorbHP(pc){if(pc.buffs&&pc.buffs.hp>0){pc.buffs.hp--;return true}return false}
function handleTrapDamage(pc,r,c,cl){const key=r+','+c;const owner=getTrapOwner(r,c);if(owner===0||owner===pc.pl||trapUsed[key])return false;
  if(hasFloat(pc.pl)){trapUsed[key]=true;return false}
  if(pc.buffs&&pc.buffs.imm){trapUsed[key]=true;return false}
  if(skillConfig[pc.pl]['sweep']>0){trapUsed[key]=true;skillUses[pc.pl]['hunter']++;return false}
  if(tryAbsorbHP(pc))return false;cl[pc.pl].push({...pc});board[r][c]=null;trapUsed[key]=true;if(skillConfig[pc.pl]['pile']>0)tryCreateBarrier(pc.pl,r,c);return true}
function rollHalf(){return Math.random()<0.5?'success':'fail'}
function checkPassives(atk,def,cl){const dp=def.pl;let counterKill=false,lifeSave=false,defDies=false;
  if(skillConfig[dp]['counterchance']>0&&passiveTrigRemaining[dp]['counterchance']>0){const isLast=passiveTrigRemaining[dp]['counterchance']<=1;const res=isLast?'success':rollHalf();passiveTrigRemaining[dp]['counterchance']--;if(res==='success')counterKill=true;else defDies=true}
  if(!counterKill&&skillConfig[dp]['lifechance']>0&&passiveTrigRemaining[dp]['lifechance']>0){const res=rollHalf();passiveTrigRemaining[dp]['lifechance']--;if(res==='success'){lifeSave=true;defDies=false}else defDies=true}
  return{counterKill,lifeSave,defDies}}
function checkAndTriggerHope(){for(const pl of[1,2]){if(hopeTriggered[pl]||skillConfig[pl]['hope']<=0)continue;
  const specials=['ELEPHANT','MOUSE','TIGER','LION'];let dead=0;for(const t of specials){let alive=false;
  for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]&&board[r][c].pl===pl&&board[r][c].t===t)alive=true;if(!alive)dead++}
  if(dead>=2)triggerHope(pl)}}
function triggerHope(pl){hopeTriggered[pl]=true;const traps=pl===1?[[8,2],[8,4],[7,3]]:[[0,2],[0,4],[1,3]];
  const dead=[...captured[pl]].sort((a,b)=>b.rk-a.rk);let placed=0,ti=0;
  for(let i=0;i<dead.length&&placed<3&&ti<traps.length;i++){while(ti<traps.length){const[tr,tc]=traps[ti++];const bk=tr+','+tc;
  if(!board[tr][tc]&&!barriers[bk]&&!isRiver(tr,tc)){board[tr][tc]=mkPiece(dead[i].t,pl);
  const idx=captured[pl].findIndex(c=>c.t===dead[i].t&&c.n===dead[i].n);if(idx>=0)captured[pl].splice(idx,1);placed++;break}}}}

/* Counterattack */
function tryCounterattack(pl){if(skillConfig[pl]['counterattack']<=0)return false;if(passiveTrigRemaining[pl]['counterattack']<=0)return false;if(counterattackState)return false;triggerCounterattack(pl);return true}
function triggerCounterattack(pl){const opp=pl===1?2:1;const[dr,dc]=getDen(pl);
  if(board[dr][dc]){captured[opp].push({...board[dr][dc]});stkClear(dr,dc);board[dr][dc]=null}
  const dead=[...captured[pl]];captured[pl]=[];
  const myC=[],othC=[];for(let r=0;r<R;r++)for(let c=0;c<C;c++){
    if(board[r][c]||isRiver(r,c)||isDenCell(r,c)||barriers[r+','+c])continue;
    const to=getTrapOwner(r,c);if(to!==0&&to!==pl)continue;
    if((pl===1&&r>=5)||(pl===2&&r<=3))myC.push([r,c]);else othC.push([r,c])}
  const emp=[...myC,...othC];for(let i=0;i<dead.length&&i<emp.length;i++){const[r,c]=emp[i];board[r][c]=mkPiece(dead[i].t,pl)}
  counterattackState={player:pl,turns:20};counterattackJustTriggered=true;passiveTrigRemaining[pl]['counterattack']--}

/* Valid moves */
function getValids(r,c,rb){const pc=board[r][c];if(!pc)return[];const res=[];const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  const[odr,odc]=getDen(pc.pl);const hasLH=skillConfig[pc.pl]['longhand']>0;
  const canWalkRiver=hasFloat(pc.pl)||pc.t==='MOUSE';const canJump=pc.t==='LION'||pc.t==='TIGER'||!!rb||!!pc.permaRiver;
  for(const[dr,dc]of dirs){let nr=r+dr,nc=c+dc;
    if(nr<0||nr>=R||nc<0||nc>=C||(nr===odr&&nc===odc))continue;
    const bKey=nr+','+nc;const bArr=barriers[bKey];const isEB=bArr&&bArr.pl!==pc.pl;const isRiv=isRiver(nr,nc);
    if(isRiv&&!canWalkRiver){if(canJump){let jr=nr,jc=nc;while(jr>=0&&jr<R&&jc>=0&&jc<C&&isRiver(jr,jc)){jr+=dr;jc+=dc}
      if(jr>=0&&jr<R&&jc>=0&&jc<C&&(jr!==odr||jc!==odc)){let blk=false;let t2=r+dr,t3=c+dc;while(t2!==jr||t3!==jc){if(board[t2][t3]){blk=true;break}t2+=dr;t3+=dc}
        if(!blk){const tgt=board[jr][jc];const jB=barriers[jr+','+jc];if(!tgt&&!jB)res.push([jr,jc]);else if(tgt&&tgt.pl!==pc.pl&&canCapture(pc,r,c,tgt,jr,jc)>0)res.push([jr,jc]);else if(!tgt&&jB&&jB.pl!==pc.pl)res.push([jr,jc])}}}continue}
    if(isEB&&!board[nr][nc]){res.push([nr,nc]);continue}
    const tgt=board[nr][nc];if(!tgt)res.push([nr,nc]);
    else if(tgt.pl!==pc.pl&&canCapture(pc,r,c,tgt,nr,nc)>0)res.push([nr,nc]);
    else if(tgt.pl===pc.pl&&hasFloat(pc.pl))res.push([nr,nc])}
  if(isAquatic(pc)&&isRiver(r,c)){for(const[dr,dc]of dirs){const nr=r+dr,nc=c+dc;
    if(nr>=0&&nr<R&&nc>=0&&nc<C&&!isRiver(nr,nc)){const tgt=board[nr][nc];
    if(tgt&&tgt.pl!==pc.pl&&!res.some(([mr,mc])=>mr===nr&&mc===nc))res.push([nr,nc])}}}
  if(hasLH){for(const[dr,dc]of dirs){let nr2=r+dr*2,nc2=c+dc*2;
    if(nr2>=0&&nr2<R&&nc2>=0&&nc2<C&&(nr2!==odr||nc2!==odc)){let mR=r+dr,mC=c+dc,midOk=true;
      if(mR<0||mR>=R||mC<0||mC>=C)midOk=false;if(midOk&&isRiver(mR,mC)&&pc.t!=='MOUSE'&&!canWalkRiver&&!canJump)midOk=false;
      if(midOk&&(board[mR][mC]||barriers[mR+','+mC]))midOk=false;
      if(midOk){const tgt=board[nr2][nc2];const tB=barriers[nr2+','+nc2];if(tgt&&tgt.pl!==pc.pl&&canCapture(pc,r,c,tgt,nr2,nc2)>0)res.push([nr2,nc2]);else if(!tgt&&tB&&tB.pl!==pc.pl)res.push([nr2,nc2])}}}}
  return res}

/* Win check */
function checkWin(){const[d1r,d1c]=getDen(1),[d2r,d2c]=getDen(2);
  if(board[d1r][d1c]&&board[d1r][d1c].pl===2){if(tryCounterattack(1))return 0;return 2}
  if(board[d2r][d2c]&&board[d2r][d2c].pl===1){if(counterattackState&&counterattackState.player===1){counterattackState=null;return 1}if(tryCounterattack(2))return 0;return 1}
  let p1h=false,p2h=false;for(let r=0;r<R;r++)for(let c=0;c<C;c++){if(board[r][c]){if(board[r][c].pl===1)p1h=true;if(board[r][c].pl===2)p2h=true}}
  if(!p1h)return 2;if(!p2h)return 1;return 0}

/* Apply move */
function doApply(fr,fc,tr,tc,cl){const pc=board[fr][fc],tgt=board[tr][tc],bKey=tr+','+tc,bArr=barriers[bKey],isEB=bArr&&bArr.pl!==pc.pl;
  const aPile=skillConfig[pc.pl]['pile']>0;const isImm=pc.buffs&&pc.buffs.imm||hasFloat(pc.pl);
  if(tgt&&tgt.pl===pc.pl&&hasFloat(pc.pl)){stkPush(tr,tc,tgt);board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
  if(isEB&&!tgt){bArr.hp--;if(bArr.hp<=0){delete barriers[bKey];board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;if(!isImm&&handleTrapDamage(pc,tr,tc,cl)){lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}}lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
  if(isAquatic(pc)&&isRiver(fr,fc)&&!isRiver(tr,tc)&&tgt&&tgt.pl!==pc.pl){
    const dI=(tgt.buffs&&tgt.buffs.inv)||0;if(dI>=1)return-1;
    cl[tgt.pl].push({...tgt});const ex=stkClear(tr,tc);for(const e of ex)cl[e.pl].push({...e});
    board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;if(skillConfig[tgt.pl]['pile']>0)tryCreateBarrier(tgt.pl,tr,tc);
    if(!isImm&&handleTrapDamage(pc,tr,tc,cl)){lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
  if(tgt){const res=canCapture(pc,fr,fc,tgt,tr,tc);if(res===0)return-1;
    const passives=checkPassives(pc,tgt,cl);
    if(passives.counterKill){cl[pc.pl].push({...pc});board[fr][fc]=stkPop(fr,fc)||null;if(aPile)tryCreateBarrier(pc.pl,fr,fc);lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
    if(passives.lifeSave){if(!tgt.buffs)tgt.buffs={};tgt.buffs.inv=Math.max(tgt.buffs.inv||0,1);tgt.buffs.dur=Math.max(tgt.buffs.dur||0,1);lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
    if(passives.defDies){cl[tgt.pl].push({...tgt});const ex=stkClear(tr,tc);for(const e of ex)cl[e.pl].push({...e});board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;if(skillConfig[tgt.pl]['pile']>0)tryCreateBarrier(tgt.pl,tr,tc);if(!isImm&&handleTrapDamage(pc,tr,tc,cl)){lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
    const dPile=skillConfig[tgt.pl]['pile']>0;
    if(res===2){const dL=tryAbsorbHP(tgt),aL=tryAbsorbHP(pc);if(!dL){cl[tgt.pl].push({...tgt});const ex=stkClear(tr,tc);for(const e of ex)cl[e.pl].push({...e});board[tr][tc]=null;if(dPile)tryCreateBarrier(tgt.pl,tr,tc)}if(!aL){cl[pc.pl].push({...pc});board[fr][fc]=stkPop(fr,fc)||null;if(aPile)tryCreateBarrier(pc.pl,fr,fc)}}
    else{const dL=tryAbsorbHP(tgt);if(!dL){cl[tgt.pl].push({...tgt});const ex=stkClear(tr,tc);for(const e of ex)cl[e.pl].push({...e});board[tr][tc]=null;if(dPile)tryCreateBarrier(tgt.pl,tr,tc);board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;if(!isImm&&handleTrapDamage(pc,tr,tc,cl)){lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}}}
    lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
  board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;if(!isImm&&handleTrapDamage(pc,tr,tc,cl)){lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
  lastMv={f:[fr,fc],t:[tr,tc]};return checkWin()}
function doApplySilent(fr,fc,tr,tc){const pc=board[fr][fc],tgt=board[tr][tc],bKey=tr+','+tc,bArr=barriers[bKey],isEB=bArr&&bArr.pl!==pc.pl;
  const isImm=pc.buffs&&pc.buffs.imm||hasFloat(pc.pl);
  if(tgt&&tgt.pl===pc.pl&&hasFloat(pc.pl)){stkPush(tr,tc,tgt);board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;return checkWin()}
  if(isEB&&!tgt){bArr.hp--;if(bArr.hp<=0){delete barriers[bKey];board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;const k=tr+','+tc,o=getTrapOwner(tr,tc);if(!isImm&&o!==0&&o!==pc.pl&&!trapUsed[k]){trapUsed[k]=true;board[tr][tc]=null}}return checkWin()}
  if(isAquatic(pc)&&isRiver(fr,fc)&&!isRiver(tr,tc)&&tgt&&tgt.pl!==pc.pl){const dI=(tgt.buffs&&tgt.buffs.inv)||0;if(dI>=1)return-1;board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;stkClear(tr,tc);const k=tr+','+tc,o=getTrapOwner(tr,tc);if(!isImm&&o!==0&&o!==pc.pl&&!trapUsed[k]){trapUsed[k]=true;board[tr][tc]=null}return checkWin()}
  if(tgt){const res=canCapture(pc,fr,fc,tgt,tr,tc);if(res===0)return-1;
    if(res===2){if(tgt.buffs&&tgt.buffs.hp>0)tgt.buffs.hp--;else{board[tr][tc]=null;stkClear(tr,tc)}if(pc.buffs&&pc.buffs.hp>0)pc.buffs.hp--;else board[fr][fc]=stkPop(fr,fc)||null}
    else{if(tgt.buffs&&tgt.buffs.hp>0)tgt.buffs.hp--;else{board[tr][tc]=null;stkClear(tr,tc);board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;const k=tr+','+tc,o=getTrapOwner(tr,tc);if(!isImm&&o!==0&&o!==pc.pl&&!trapUsed[k]){trapUsed[k]=true;board[tr][tc]=null}}}return checkWin()}
  board[tr][tc]=pc;board[fr][fc]=stkPop(fr,fc)||null;const k=tr+','+tc,o=getTrapOwner(tr,tc);if(!isImm&&o!==0&&o!==pc.pl&&!trapUsed[k]){trapUsed[k]=true;board[tr][tc]=null}return checkWin()}

/* Snapshots */
function buffCopy(pc){return pc&&pc.buffs?{...pc.buffs}:null}
function ptrCopy(){return{1:{...passiveTrigRemaining[1]},2:{...passiveTrigRemaining[2]}}}
function stkSnap(){const o={};for(const k in stacked)if(stacked[k].length>0)o[k]=stacked[k].map(p=>({...p,buffs:buffCopy(p)}));return o}
function casSnap(){return counterattackState?{player:counterattackState.player,turns:counterattackState.turns}:null}
function saveSnap(){return{b:board.map(r=>r.map(c=>c?{...c,buffs:buffCopy(c)}:null)),cp:curPlayer,cap:{1:captured[1].map(c=>({...c})),2:captured[2].map(c=>({...c}))},tu:{...trapUsed},lm:lastMv?{f:[...lastMv.f],t:[...lastMv.t]}:null,sk:{1:{...skillUses[1]},2:{...skillUses[2]}},tm:terrainMap.map(r=>[...r]),br:barriers,pt:placedTraps,et:{...extraTurns},ptr:ptrCopy(),ht:{...hopeTriggered},cut:chanceUsedThisTurn,stk:stkSnap(),fb:{...floatBuff},cas:casSnap()}}
function restoreSnap(s){board=s.b;curPlayer=s.cp;captured=s.cap;trapUsed=s.tu;lastMv=s.lm;if(s.sk)skillUses=s.sk;if(s.tm)terrainMap=s.tm;if(s.br)barriers=s.br;if(s.pt)placedTraps=s.pt;if(s.et)extraTurns=s.et;if(s.ptr)passiveTrigRemaining=s.ptr;if(s.ht)hopeTriggered=s.ht;fateFailPl=null;renameTarget=null;chanceUsedThisTurn=s.cut||false;stacked=s.stk||{};floatBuff=s.fb||{1:0,2:0};counterattackState=s.cas||null;counterattackJustTriggered=false}
function saveSilent(){return{b:board.map(r=>r.map(c=>c?{...c,buffs:buffCopy(c)}:null)),cp:curPlayer,tu:{...trapUsed},tm:terrainMap.map(r=>[...r]),br:Object.assign({},barriers),pt:Object.assign({},placedTraps),stk:stkSnap(),cas:casSnap()}}
function restoreSilent(s){board=s.b;curPlayer=s.cp;trapUsed=s.tu;if(s.tm)terrainMap=s.tm;if(s.br)barriers=s.br;if(s.pt)placedTraps=s.pt;stacked=s.stk||{};counterattackState=s.cas||null}
function snap(){if(!turnSnapSaved){history.push(saveSnap());turnSnapSaved=true}}

/* AI */
function getAllMoves(pl){const mv=[];for(let r=0;r<R;r++)for(let c=0;c<C;c++){if(board[r][c]&&board[r][c].pl===pl){const vm=getValids(r,c,false);for(const[tr,tc]of vm){let sc=0;if(board[tr][tc])sc=getEffRk(board[tr][tc])*10;const bk=tr+','+tc;if(barriers[bk]&&barriers[bk].pl!==pl)sc+=barriers[bk].hp*5;if(isTrapCell(tr,tc)&&getTrapOwner(tr,tc)!==pl&&!trapUsed[bk]&&!hasFloat(pl))sc-=100;if(isRiver(tr,tc)&&!hasFloat(pl))sc-=1;mv.push([r,c,tr,tc,sc])}}}mv.sort((a,b)=>b[4]-a[4]);return mv}
function evaluate(aiPl){let sc=0;const[er,ec]=getDen(aiPl===1?2:1);for(let r=0;r<R;r++)for(let c=0;c<C;c++){const p=board[r][c];if(p){const s=p.pl===aiPl?1:-1;sc+=s*getEffRk(p)*10;sc+=s*(16-(Math.abs(r-er)+Math.abs(c-ec)))*1.2;if(p.buffs){if(p.buffs.inv>0)sc+=s*20;if(p.buffs.kill>0)sc+=s*15;if(p.buffs.hp>0)sc+=s*p.buffs.hp*8}}}
  for(const k in stacked)for(const p of stacked[k])sc+=(p.pl===aiPl?1:-1)*getEffRk(p)*5;
  for(const k in barriers){const b=barriers[k];sc+=(b.pl===aiPl?1:-1)*b.hp*3}return sc}
function minimax(dep,isMax,a,b,aiPl){const cp=isMax?aiPl:(aiPl===1?2:1);if(dep===0)return evaluate(aiPl);const mvs=getAllMoves(cp);if(!mvs.length)return isMax?-99999:99999;
  if(isMax){let mx=-Infinity;for(const[fr,fc,tr,tc]of mvs){const s=saveSilent();const w=doApplySilent(fr,fc,tr,tc);let sc;if(w===aiPl)sc=99999-dep;else if(w>0)sc=-99999+dep;else sc=minimax(dep-1,false,a,b,aiPl);restoreSilent(s);mx=Math.max(mx,sc);a=Math.max(a,sc);if(b<=a)break}return mx}
  else{let mn=Infinity;for(const[fr,fc,tr,tc]of mvs){const s=saveSilent();const w=doApplySilent(fr,fc,tr,tc);let sc;if(w===aiPl)sc=99999-dep;else if(w>0)sc=-99999+dep;else sc=minimax(dep-1,true,a,b,aiPl);restoreSilent(s);mn=Math.min(mn,sc);b=Math.min(b,sc);if(b<=a)break}return mn}}
function aiGetBest(){const d=+(document.getElementById('diff').value)||2;const aiPl=2;const mvs=getAllMoves(aiPl);if(!mvs.length)return null;let best=-Infinity,arr=[];for(const[fr,fc,tr,tc]of mvs){const s=saveSilent();const w=doApplySilent(fr,fc,tr,tc);let sc;if(w===aiPl)sc=99999;else if(w>0)sc=-99999;else sc=minimax(d-1,false,-Infinity,Infinity,aiPl);restoreSilent(s);if(sc>best){best=sc;arr=[[fr,fc,tr,tc]]}else if(sc===best)arr.push([fr,fc,tr,tc])}return arr[Math.floor(Math.random()*arr.length)]||null}

/* Fate animation */
function showFateAnim(type){const d=document.createElement('div');d.className='fate-result fate-'+type;d.textContent={success:'成功！',fail:'失败！'}[type]||'';document.body.appendChild(d);setTimeout(()=>d.remove(),2100)}

/* Skill activation */
function activateSkill(id){if(over||isThinking||remainingSteps>0||fateFailPl||document.getElementById('renameOverlay').classList.contains('show'))return;if(activeSkill===id){cancelSkill();return}if(activeSkill)return;
  const mode=document.getElementById('mode').value;if(mode==='ai'&&curPlayer!==1)return;if(CHANCE_SKILLS.has(id)&&chanceUsedThisTurn)return;
  if(id==='float'){snap();extraTurns[curPlayer]=Math.max(0,(extraTurns[curPlayer]||0)-1);floatBuff[curPlayer]+=3;document.getElementById('undoBtn').disabled=false;lastMv=null;render();return}
  if(skillUses[curPlayer][id]<=0)return;
  activeSkill=id;riverBuff=(id==='river');swapFirstPos=null;selPos=null;moves=[];render()}
function cancelSkill(){if(remainingSteps>0)return;if(!activeSkill)return;if(!CANCELLABLE.has(activeSkill))return;
  activeSkill=null;riverBuff=false;swapFirstPos=null;renameTarget=null;selPos=null;moves=[];render()}

/* Click handlers */
function onClick(r,c){if(over||isThinking)return;if(fateFailPl)return onClickFateFail(r,c);if(document.getElementById('renameOverlay').classList.contains('show'))return;const a=activeSkill;
  if(a==='mutate')return onClickMutate(r,c);if(a==='swap')return onClickSwap(r,c);if(a==='dig')return onClickDig(r,c);if(a==='fill')return onClickFill(r,c);
  if(a==='suicide')return onClickSuicide(r,c);if(a==='laststand')return onClickLaststand(r,c);if(a==='golden')return onClickGolden(r,c);if(a==='hunter')return onClickHunter(r,c);
  if(a==='harden')return onClickHarden(r,c);if(a==='fate')return onClickFate(r,c);if(a==='firstchance')return onClickFirstChance(r,c);if(a==='killchance')return onClickKillChance(r,c);
  if(a==='thrust2')return onClickThrust2(r,c);if(a==='river2')return onClickRiver2(r,c);if(a==='rename')return onClickRename(r,c);return onClickBoard(r,c)}
function onClickMutate(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer||pc.rk>=8)return;snap();pc.rk++;skillUses[curPlayer]['mutate']--;document.getElementById('undoBtn').disabled=false;lastMv=null;resetAndEnd()}
function onClickSwap(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer)return;if(!swapFirstPos){swapFirstPos=[r,c];selPos=[r,c];moves=[];render();return}if(swapFirstPos[0]===r&&swapFirstPos[1]===c){swapFirstPos=null;selPos=null;render();return}
  snap();const[r1,c1]=swapFirstPos;const tmp=board[r1][c1];board[r1][c1]=board[r][c];board[r][c]=tmp;lastMv={f:[r1,c1],t:[r,c]};skillUses[curPlayer]['swap']--;document.getElementById('undoBtn').disabled=false;swapFirstPos=null;resetAndEnd()}
function onClickDig(r,c){if(terrainMap[r][c]!=='grass'||board[r][c]||isTrapCell(r,c)||isDenCell(r,c))return;snap();terrainMap[r][c]='river';skillUses[curPlayer]['dig']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickFill(r,c){if(terrainMap[r][c]!=='river')return;snap();terrainMap[r][c]='grass';skillUses[curPlayer]['fill']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickSuicide(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer)return;snap();captured[curPlayer].push({...pc});board[r][c]=stkPop(r,c)||null;if(pc===board[r][c])board[r][c]=null;if(!board[r][c]&&skillConfig[pc.pl]['pile']>0)tryCreateBarrier(pc.pl,r,c);
  const opp=curPlayer===1?2:1;for(let rr=0;rr<R;rr++)for(let cc=0;cc<C;cc++){if(board[rr][cc]&&board[rr][cc].pl===opp&&board[rr][cc].t===pc.t){captured[opp].push({...board[rr][cc]});const ex=stkClear(rr,cc);for(const e of ex)captured[e.pl].push({...e});board[rr][cc]=null;if(skillConfig[opp]['pile']>0)tryCreateBarrier(opp,rr,cc);break}}
  skillUses[curPlayer]['suicide']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];checkAndTriggerHope();const w=checkWin();if(w){over=w;render();showOver(w);return}render()}
function onClickLaststand(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer||pc.lastStand>=0)return;snap();pc.lastStand=2;skillUses[curPlayer]['laststand']--;document.getElementById('undoBtn').disabled=false;activeSkill=null;selPos=[r,c];moves=getValids(r,c,false);if(!moves.length){resetAndEnd();return}render()}
function onClickGolden(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer)return;snap();if(!pc.buffs)pc.buffs={};Object.assign(pc.buffs,{inv:3,kill:1,imm:true,dur:2});skillUses[curPlayer]['golden']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickHunter(r,c){const zone=curPlayer===1?[6,8]:[0,2];if(r<zone[0]||r>zone[1]||isRiver(r,c)||isDenCell(r,c)||getTrapOwner(r,c)!==0)return;if(board[r][c]&&board[r][c].pl!==curPlayer)return;snap();placedTraps[r+','+c]=curPlayer;skillUses[curPlayer]['hunter']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickHarden(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer)return;snap();if(!pc.buffs)pc.buffs={};pc.buffs.hp=(pc.buffs.hp||0)+1;pc.buffs.hpDur=3;skillUses[curPlayer]['harden']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickThrust2(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer||pc.permaThrust)return;snap();pc.permaThrust=true;skillUses[curPlayer]['thrust2']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickRiver2(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer||pc.permaRiver)return;snap();pc.permaRiver=true;skillUses[curPlayer]['river2']--;document.getElementById('undoBtn').disabled=false;lastMv=null;activeSkill=null;selPos=null;moves=[];render()}
function onClickRename(r,c){const pc=board[r][c];if(!pc||pc.pl!==curPlayer)return;renameTarget={r,c};
  const container=document.getElementById('renameButtons');container.innerHTML='';
  for(const type of RENAME_TYPES){const def=DEFS[type];const btn=document.createElement('button');btn.className='btn';btn.textContent=`${def.n}(${def.rk})`;btn.onclick=()=>applyRename(type);container.appendChild(btn)}
  document.getElementById('renameTitle').textContent=pc.n+' → 变身';document.getElementById('renameOverlay').classList.add('show')}
function applyRename(type){if(!renameTarget)return;const pc=board[renameTarget.r][renameTarget.c];if(!pc){closeRename();return}
  snap();const def=DEFS[type];pc.t=type;pc.rk=def.rk;pc.n=def.n;skillUses[curPlayer]['rename']--;document.getElementById('undoBtn').disabled=false;closeRename();lastMv=null;activeSkill=null;resetAndEnd()}
function closeRename(){document.getElementById('renameOverlay').classList.remove('show');renameTarget=null}
function onClickFate(r,c){chanceUsedThisTurn=true;snap();skillUses[curPlayer]['fate']--;document.getElementById('undoBtn').disabled=false;const res=rollHalf();showFateAnim(res);
  setTimeout(()=>{if(res==='success'){activeSkill='fateKill';render();return}
    const opp=curPlayer===1?2:1;const mode=document.getElementById('mode').value;
    if(mode==='ai'&&opp===2){let best=null,bestR=-1;for(let rr=0;rr<R;rr++)for(let cc=0;cc<C;cc++){if(board[rr][cc]&&board[rr][cc].pl===curPlayer&&board[rr][cc].rk>bestR){bestR=board[rr][cc].rk;best=[rr,cc]}}
      if(best){captured[curPlayer].push({...board[best[0]][best[1]]});board[best[0]][best[1]]=stkPop(best[0],best[1])||null;if(!board[best[0]][best[1]]&&skillConfig[curPlayer]['pile']>0)tryCreateBarrier(curPlayer,best[0],best[1])}
      checkAndTriggerHope();const w=checkWin();if(w){over=w;render();showOver(w);return}render()}
    else{fateFailPl=opp;render()}},500)}
function onClickFirstChance(r,c){chanceUsedThisTurn=true;snap();document.getElementById('undoBtn').disabled=false;
  let successes=0;function rollOnce(){if(skillUses[curPlayer]['firstchance']<=0)return;skillUses[curPlayer]['firstchance']--;if(rollHalf()==='success'){successes++;rollOnce()}}rollOnce();
  showFateAnim(successes>0?'success':'fail');setTimeout(()=>{extraTurns[curPlayer]=(extraTurns[curPlayer]||0)+successes;activeSkill=null;selPos=null;moves=[];render()},500)}
function onClickKillChance(r,c){chanceUsedThisTurn=true;snap();skillUses[curPlayer]['killchance']--;document.getElementById('undoBtn').disabled=false;const res=rollHalf();showFateAnim(res);
  setTimeout(()=>{if(res==='success')extraTurns[curPlayer]=(extraTurns[curPlayer]||0)+4;else{extraTurns[curPlayer]=Math.max(0,(extraTurns[curPlayer]||0)-1);}
    activeSkill=null;selPos=null;moves=[];render()},500)}
function onClickFateFail(r,c){const pc=board[r][c];if(!pc||pc.pl!==fateFailPl)return;captured[pc.pl].push({...pc});board[r][c]=stkPop(r,c)||null;if(!board[r][c]&&skillConfig[pc.pl]['pile']>0)tryCreateBarrier(pc.pl,r,c);fateFailPl=null;checkAndTriggerHope();const w=checkWin();if(w){over=w;render();showOver(w);return}render()}

/* Board click & move execution */
function onClickBoard(r,c){const mode=document.getElementById('mode').value;
  if(mode==='ai'&&curPlayer!==1&&remainingSteps===0)return;
  if(mode==='llm'&&curPlayer!==1&&remainingSteps===0)return;
  if(mode==='online'&&typeof Online!=='undefined'&&Online.connected&&!Online.isMyTurn()&&remainingSteps===0)return;
  if(remainingSteps>0){if(moves.some(([mr,mc])=>mr===r&&mc===c)){executeMove(r,c,mode)}return}
  const pc=board[r][c];if(activeSkill==='fateKill'){if(pc&&pc.pl!==curPlayer){captured[pc.pl].push({...pc});board[r][c]=stkPop(r,c)||null;if(!board[r][c]&&skillConfig[pc.pl]['pile']>0)tryCreateBarrier(pc.pl,r,c);activeSkill=null;checkAndTriggerHope();const w=checkWin();if(w){over=w;render();showOver(w);return}render()}return}
  if(pc&&pc.pl===curPlayer){selPos=[r,c];moves=getValids(r,c,!!riverBuff);render();return}if(selPos&&moves.some(([mr,mc])=>mr===r&&mc===c)){executeMove(r,c,mode);return}selPos=null;moves=[];render()}
function executeMove(r,c,mode){snap();counterattackJustTriggered=false;
  const w=doApply(selPos[0],selPos[1],r,c,captured);document.getElementById('undoBtn').disabled=false;
  if(w){if(activeSkill==='thrust')skillUses[curPlayer]['thrust']--;if(activeSkill==='river')skillUses[curPlayer]['river']--;over=w;render();showOver(w);return}
  checkAndTriggerHope();
  if(counterattackJustTriggered){counterattackJustTriggered=false;remainingSteps=0;resetAndEnd();return}
  handlePostMove(mode)}
function handlePostMove(mode){const[fR,fC]=lastMv.f,[tR,tC]=lastMv.t;let pR,pC,piece;
  if(board[tR]?.[tC]?.pl===curPlayer){pR=tR;pC=tC;piece=board[tR][tC]}else if(board[fR]?.[fC]?.pl===curPlayer){pR=fR;pC=fC;piece=board[fR][fC]}else{remainingSteps=0;resetAndEnd();return}
  let isNew=false;if(remainingSteps===0){if(activeSkill==='thrust'&&piece){remainingSteps=1;isNew=true}else if(!activeSkill&&piece.lastStand>0){remainingSteps=2;isNew=true}else if(!activeSkill&&piece.permaThrust){remainingSteps=1;isNew=true}}
  if(!isNew&&remainingSteps>0)remainingSteps--;
  if(remainingSteps>0){const vs=getValids(pR,pC,false);if(vs.length>0){selPos=[pR,pC];moves=vs;render();return}remainingSteps=0}resetAndEnd()}
function resetAndEnd(){const mode=document.getElementById('mode').value;
  if(activeSkill==='thrust')skillUses[curPlayer]['thrust']--;if(activeSkill==='river')skillUses[curPlayer]['river']--;
  activeSkill=null;riverBuff=false;remainingSteps=0;swapFirstPos=null;selPos=null;moves=[];endTurn(mode)}

/* End turn */
function endTurn(mode){
  if(!over&&counterattackState){counterattackState.turns--;if(counterattackState.turns<=0){over=counterattackState.player===1?2:1;counterattackState=null;render();showOver(over);return}}
  chanceUsedThisTurn=false;
  if(floatBuff[curPlayer]>0){extraTurns[curPlayer]=(extraTurns[curPlayer]||0)+1;floatBuff[curPlayer]--}
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const pc=board[r][c];if(pc&&pc.pl===curPlayer){if(pc.lastStand>0)pc.lastStand--;if(pc.buffs&&pc.buffs.hpDur>0){pc.buffs.hpDur--;if(pc.buffs.hpDur<=0){pc.buffs.hp=0;pc.buffs.hpDur=0}}}}
  let died=false;for(let r=0;r<R;r++)for(let c=0;c<C;c++){const pc=board[r][c];if(pc&&pc.pl===curPlayer&&pc.lastStand===0){if(tryAbsorbHP(pc)){pc.lastStand=-1;continue}captured[curPlayer].push({...pc});const ex=stkClear(r,c);for(const e of ex)captured[e.pl].push({...e});board[r][c]=null;tryCreateBarrier(curPlayer,r,c);died=true}}
  checkAndTriggerHope();if(died){const w=checkWin();if(w){over=w;render();showOver(w);return}}
  if(extraTurns[curPlayer]>0){extraTurns[curPlayer]--;turnSnapSaved=false;render();return}
  curPlayer=curPlayer===1?2:1;turnSnapSaved=false;chanceUsedThisTurn=false;
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const p=board[r][c];if(p&&p.buffs&&p.buffs.dur>0){p.buffs.dur--;if(p.buffs.dur<=0)p.buffs=null}}
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const pc=board[r][c];if(pc&&pc.pl===curPlayer){if(pc.lastStand>0)pc.lastStand--;if(pc.buffs&&pc.buffs.hpDur>0){pc.buffs.hpDur--;if(pc.buffs.hpDur<=0){pc.buffs.hp=0;pc.buffs.hpDur=0}}}}
  died=false;for(let r=0;r<R;r++)for(let c=0;c<C;c++){const pc=board[r][c];if(pc&&pc.pl===curPlayer&&pc.lastStand===0){if(tryAbsorbHP(pc)){pc.lastStand=-1;continue}captured[curPlayer].push({...pc});const ex=stkClear(r,c);for(const e of ex)captured[e.pl].push({...e});board[r][c]=null;tryCreateBarrier(curPlayer,r,c);died=true}}
  checkAndTriggerHope();if(died){const w=checkWin();if(w){over=w;render();showOver(w);return}}
  render();
  if(mode==='online'&&typeof Online!=='undefined'&&Online.connected){Online.sendState();}
  if((mode==='ai'||mode==='llm')&&curPlayer===2){isThinking=true;setTimeout(mode==='llm'?llmTurn:aiTurn,500);}else{isThinking=false;}}

/* AI turn */
function aiTurn(){if(over){isThinking=false;return}const mv=aiGetBest();if(!mv){over=1;showOver(1);isThinking=false;return}history.push(saveSnap());
  counterattackJustTriggered=false;
  const w=doApply(mv[0],mv[1],mv[2],mv[3],captured);document.getElementById('undoBtn').disabled=false;
  if(w){over=w;render();showOver(w);isThinking=false;return}
  checkAndTriggerHope();
  if(counterattackJustTriggered){counterattackJustTriggered=false;resetAndEnd();isThinking=false;return}
  resetAndEnd()}

/* UI */
function buildSkillPanel(){const el=document.getElementById('skillPanel');el.innerHTML='';
  for(const sk of SKILLS){const btn=document.createElement('button');btn.className='skill-btn sk-'+sk.id+(sk.passive?' passive':'');btn.id='sk-'+sk.id;
  btn.innerHTML=`<span class="sk-name">${sk.n}</span><span class="sk-desc">${sk.passive?'被动':sk.d}</span><span class="sk-uses">×1</span>`;if(!sk.passive)btn.onclick=()=>activateSkill(sk.id);el.appendChild(btn)}}
function buildBoard(){const el=document.getElementById('board');el.innerHTML='';cells=[];for(let r=0;r<R;r++){cells[r]=[];for(let c=0;c<C;c++){const d=document.createElement('div');d.className='cell';d.addEventListener('click',()=>onClick(r,c));d.addEventListener('contextmenu',(e)=>{e.preventDefault();cancelSkill()});el.appendChild(d);cells[r][c]=d}}}

function render(){const hZone=activeSkill==='hunter'?(curPlayer===1?[6,8]:[0,2]):null;
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){const cl=cells[r][c];cl.className='cell';
  if(isRiver(r,c))cl.classList.add('river');if(isTrapCell(r,c))cl.classList.add('trap');if(isDenCell(r,c))cl.classList.add('den');if(isTrapCell(r,c)&&trapUsed[r+','+c])cl.classList.add('used');
  if(hZone&&r>=hZone[0]&&r<=hZone[1]&&!isRiver(r,c)&&!isDenCell(r,c)&&getTrapOwner(r,c)===0&&!(board[r][c]&&board[r][c].pl!==curPlayer))cl.classList.add('hunter-zone');
  if(lastMv){if(lastMv.f[0]===r&&lastMv.f[1]===c)cl.classList.add('lm-from');if(lastMv.t[0]===r&&lastMv.t[1]===c)cl.classList.add('lm-to')}
  cl.querySelectorAll('.indicator,.piece,.barrier').forEach(e=>e.remove());
  if(selPos&&moves.some(([mr,mc])=>mr===r&&mc===c)){const sp=board[selPos[0]][selPos[1]];const isDng=sp&&isTrapCell(r,c)&&getTrapOwner(r,c)!==sp.pl&&!trapUsed[r+','+c]&&!(sp.buffs&&sp.buffs.imm)&&!hasFloat(sp.pl)&&!(skillConfig[sp.pl]['sweep']>0);const ind=document.createElement('div');ind.className='indicator '+(isDng?'danger':(board[r][c]?'cap':'move'));cl.appendChild(ind)}
  const pc=board[r][c];
  if(pc){const pe=document.createElement('div');pe.className='piece p'+pc.pl;
  if(selPos&&selPos[0]===r&&selPos[1]===c)pe.classList.add('sel');
  if(swapFirstPos&&swapFirstPos[0]===r&&swapFirstPos[1]===c){pe.classList.add('sel');pe.style.borderStyle='dashed'}
  if(fateFailPl&&pc.pl===fateFailPl){pe.classList.add('sel');pe.style.borderColor='#e040fb'}
  if(activeSkill==='fateKill'&&pc.pl!==curPlayer){pe.classList.add('sel');pe.style.borderColor='#e040fb'}
  if(activeSkill==='harden'&&pc.pl===curPlayer){pe.classList.add('sel');pe.style.borderColor='#4caf50'}
  if(activeSkill==='thrust2'&&pc.pl===curPlayer&&!pc.permaThrust){pe.classList.add('sel');pe.style.borderColor='#ff5722'}
  if(activeSkill==='river2'&&pc.pl===curPlayer&&!pc.permaRiver){pe.classList.add('sel');pe.style.borderColor='#00bcd4'}
  if(activeSkill==='rename'&&pc.pl===curPlayer){pe.classList.add('sel');pe.style.borderColor='#ab47bc'}
  if(isRiver(r,c)&&!hasFloat(pc.pl))pe.classList.add('in-river');
  if(pc.permaThrust)pe.classList.add('perma-t');if(pc.permaRiver)pe.classList.add('perma-r');
  if(hasFloat(pc.pl)){const fb=document.createElement('span');fb.className='float-badge';fb.textContent='浮';pe.appendChild(fb)}
  if(isAquatic(pc)){const ab=document.createElement('span');ab.className='aqua-badge';ab.textContent='水';ab.style.color='rgba(38,198,218,.2)';pe.appendChild(ab)}
  if(pc.lastStand>0){pe.classList.add('ls-buff');const bd=document.createElement('span');bd.className='ls-badge';bd.textContent=pc.lastStand;pe.appendChild(bd)}
  if(pc.buffs){if(pc.buffs.inv>0){pe.classList.add('golden');const bb=document.createElement('span');bb.className='buff-badge';bb.textContent='金';pe.appendChild(bb)}if(pc.buffs.hp>0){const hb=document.createElement('span');hb.className='hp-badge';hb.textContent=pc.buffs.hp;pe.appendChild(hb)}}
  if(pc.permaThrust){const pb=document.createElement('span');pb.className='perma-badge';pb.textContent='速';pb.style.color='rgba(255,152,0,.15)';pe.appendChild(pb)}
  if(pc.permaRiver){const pb=document.createElement('span');pb.className='perma-badge';pb.textContent='泳';pb.style.color='rgba(0,188,212,.15)';pe.appendChild(pb)}
  const sc=stkCnt(r,c);if(sc>0){const sb=document.createElement('span');sb.className='stack-badge';sb.textContent='+'+sc;pe.appendChild(sb)}
  pe.innerHTML+=`<span class="rank">${getEffRk(pc)}</span>`;const nm=document.createElement('span');nm.textContent=pc.n;pe.insertBefore(nm,pe.firstChild);cl.appendChild(pe)}
  else{const bk=r+','+c;if(barriers[bk]){const brk=barriers[bk];const bEl=document.createElement('div');bEl.className='barrier p'+brk.pl;bEl.innerHTML=`<span class="bhp">${brk.hp}</span><span class="blbl">障</span>`;cl.appendChild(bEl)}}}
  updateStatus();updateCaptured();updateSkills()}

function updateStatus(){const sb=document.getElementById('status');if(over){sb.innerHTML=`<span id="stxt">${over===1?'红方胜利！':'蓝方胜利！'}</span>`;return}
  const mode=document.getElementById('mode').value;let t=curPlayer===1?'红方':'蓝方';const et=extraTurns[curPlayer]||0;const fb=floatBuff[curPlayer]||0;
  if(mode==='ai'&&curPlayer===2)t+='思考中…';
  else if(mode==='llm'&&curPlayer===2)t+=(LLM&&LLM.thinking?'大模型思考中…':'回合');
  else if(fateFailPl)t=(fateFailPl===1?'红方':'蓝方')+'选择消灭单位';
  else if(activeSkill==='fateKill')t+=' · 天机：选目标';
  else if(activeSkill==='thrust')t+=' · 突刺';else if(activeSkill==='thrust2')t+=' · 突刺2：选棋子';
  else if(activeSkill==='swap'&&!swapFirstPos)t+=' · 扭转①';else if(activeSkill==='swap')t+=' · 扭转②';
  else if(activeSkill==='river')t+=' · 过河';else if(activeSkill==='river2')t+=' · 过河2：选棋子';
  else if(activeSkill==='mutate')t+=' · 变异';else if(activeSkill==='dig')t+=' · 挖坑';else if(activeSkill==='fill')t+=' · 埋坑';
  else if(activeSkill==='suicide')t+=' · 自杀';else if(activeSkill==='laststand')t+=' · 背水一战';
  else if(activeSkill==='golden')t+=' · 金身';else if(activeSkill==='hunter')t+=' · 猎人';else if(activeSkill==='harden')t+=' · 硬化';else if(activeSkill==='fate')t+=' · 天机';
  else if(activeSkill==='rename')t+=' · 改名：选单位';
  else if(remainingSteps>0)t+=' · 多步';else t+='回合';
  if(et>0)t+=` [额外${et}]`;if(fb>0)t+=` [浮空${fb}]`;
  if(counterattackState){const cn=counterattackState.player===1?'红':'蓝';t+=` [${cn}反攻:${counterattackState.turns}]`}
  const canCancel=activeSkill&&CANCELLABLE.has(activeSkill);const skLabel=canCancel?(SKILLS.find(s=>s.id===activeSkill)?.n||''):'';
  sb.innerHTML=`<span class="dot p${curPlayer}"></span><span id="stxt">${t}</span><button class="cancel-btn" onclick="cancelSkill()"${canCancel?'':' style="display:none"'}>取消·${skLabel}</button>`}
function updateCaptured(){for(const pl of[1,2]){const el=document.getElementById('cap'+pl);el.innerHTML=`<span class="lbl">${pl===1?'红方阵亡：':'蓝方阵亡：'}</span>`;for(const pc of captured[pl]){const d=document.createElement('div');d.className='cap-pc p'+pl;d.textContent=pc.n;el.appendChild(d)}}}
function updateSkills(){const mode=document.getElementById('mode').value;let pl=curPlayer;
  if(mode==='ai'||mode==='llm')pl=1;
  if(mode==='online'&&typeof Online!=='undefined'&&Online.connected)pl=Online.myPlayer;
  const inter=!over&&!isThinking&&!activeSkill&&!(mode==='ai'&&curPlayer!==1)&&remainingSteps===0&&!fateFailPl&&!document.getElementById('renameOverlay').classList.contains('show');
  for(const sk of SKILLS){const btn=document.getElementById('sk-'+sk.id);if(!btn)continue;const uses=skillUses[pl][sk.id];
  if(sk.passive){const hasLimit=PASSIVE_LIMITS[sk.id]!==undefined;
    if(skillConfig[pl][sk.id]>0){if(hasLimit){const rem=passiveTrigRemaining[pl][sk.id];btn.querySelector('.sk-uses').textContent=rem+'/'+PASSIVE_LIMITS[sk.id];btn.classList.toggle('on',rem>0);btn.classList.toggle('exhausted',rem<=0)}else{btn.querySelector('.sk-uses').textContent='ON';btn.classList.toggle('on',true);btn.classList.remove('exhausted')}}
    else{btn.querySelector('.sk-uses').textContent='OFF';btn.classList.remove('on');btn.classList.remove('exhausted')}btn.disabled=true}
  else{const blockedByChance=CHANCE_SKILLS.has(sk.id)&&chanceUsedThisTurn;
    if(sk.id==='float'){btn.querySelector('.sk-uses').textContent='∞';btn.disabled=!inter||skillConfig[pl]['float']<=0;btn.classList.toggle('active',false)}
    else{btn.querySelector('.sk-uses').textContent='×'+uses;btn.disabled=uses<=0||!inter||blockedByChance;btn.classList.toggle('active',activeSkill===sk.id)}}}}
function showOver(w){document.getElementById('ovTitle').textContent=w===1?'红方胜利！':'蓝方胜利！';const mode=document.getElementById('mode').value;document.getElementById('ovMsg').textContent=mode==='ai'?(w===1?'恭喜！':'AI获胜！'):(w===1?'红方获胜！':'蓝方获胜！');document.getElementById('overlay').classList.add('show')}
function buildSettings(){const tb=document.getElementById('skTableBody');tb.innerHTML='';SKILLS.forEach(sk=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${sk.n}</td>`+[1,2].map(pl=>`<td><div class="stepper"><button class="st-btn" onclick="adjSk('${sk.id}',${pl},-1)">−</button><div class="st-val" id="v-${sk.id}-${pl}">1</div><button class="st-btn" onclick="adjSk('${sk.id}',${pl},1)">+</button></div></td>`).join('');tb.appendChild(tr)});const pb=document.getElementById('presetBar');pb.innerHTML='';[['无技能','none'],['全×1','sym1'],['全×2','sym2'],['红→蓝','copy']].forEach(([l,v])=>{const b=document.createElement('button');b.className='preset-btn';b.textContent=l;b.onclick=()=>applyPreset(v);pb.appendChild(b)})}
function renderSettingsVals(){for(const sk of SK_IDS)for(const pl of[1,2]){const el=document.getElementById('v-'+sk+'-'+pl);if(el)el.textContent=skillConfig[pl][sk]}}
function adjSk(sk,pl,d){const v=skillConfig[pl][sk]+d;if(v<0||v>5)return;skillConfig[pl][sk]=v;renderSettingsVals()}
function applyPreset(t){for(const sk of SK_IDS)for(const pl of[1,2]){if(t==='none')skillConfig[pl][sk]=0;else if(t==='sym1')skillConfig[pl][sk]=1;else if(t==='sym2')skillConfig[pl][sk]=2;else if(t==='copy')skillConfig[2][sk]=skillConfig[1][sk]}renderSettingsVals()}
function applySettings(){closePanel('settings');newGame()}
function openPanel(id){if(id==='settings')renderSettingsVals();
  if(id==='llm')fillLLMFields();
  document.getElementById(id+'Panel').classList.add('show')}
function closePanel(id){document.getElementById(id+'Panel').classList.remove('show')}
function newGame(){document.getElementById('overlay').classList.remove('show');document.getElementById('renameOverlay').classList.remove('show');init();buildBoard();render();document.getElementById('undoBtn').disabled=true;
  if(typeof Online!=='undefined'&&Online.connected&&Online.role==='host'){setTimeout(()=>Online.sendState(),200);}}
function undo(){if(history.length===0||isThinking)return;activeSkill=null;remainingSteps=0;swapFirstPos=null;riverBuff=false;selPos=null;moves=[];fateFailPl=null;renameTarget=null;counterattackJustTriggered=false;document.getElementById('renameOverlay').classList.remove('show');
  const mode=document.getElementById('mode').value;if(mode==='ai'){history.pop();if(history.length>0)restoreSnap(history.pop());else{init();buildBoard();render();document.getElementById('undoBtn').disabled=true;return}}
  else{restoreSnap(history.pop())}over=false;turnSnapSaved=false;document.getElementById('overlay').classList.remove('show');if(history.length===0)document.getElementById('undoBtn').disabled=true;render()}
function onModeChange(){const mode=document.getElementById('mode').value;
  document.getElementById('diff').style.display=(mode==='ai')?'':'none';
  const ob=document.getElementById('onlineBtn');if(ob)ob.style.display=(mode==='online')?'':'none';
  if(mode==='online'){openPanel('online');}else{closePanel('online');if(typeof Online!=='undefined'&&Online.connected)Online.disconnect();}
  newGame()}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('settingsPanel').classList.contains('show'))closePanel('settings');else if(document.getElementById('rulesPanel').classList.contains('show'))closePanel('rules');else if(document.getElementById('renameOverlay').classList.contains('show'))closeRename();else if(activeSkill)cancelSkill()}});
skillConfig=defaultConfig();buildSkillPanel();buildSettings();buildBoard();init();render();openPanel('settings');

/* ============================================================
 * 大模型 AI（llmTurn + executeAISkill）
 * ============================================================ */
async function llmTurn(){
  if(over){isThinking=false;return;}
  try{
    const decision=await LLM.getDecision(2);
    if(!decision){console.log('LLM无决策，回退内置AI');aiTurn();return;}
    if(decision.action==='move'&&decision.from&&decision.to){
      const[fr,fc]=decision.from,[tr,tc]=decision.to;
      const pc=board[fr]&&board[fr][fc];
      if(!pc||pc.pl!==2){aiTurn();return;}
      const valids=getValids(fr,fc,false);
      if(!valids.some(([r,c])=>r===tr&&c===tc)){aiTurn();return;}
      selPos=[fr,fc];moves=valids;executeMove(tr,tc,'llm');
    }else if(decision.action==='skill'&&decision.skill){
      const ok=executeAISkill(decision.skill,decision.targets||[]);
      if(!ok)aiTurn();
    }else{aiTurn();}
  }catch(e){console.error('llmTurn错误:',e);aiTurn();}
}

function executeAISkill(skillId,targets){
  const t=(i)=>(targets[i]||[0,0]);
  try{
    switch(skillId){
      case 'mutate':activeSkill='mutate';onClickMutate(t(0)[0],t(0)[1]);break;
      case 'golden':activeSkill='golden';onClickGolden(t(0)[0],t(0)[1]);break;
      case 'harden':activeSkill='harden';onClickHarden(t(0)[0],t(0)[1]);break;
      case 'thrust2':activeSkill='thrust2';onClickThrust2(t(0)[0],t(0)[1]);break;
      case 'river2':activeSkill='river2';onClickRiver2(t(0)[0],t(0)[1]);break;
      case 'dig':activeSkill='dig';onClickDig(t(0)[0],t(0)[1]);break;
      case 'fill':activeSkill='fill';onClickFill(t(0)[0],t(0)[1]);break;
      case 'hunter':activeSkill='hunter';onClickHunter(t(0)[0],t(0)[1]);break;
      case 'suicide':activeSkill='suicide';onClickSuicide(t(0)[0],t(0)[1]);break;
      case 'swap':
        activeSkill='swap';swapFirstPos=null;
        onClickSwap(t(0)[0],t(0)[1]);
        if(swapFirstPos)onClickSwap(t(1)[0],t(1)[1]);
        break;
      case 'float':activateSkill('float');break;
      case 'thrust':
        activeSkill='thrust';selPos=t(0);moves=getValids(t(0)[0],t(0)[1],false);
        executeMove(t(1)[0],t(1)[1],'llm');
        if(remainingSteps>0&&targets[2]){
          selPos=[t(1)[0],t(1)[1]];moves=getValids(t(1)[0],t(1)[1],false);
          executeMove(t(2)[0],t(2)[1],'llm');
        }
        break;
      case 'river':
        activeSkill='river';riverBuff=true;selPos=t(0);moves=getValids(t(0)[0],t(0)[1],true);
        executeMove(t(1)[0],t(1)[1],'llm');
        break;
      case 'laststand':
        activeSkill='laststand';onClickLaststand(t(0)[0],t(0)[1]);
        if(remainingSteps>0&&targets[1]){selPos=t(0);executeMove(t(1)[0],t(1)[1],'llm');}
        break;
      case 'rename':
        renameTarget={r:t(0)[0],c:t(0)[1]};
        applyRename(targets[1]||'MOUSE');
        break;
      case 'fate':
      case 'firstchance':
      case 'killchance':
        activeSkill=skillId;
        if(skillId==='fate')onClickFate(0,0);
        else if(skillId==='firstchance')onClickFirstChance(0,0);
        else onClickKillChance(0,0);
        /* 赌博技能结果由游戏处理，若需选目标则自动选 */
        setTimeout(()=>{
          if(activeSkill==='fateKill'){
            let best=null,bestR=-1;
            for(let r=0;r<R;r++)for(let c=0;c<C;c++){
              if(board[r][c]&&board[r][c].pl!==curPlayer&&board[r][c].rk>bestR){bestR=board[r][c].rk;best=[r,c];}
            }
            if(best)onClickBoard(best[0],best[1]);
          }else if(fateFailPl){
            let worst=null,worstR=99;
            for(let r=0;r<R;r++)for(let c=0;c<C;c++){
              if(board[r][c]&&board[r][c].pl===fateFailPl&&board[r][c].rk<worstR){worstR=board[r][c].rk;worst=[r,c];}
            }
            if(worst)onClickFateFail(worst[0],worst[1]);
          }
        },800);
        break;
      default:console.warn('AI不支持的技能:',skillId);return false;
    }
    return true;
  }catch(e){console.error('executeAISkill错误:',skillId,e);return false;}
}

/* ============================================================
 * 大模型设置 UI
 * ============================================================ */
function fillLLMFields(){
  document.getElementById('llmBaseUrl').value=LLM.config.baseUrl||'';
  document.getElementById('llmApiKey').value=LLM.config.apiKey||'';
  document.getElementById('llmModel').value=LLM.config.model||'';
  document.getElementById('llmToggle').classList.toggle('on',!!LLM.config.enabled);
  document.getElementById('llmStatus').textContent='';
}
function toggleLLM(){
  LLM.config.enabled=!LLM.config.enabled;
  document.getElementById('llmToggle').classList.toggle('on',LLM.config.enabled);
  LLM.save();
}
function saveLLMSettings(){
  LLM.config.baseUrl=document.getElementById('llmBaseUrl').value.trim();
  LLM.config.apiKey=document.getElementById('llmApiKey').value.trim();
  LLM.config.model=document.getElementById('llmModel').value.trim();
  LLM.save();
  document.getElementById('llmStatus').textContent='已保存！';
  setTimeout(()=>{document.getElementById('llmStatus').textContent='';},2000);
}
async function testLLM(){
  const s=document.getElementById('llmStatus');
  s.textContent='测试中…';
  saveLLMSettings();
  if(!LLM.config.apiKey){s.textContent='请先填写 API Key';return;}
  try{
    const content=await LLM.call([{role:'user',content:'回复"连接成功"四个字'}]);
    s.textContent='连接成功！模型回复：'+(content||'').slice(0,40);
  }catch(e){s.textContent='连接失败：'+e.message;}
}

/* ============================================================
 * 联机对战 UI + 回调
 * ============================================================ */
function onlineCreate(){
  const s=document.getElementById('onlineStatus');
  s.textContent='正在创建房间…';
  Online.createRoom((code)=>{
    document.getElementById('roomCodeDisplay').style.display='block';
    document.getElementById('roomCodeText').textContent=code;
    s.textContent='房间已创建，等待对手加入…';
  });
  Online.onConnect=()=>{
    s.textContent='对手已加入！你执红方先手。';
    setTimeout(()=>{closePanel('online');newGame();},800);
  };
  Online.onDisconnect=()=>{
    s.textContent='对手已断开连接。';
  };
}
function onlineJoin(){
  const code=document.getElementById('joinCodeInput').value.trim();
  if(!/^\d{6}$/.test(code)){document.getElementById('onlineStatus').textContent='请输入6位数字房间号';return;}
  document.getElementById('onlineStatus').textContent='正在连接…';
  Online.joinRoom(code,(ok,err)=>{
    if(ok){
      document.getElementById('onlineStatus').textContent='连接成功！你执蓝方。';
      setTimeout(()=>{closePanel('online');},800);
    }else{
      document.getElementById('onlineStatus').textContent='连接失败：'+(err||'未知错误');
    }
  });
  Online.onDisconnect=()=>{
    document.getElementById('onlineStatus').textContent='连接已断开。';
  };
}
