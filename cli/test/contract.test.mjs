import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPrototype, checkAgc, enKotuSeviye, componentUrl } from '../dist/lib.mjs';

const gecerliProto = (over = {}) => ({
  manifest: {
    id: 'urn:x', name: 'Belge',
    artboards: [{ id: 'a1', name: 'Desktop - X', bounds: { x: 0, y: 0, width: 1440, height: 800 }, components: [{ id: 'c1', path: 'p', rel: 'primary' }] }],
    ...over.manifest,
  },
  linkTemplate: { href: 'https://cdn/x{;revision}{?component_id}', data: { api_key: 'CometServer1', access_token: `${Math.floor(Date.now() / 1000) + 3600}_urn:x;public_abc` } },
  ...over,
});

test('sağlıklı prototypeData tüm kontrollerden geçer', () => {
  const k = checkPrototype(gecerliProto());
  assert.equal(enKotuSeviye(k), 'ok');
});

test('süresi dolmuş token HATA verir', () => {
  const p = gecerliProto();
  p.linkTemplate.data.access_token = '1000000000_urn:x;public_abc';
  const k = checkPrototype(p);
  assert.equal(enKotuSeviye(k), 'hata');
  assert.match(k.find((x) => x.ad === 'access_token').detay, /süresi dolmuş/);
});

test('bounds sayısal değilse HATA', () => {
  const p = gecerliProto();
  p.manifest.artboards[0].bounds.width = 'geniş';
  assert.equal(enKotuSeviye(checkPrototype(p)), 'hata');
});

test('primary bileşeni olmayan artboard UYARI verir', () => {
  const p = gecerliProto();
  p.manifest.artboards[0].components = [];
  const k = checkPrototype(p);
  assert.equal(k.find((x) => x.ad === 'graphicContent').seviye, 'uyari');
});

test('bilinmeyen AGC sürümü UYARI verir ama durdurmaz', () => {
  const k = checkAgc({ version: '9.9.9' }, {}, 100);
  assert.equal(k.find((x) => x.ad === 'agc.version').seviye, 'uyari');
  assert.match(k.find((x) => x.ad === 'agc.version').detay, /ŞÜPHELİ/);
});

test('bilinen AGC sürümü OK', () => {
  assert.equal(checkAgc({ version: '1.5.0' }, {}, 100).find((x) => x.ad === 'agc.version').seviye, 'ok');
});

test('bilinmeyen tip oranı %2 yi aşarsa UYARI', () => {
  assert.equal(checkAgc({ version: '1.5.0' }, { foo: 3 }, 100).find((x) => x.ad === 'bilinmeyen tip').seviye, 'uyari');
  assert.equal(checkAgc({ version: '1.5.0' }, { foo: 1 }, 100).find((x) => x.ad === 'bilinmeyen tip').seviye, 'ok');
});

test('componentUrl ;revision=0 ve component_id kullanır (component_path DEĞİL)', () => {
  const u = componentUrl(gecerliProto(), 'c1');
  assert.ok(u.includes(';revision=0?'), ';revision=0 eksik — CDN 400 döner');
  assert.ok(u.includes('component_id=c1'));
  assert.ok(!u.includes('component_path'), 'component_path 400 döner, kullanılmamalı');
});

// ── platform separation and pairing uniqueness (the POC-2 finding) ───────────
import { platformOf } from '../dist/lib.mjs';

test('platformOf: app AYRI platform, mobil ile birleştirilmez', () => {
  assert.equal(platformOf('Fiyat Bilgisi - Desktop'), 'desktop');
  assert.equal(platformOf('Fiyat Bilgisi - Mobil'), 'mobil');
  assert.equal(platformOf('Fiyat Bilgisi - App'), 'app');
  assert.equal(platformOf('App-Detay'), 'app');
  assert.equal(platformOf('App-Mobil - Yorumlar Default'), 'app', 'iki jeton varsa app kazanır');
  assert.equal(platformOf('Önemli Bilgiler'), 'bilinmiyor');
});
