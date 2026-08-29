import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceAssignment, parsePrototypeData, normalizeShareUrl } from '../dist/lib.mjs';

test('basit atamayı keser', () => {
  assert.equal(sliceAssignment('window.x = {"a":1} ;', 'x'), '{"a":1}');
});

test('iç içe süslü parantezleri doğru eşler', () => {
  const html = 'önce window.prototypeData = {"a":{"b":[1,{"c":2}]}}; sonra';
  assert.equal(sliceAssignment(html, 'prototypeData'), '{"a":{"b":[1,{"c":2}]}}');
});

test('STRING içindeki süslü parantez eşlemeyi bozmaz', () => {
  const html = 'window.p = {"ad":"}{ tuzak","n":1};';
  assert.equal(JSON.parse(sliceAssignment(html, 'p')).ad, '}{ tuzak');
});

test('kaçışlı tırnak eşlemeyi bozmaz', () => {
  const html = 'window.p = {"ad":"a\\"}b","n":1};';
  assert.equal(JSON.parse(sliceAssignment(html, 'p')).n, 1);
});

test('değişken yoksa null', () => {
  assert.equal(sliceAssignment('<html></html>', 'prototypeData'), null);
});

test('prototypeData yoksa TEŞHİSLİ hata', () => {
  assert.throws(() => parsePrototypeData('<html></html>'), /sözleşmesi değişmiş olabilir/i);
});

test('bozuk JSON yükü ÇALIŞTIRILMAZ — teşhisli hata verir', () => {
  // If eval were used, this expression WOULD RUN. It must not.
  const zararli = 'window.prototypeData = {"a": (globalThis.__PWNED = 1)};';
  assert.throws(() => parsePrototypeData(zararli), /JSON olarak ayrıştırılamadı/);
  assert.equal(globalThis.__PWNED, undefined, 'uzak kod ÇALIŞTIRILMIŞ — Kural 1 ihlali');
});

test('artboards boşsa hata', () => {
  assert.throws(() => parsePrototypeData('window.prototypeData = {"manifest":{"artboards":[]}};'), /artboards boş/);
});

test('access_token yoksa teşhisli hata', () => {
  const h = 'window.prototypeData = {"manifest":{"artboards":[{"id":"a"}]},"linkTemplate":{"data":{}}};';
  assert.throws(() => parsePrototypeData(h), /access_token yok/);
});

test('specs URL normalizasyonu', () => {
  assert.equal(normalizeShareUrl('https://xd.adobe.com/view/abc'), 'https://xd.adobe.com/view/abc/specs/');
  assert.equal(normalizeShareUrl('https://xd.adobe.com/view/abc/specs'), 'https://xd.adobe.com/view/abc/specs/');
  assert.equal(normalizeShareUrl('https://xd.adobe.com/view/abc/specs/'), 'https://xd.adobe.com/view/abc/specs/');
  // Derin prototip linki de /specs/'e indirgenir.
  assert.equal(
    normalizeShareUrl('https://xd.adobe.com/view/abc/screen/xyz/'),
    'https://xd.adobe.com/view/abc/specs/'
  );
});

test('/view/ OLMAYAN biçimler OLDUĞU GİBİ denenir', () => {
  // Measured: `https://xd.adobe.com/spec/<id>/grid/` is live and returns 200, but
  // appending `/specs/` made it 404 — and the tool then blamed THE USER with "the link
  // is invalid or has been withdrawn". The error was in the address we produced;
  // appending blindly is a diagnostic bug.
  for (const u of [
    'https://xd.adobe.com/spec/1f560469/grid/',
    'https://xd.adobe.com/spec/1f560469/grid',
  ]) {
    assert.equal(normalizeShareUrl(u), 'https://xd.adobe.com/spec/1f560469/grid/');
  }
});

test('prototypeData = null → LİNK HATASI teşhisi (sözleşme hatası DEĞİL)', () => {
  // Adobe answers an invalid link with HTTP 200 + null. We must not jump to the next `{` block.
  const html = 'window.prototypeData = null; if (window.prototypeData && x) { var y = {"a":1}; }';
  assert.equal(sliceAssignment(html, 'prototypeData'), null);
  assert.throws(() => parsePrototypeData(html), /geçersiz veya erişilemiyor/);
});

test('atama sağı nesne değilse null (sayı / undefined)', () => {
  assert.equal(sliceAssignment('window.p = 42; var q = {"a":1};', 'p'), null);
  assert.equal(sliceAssignment('window.p = undefined; var q = {"a":1};', 'p'), null);
});
