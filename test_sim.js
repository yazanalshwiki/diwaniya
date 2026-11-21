import { createGame } from './src/engine.js';
for (const type of ['t41','t61','trix','trixc']) {
  for (let g=0; g<30; g++) {
    const e = createGame(type); let steps=0;
    while(!e.over && steps<200000){
      steps++;
      if(e.pending){ e.tick(); continue; }
      const s=e.turn; if(s<0) throw new Error('stuck '+type+' '+e.phase);
      const a=e.botAction(s); e.act(s,a);
      // view sanity
      e.view(s); e.view(-1);
    }
    if(!e.over) throw new Error('no end '+type);
    if(g===0) console.log(type,'steps',steps,'hands',e.history.length,'winners',e.winners, JSON.stringify(e.scores||e.teamScores));
  }
}
// trix zero-sum check
const t=createGame('trix'); while(!t.over){ if(t.pending){t.tick();continue;} t.act(t.turn,t.botAction(t.turn)); }
console.log('trix sum',t.scores.reduce((a,b)=>a+b,0), 'deals', t.history.length);
