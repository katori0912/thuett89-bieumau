/* Formula grammar and numeric semantics mirrored from congthuc.py. No eval. */
(function (g) {
  'use strict';
  const cache = new Map();
  function parse(source) {
    source = String(source).trim();
    if (cache.has(source)) return cache.get(source);
    const ts = []; let pos = 0;
    const token = /\s*(?:\[([^\[\]]+)\]|(\d+(?:\.\d+)?)|(<=|>=|<>|[-+*/(),<>=])|([A-Z]+))/y;
    while (pos < source.length) {
      token.lastIndex = pos; const m = token.exec(source);
      if (!m) throw Error('Công thức không hợp lệ tại ' + pos + ': ' + source);
      ts.push(m[1] ? ['ref', m[1].trim()] : m[2] ? ['num', Number(m[2])] : m[3] ? ['op', m[3]] : ['fn', m[4]]); pos = token.lastIndex;
    }
    let i = 0;
    const peek = () => ts[i] || ['end', ''];
    const take = v => { if (v && peek()[1] !== v) throw Error('Cần ' + v); return ts[i++]; };
    function cmp() { let a = expr(); if (['<','<=','>','>=','=','<>'].includes(peek()[1])) { const op=take()[1]; a=['bin',op,a,expr()]; } return a; }
    function expr() { let a=term(); while (['+','-'].includes(peek()[1])) { const op=take()[1]; a=['bin',op,a,term()]; } return a; }
    function term() { let a=factor(); while (['*','/'].includes(peek()[1])) { const op=take()[1]; a=['bin',op,a,factor()]; } return a; }
    function factor() {
      const [k,v]=peek();
      if (k==='num'||k==='ref') { take(); return [k,v]; }
      if (v==='-'||v==='+') { take(); const a=factor(); return v==='-'?['neg',a]:a; }
      if (v==='(') { take(); const a=cmp(); take(')'); return a; }
      if (k==='fn') {
        if (!['IF','ROUND','MAX','MIN','ABS','SUM'].includes(v)) throw Error('Hàm không hỗ trợ: '+v);
        take(); take('('); const args=[cmp()]; while(peek()[1]===',') { take(); args.push(cmp()); } take(')');
        if ((v==='IF'&&args.length!==3)||(v==='ABS'&&args.length!==1)||(v==='ROUND'&&args.length>2)) throw Error('Sai số đối số '+v);
        return ['fn',v,args];
      }
      throw Error('Không hiểu '+v);
    }
    const tree=cmp(); if(i!==ts.length) throw Error('Thừa ký tự công thức'); cache.set(source,tree); return tree;
  }
  function refs(n) { if(typeof n==='string') n=parse(n); return [...new Set(n[0]==='ref'?[n[1]]:n[0]==='neg'?refs(n[1]):n[0]==='bin'?[...refs(n[2]),...refs(n[3])]:n[0]==='fn'?n[2].flatMap(refs):[])]; }
  function evaluate(n, values={}) {
    if(typeof n==='string') n=parse(n);
    const ev=x=>evaluate(x,values); const [t,v]=n;
    if(t==='num') return v;
    if(t==='ref') { const x=values[v]||0; if(typeof x==='boolean') return Number(x); if(typeof x!=='number'||!Number.isFinite(x)) throw Error('['+v+'] không phải số'); return x; }
    if(t==='neg') return -ev(n[1]);
    if(t==='bin') { const a=ev(n[2]),b=ev(n[3]); switch(v) {
      case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return b?a/b:0;
      case '<':return +(a<b);case '<=':return +(a<=b+1e-9);case '>':return +(a>b);case '>=':return +(a>=b-1e-9);case '=':return +(Math.abs(a-b)<0.5);case '<>':return +(Math.abs(a-b)>=0.5);
    } }
    if(t==='fn') { const args=n[2]; if(v==='IF') return ev(args[0])?ev(args[1]):ev(args[2]); const x=args.map(ev);
      switch(v) { case 'MAX': return Math.max(...x); case 'MIN':return Math.min(...x);case 'ABS':return Math.abs(x[0]);case 'SUM':return x.reduce((a,b)=>a+b,0);
        case 'ROUND': { const q=10**Math.max(-15,Math.min(15,Math.trunc(x[1]||0))); return (x[0]>=0?1:-1)*Math.floor(Math.abs(x[0])*q+0.5)/q; }
      }
    }
    throw Error('Nút công thức không hợp lệ');
  }
  function order(formulas) {
    const done=new Set(),active=new Set(),out=[];
    function visit(k) { if(done.has(k))return; if(active.has(k))throw Error('Công thức vòng: '+k); active.add(k); for(const r of refs(formulas[k])) if(Object.hasOwn(formulas,r))visit(r); active.delete(k);done.add(k);out.push(k); }
    Object.keys(formulas).forEach(visit);return out;
  }
  function num(v, table=false) {
    if(typeof v==='number') { if(!Number.isFinite(v))throw Error('Số không hữu hạn');return v; }
    let t=String(v).trim().replace(/ /g,'');
    if((table?/^-?\d{1,3}(\.\d{3})+(,\d+)?$|^-?\d+,\d+$/:/^-?[\d.]+(,\d+)?$/).test(t))t=t.replace(/\./g,'').replace(',','.');
    if(!t||!Number.isFinite(Number(t)))throw Error('Không phải số');return Number(t);
  }
  function date(v) { const t=String(v||''); let m=t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/),y,mo,d;
    if(m){d=+m[1];mo=+m[2];y=+m[3];}else{m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!m)return null;y=+m[1];mo=+m[2];d=+m[3];}
    const dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?dt.getTime():null;
  }
  function compute(s,data={},schemas={}) {
    const values={},warnings=[],tables={},totals={},late={}; const by=Object.fromEntries(s.fields.map(f=>[f.code,f]));
    for(let [k,v]of Object.entries(data)) {k=k.replace(/^[\s\[]+|[\s\]]+$/g,''); const f=by[k];if(!f)continue;
      if(['so','cong_thuc'].includes(f.kind)&&typeof v==='string')v=num(v);
      if(f.kind==='danh_dau')v=!!v&&!['0','false','không','khong',''].includes(String(v).trim().toLowerCase());values[k]=v;
    }
    for(const f of s.fields)if(f.so_ngay&&!Object.hasOwn(values,f.code)){const [a,b]=f.so_ngay.map(c=>date(values[c]));if(a!==null&&b!==null)values[f.code]=(b-a)/86400000;}
    const virtual=new Set((s.bang_ke||[]).flatMap(b=>(b.tong||[]).map(m=>b.id+'.'+m)));
    const outer=Object.fromEntries(Object.entries(values).filter(([,v])=>typeof v==='number'||typeof v==='boolean'));
    const numericRow=(row,b)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,b.cot.find(c=>c.ma===k)?.kieu==='danh_dau'?+(v==='X'):v]));
    for(const b of s.bang_ke||[]) {
      const forms={},later={};for(const c of b.cot)if(c.kieu==='cong_thuc')(refs(c.cong_thuc).some(r=>virtual.has(r))?later:forms)[c.ma]=c.cong_thuc;
      late[b.id]=later;const seq=order(forms);
      tables[b.id]=(data.bang_ke?.[b.id]||[]).map((raw,i)=>{const row={};for(const c of b.cot){const v=raw[c.ma];if(c.kieu==='stt')row[c.ma]=i+1;else if(v!==undefined&&c.kieu!=='cong_thuc')row[c.ma]=c.kieu==='so'?num(v,true):c.kieu==='danh_dau'?([true,'x','có','co','1','true'].includes(typeof v==='string'?v.trim().toLowerCase():v)?'X':''):String(v);}
        for(const m of seq)row[m]=evaluate(forms[m],{...outer,...numericRow(row,b)});return row;});
      for(const m of b.tong||[])totals[b.id+'.'+m]=tables[b.id].reduce((a,r)=>a+(r[m]||0),0);
    }
    for(const b of s.bang_ke||[]) {
      const forms=late[b.id];for(const r of tables[b.id])for(const m of order(forms))r[m]=evaluate(forms[m],{...outer,...totals,...numericRow(r,b)});
      for(const m of b.tong||[])totals[b.id+'.'+m]=tables[b.id].reduce((a,r)=>a+(r[m]||0),0);
      for(const [i,r]of tables[b.id].entries())for(const c of b.cot)if(c.kiem&&c.kieu==='cong_thuc'&&!r[c.ma])warnings.push(b.id+' dòng '+(i+1)+': '+c.kiem);
    }
    Object.assign(values,totals);const subs={};
    for(const p of s.phu_luc_kem||[])if(data.phu_luc?.[p.id]){if(!schemas[p.id])throw Error('Thiếu phụ lục '+p.id);const r=compute(schemas[p.id],data.phu_luc[p.id],schemas);subs[p.id]=r;for(const [k,v]of Object.entries(r.tong_bang_ke))values[p.alias+'.'+k]=v;warnings.push(...r.canh_bao);}
    const forms={};for(const f of s.fields){if(f.kind==='cong_thuc'&&f.formula)forms[f.code]=f.formula;if(Object.keys(subs).length&&f.formula_pl)forms[f.code]=f.formula_pl;}
    for(const c of order(forms))values[c]=evaluate(forms[c],values);
    const aliases=(s.phu_luc_kem||[]).map(p=>p.alias+'.');
    const constraints=(s.constraints||[]).filter(c=>Object.keys(subs).length||!refs(c.expr).some(r=>aliases.some(a=>r.startsWith(a)))).map(c=>({...c,dat:!!evaluate(c.expr,values)}));
    for(const v of Object.values(values))if(typeof v==='number'&&!Number.isFinite(v))throw Error('Kết quả không hữu hạn');
    return {values,bang_ke:tables,tong_bang_ke:totals,phu_luc:subs,rang_buoc:constraints,canh_bao:warnings};
  }
  function compact(v) { if(Array.isArray(v))return v.map(compact).filter(x=>x&&Object.keys(x).length);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,compact(x)]).filter(([,x])=>x!==''&&x!==0&&x!==false&&x!==null&&x!==undefined&&!(typeof x==='object'&&!Object.keys(x).length)));return v; }
  const api={parse,refs,evaluate,order,num,compute,compact}; if(typeof module!=='undefined')module.exports=api;g.CongThuc=api;
})(globalThis);
