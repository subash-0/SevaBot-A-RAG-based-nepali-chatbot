const C = {
  'shri':'श्री','ksh':'क्ष','gya':'ज्ञ','str':'स्त्र','chh':'छ',
  'kh':'ख','gh':'घ','ch':'च','jh':'झ','Th':'ठ','Dh':'ढ',
  'th':'थ','dh':'ध','ph':'फ','bh':'भ','Sh':'ष','sh':'श',
  'ng':'ङ','ny':'ञ','tr':'त्र',
  'k':'क','g':'ग','c':'च','j':'ज','T':'ट','D':'ड','N':'ण',
  't':'त','d':'द','n':'न','p':'प','b':'ब','m':'म','y':'य',
  'r':'र','l':'ल','w':'व','v':'व','s':'स','h':'ह','f':'फ'
};
const VM = {
  'aa':'ा','ii':'ी','uu':'ू','ai':'ै','au':'ौ','ri':'ृ',
  'a':'','i':'ि','I':'ी','u':'ु','U':'ू','e':'े','o':'ो'
};
const VF = {
  'aa':'आ','ai':'ऐ','au':'औ','ri':'ऋ','ii':'ई','uu':'ऊ',
  'a':'अ','i':'इ','I':'ई','u':'उ','U':'ऊ','e':'ए','o':'ओ'
};
const SP = { 'M':'ं','H':'ः',':':'ः','~':'ँ','.':'।' };
const DG = { '0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९' };
const HL = '्';

const SC = Object.keys(C).sort((a, b) => b.length - a.length);
const SM = Object.keys(VM).sort((a, b) => b.length - a.length);
const SF = Object.keys(VF).sort((a, b) => b.length - a.length);

function pick(keys, s, i) {
  for (const k of keys) if (s.startsWith(k, i)) return k;
  return null;
}

const MATRA_CHARS = new Set(['ा','ि','ी','ु','ू','ृ','े','ै','ो','ौ','ं','ः','ँ']);

function isDevanagariConsonant(ch) {
  // Covers क-ह and some conjunct bases; intentionally broad for Nepali block.
  return /[\u0915-\u0939\u0958-\u095f\u0978-\u097f]/.test(ch);
}

function attachVowelToPrevious(output, matra) {
  if (!output) return null;

  let tail = output;
  let last = tail[tail.length - 1];

  // If last char is a matra, don't attach another.
  if (MATRA_CHARS.has(last)) return null;

  // If last char is halanta, move one more back to find the base consonant.
  if (last === HL) {
    tail = tail.slice(0, -1);
    last = tail[tail.length - 1];
  }

  if (!isDevanagariConsonant(last)) return null;

  // Inherent 'a' case: nothing to change.
  if (matra === '') return output;

  return tail.slice(0, -1) + last + matra;
}

export function transliterate(s) {
  let o = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (' \n\r\t'.includes(c)) { o += c; i++; continue; }
    if (c === '+') { o += HL; i++; continue; }
    if (DG[c]) { o += DG[c]; i++; continue; }
    if (SP[c]) { o += SP[c]; i++; continue; }
    const ck = pick(SC, s, i);
    if (ck) {
      i += ck.length;
      if (s[i] === '+') { o += C[ck] + HL; i++; continue; }
      const mk = pick(SM, s, i);
      if (mk !== null) { o += C[ck] + VM[mk]; i += mk.length; continue; }
      o += C[ck] + (i < s.length && pick(SC, s, i) ? HL : '');
      continue;
    }
    const vk = pick(SF, s, i);
    if (vk) {
      const attached = attachVowelToPrevious(o, VM[vk]);
      if (attached !== null) {
        o = attached;
        i += vk.length;
        continue;
      }
      o += VF[vk];
      i += vk.length;
      continue;
    }
    o += c; i++;
  }
  return o;
}