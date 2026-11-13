/* Local LZ dictionary codec, wire-compatible with lz-string compressToBase64.
   Format pinned as lz-string-base64-v1. UTF-16 input, 6-bit Base64 output.
   No runtime dependency or network request. */
(function(g){
  'use strict';
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  function compressToBase64(text){
    if(text==null)return '';const dict=new Map(),pending=new Set(),out=[];let size=3,width=2,enlarge=2,w='',buffer=0,position=0;
    function bit(v){buffer=(buffer<<1)|v;if(position===5){out.push(alphabet[buffer]);buffer=0;position=0;}else position++;}
    function bits(n,v){for(let j=0;j<n;j++){bit(v&1);v>>=1;}}
    function grow(){if(--enlarge===0){enlarge=2**width;width++;}}
    function emit(word){if(pending.has(word)){const ch=word.charCodeAt(0);bits(width,ch<256?0:1);bits(ch<256?8:16,ch);grow();pending.delete(word);}else bits(width,dict.get(word));grow();}
    for(let i=0;i<text.length;i++){const c=text.charAt(i);if(!dict.has(c)){dict.set(c,size++);pending.add(c);}const wc=w+c;if(dict.has(wc))w=wc;else{emit(w);dict.set(wc,size++);w=c;}}
    if(w)emit(w);bits(width,2);do{bit(0);}while(position!==0);let encoded=out.join('');while(encoded.length%4)encoded+='=';return encoded;
  }
  function decompressFromBase64(text){
    if(text==null)return '';if(!text)return null;const dict=[0,1,2];let index=0,mask=32,value=alphabet.indexOf(text.charAt(0)),width=3,enlarge=4,size=4;
    function bits(n){let x=0;for(let p=0;p<n;p++){if(index>text.length)throw Error('LZ bị cắt');x|=((value&mask)?1:0)<<p;mask>>=1;if(!mask){mask=32;value=alphabet.indexOf(text.charAt(++index));}}return x;}
    const first=bits(2);if(first===2)return '';if(first>1)return null;let w=String.fromCharCode(bits(first===0?8:16));dict[3]=w;const out=[w];
    while(index<=text.length){let c=bits(width);if(c===2)return out.join('');if(c===0||c===1){dict[size++]=String.fromCharCode(bits(c===0?8:16));c=size-1;enlarge--;}
      if(enlarge===0){enlarge=2**width;width++;}let entry=dict[c];if(entry===undefined){if(c!==size)return null;entry=w+w.charAt(0);}out.push(entry);dict[size++]=w+entry.charAt(0);enlarge--;w=entry;if(enlarge===0){enlarge=2**width;width++;}
    }return null;
  }
  const api={compressToBase64,decompressFromBase64};if(typeof module!=='undefined')module.exports=api;g.LZString=api;
})(globalThis);
