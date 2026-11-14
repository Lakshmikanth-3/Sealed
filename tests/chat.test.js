import test from 'node:test';
import assert from 'node:assert/strict';
import { createChat } from '../server/chat.js';
import { memoryKv } from '../server/kv.js';

function setup() {
  let t = 1_000_000;
  const chat = createChat({ kv: memoryKv({ now: () => t }), now: () => t });
  return { chat, tick: (ms) => { t += ms; }, now: () => t };
}

test('a chat has exactly two people and outsiders are refused', async () => {
  const { chat } = setup();
  const a = await chat.create({ name: 'QQ' });
  const b = await chat.join(a.chatId, { name: 'RR' });
  assert.equal(b.memberId, 'b');
  assert.equal((await chat.join(a.chatId, { name: 'SS' })).code, 409, 'third person refused');
  assert.equal((await chat.read(a.chatId, 'wrong-token')).code, 403);
  assert.equal((await chat.read('AAAAAAAAAAAAAAAA', a.token)).code, 404);
  assert.equal((await chat.create({ name: 'not base64!' })).code, 400);
});

test('messages flow both ways with delivered and read receipts and presence', async () => {
  const { chat, tick } = setup();
  const a = await chat.create({ name: 'QQ' }), b = await chat.join(a.chatId, { name: 'RR' });
  await chat.post(a.chatId, a.token, { c: 'aGVsbG8' });
  await chat.state(a.chatId, b.token, { typing: true });
  let r = await chat.read(a.chatId, a.token);
  assert.equal(r.other.typing, true); assert.equal(r.other.online, true);
  r = await chat.read(a.chatId, b.token);
  assert.equal(r.messages.length, 1); assert.equal(r.messages[0].c, 'aGVsbG8'); assert.equal(r.messages[0].from, 'a');
  await chat.state(a.chatId, b.token, { delivered: 0, read: 0 });
  r = await chat.read(a.chatId, a.token, { after: 0 });
  assert.equal(r.messages.length, 0, 'only newer messages are returned');
  assert.equal(r.other.readUpTo, 0);
  tick(20_000);
  r = await chat.read(a.chatId, a.token);
  assert.equal(r.other.online, false); assert.equal(r.other.typing, false);
  assert.equal((await chat.post(a.chatId, a.token, { c: '' })).code, 400);
});

test('a timed message is withheld from the other person until its time', async () => {
  const { chat, tick, now } = setup();
  const a = await chat.create({ name: 'QQ' }), b = await chat.join(a.chatId, { name: 'RR' });
  await chat.post(a.chatId, a.token, { c: 'c2VjcmV0', openAtMs: now() + 60_000 });
  let m = (await chat.read(a.chatId, b.token)).messages[0];
  assert.equal(m.locked, true); assert.equal(m.c, undefined, 'no ciphertext before the time');
  assert.equal((await chat.read(a.chatId, a.token)).messages[0].c, 'c2VjcmV0', 'the sender still sees their own message');
  tick(60_001);
  m = (await chat.read(a.chatId, b.token)).messages[0];
  assert.equal(m.locked, false); assert.equal(m.c, 'c2VjcmV0');
  assert.equal((await chat.post(a.chatId, a.token, { c: 'eA', openAtMs: now() - 1 })).code, 400);
});

test('a view-once message is delivered once and then deleted from the server', async () => {
  const { chat } = setup();
  const a = await chat.create({ name: 'QQ' }), b = await chat.join(a.chatId, { name: 'RR' });
  await chat.post(a.chatId, a.token, { c: 'b25jZQ', viewOnce: true });
  assert.equal((await chat.read(a.chatId, a.token)).messages[0].c, undefined, 'sender never gets it back');
  assert.equal((await chat.read(a.chatId, b.token)).messages[0].c, 'b25jZQ');
  const again = (await chat.read(a.chatId, b.token)).messages[0];
  assert.equal(again.gone, true); assert.equal(again.c, undefined);
  assert.equal((await chat.read(a.chatId, a.token)).messages[0].gone, true, 'sender sees it was opened');
});
