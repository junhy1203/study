import test from 'node:test';
import assert from 'node:assert/strict';
import {AVATAR_CATALOG as catalog,avatarItem,ownedAvatarItems} from '../functions/avatar-catalog.js';
import {RPG_CHARACTERS,RPG_EFFECTS} from '../avatar-rpg.js';
import {STREET_CHARACTERS,STREET_EFFECTS} from '../avatar-street.js';
import {LUXURY_CHARACTERS,LUXURY_EFFECTS} from '../avatar-luxury.js';
import {ACCESSORIES} from '../avatar-accessories.js';
import {STATIONERY} from '../avatar-stationery.js';
import {CINEMATIC_EFFECTS} from '../avatar-cinematic.js';

test('RPG catalog keeps unique priced items and preserves existing ownership',()=>{
  assert.equal(catalog.length,222);assert.equal(new Set(catalog.map(item=>item.id)).size,222);
  for(const item of catalog){assert.ok(['일반','레어','에픽','레전드','신화'].includes(item.tier));assert.ok(Number.isSafeInteger(item.costSeconds)&&item.costSeconds>=0);assert.equal(avatarItem(item.slot,item.value),item);}
  assert.equal(Object.keys(RPG_CHARACTERS).length,20);assert.equal(Object.keys(RPG_EFFECTS).length,16);
  for(const key of Object.keys(RPG_CHARACTERS))assert.ok(avatarItem('character',key));
  for(const key of Object.keys(RPG_EFFECTS))assert.ok(avatarItem('effect',key));
  assert.equal(Object.keys(STREET_CHARACTERS).length,8);assert.equal(Object.keys(STREET_EFFECTS).length,8);for(const key of Object.keys(STREET_CHARACTERS))assert.ok(avatarItem('character',key));for(const key of Object.keys(STREET_EFFECTS))assert.ok(avatarItem('effect',key));
  assert.ok(ownedAvatarItems({avatarInventory:['effect_galaxy','character_fox','background_forest']}).includes('effect_galaxy'));
  assert.ok(!ownedAvatarItems({avatarInventory:['effect_galaxy']}).includes('effect_dragonsoul'));
});

test('mythic rainbow collection has premium prices and requires ownership',()=>{
  const luxury=catalog.filter(item=>item.tier==='신화');
  assert.equal(luxury.length,21);
  assert.deepEqual(new Set(luxury.map(item=>item.slot)),new Set(['character','hat','glasses','effect','background','accessory']));
  for(const item of luxury){
    assert.ok(item.costSeconds>=100*3600);
    assert.ok(!ownedAvatarItems({avatarInventory:[]}).includes(item.id));
    assert.ok(ownedAvatarItems({avatarInventory:[item.id]}).includes(item.id));
  }
  for(const key of Object.keys(LUXURY_CHARACTERS))assert.equal(avatarItem('character',key)?.tier,'신화');
  for(const key of Object.keys(LUXURY_EFFECTS))assert.equal(avatarItem('effect',key)?.tier,'신화');
  assert.equal(avatarItem('effect','prismnova').costSeconds,9999*3600);
});

test('accessories cover every tier with an empty default and matching original artwork',()=>{
  const items=catalog.filter(item=>item.slot==='accessory');
  assert.equal(items.length,49);assert.equal(Object.keys(ACCESSORIES).length,48);
  assert.deepEqual(items.filter(item=>item.costSeconds===0).map(item=>item.value),['none']);
  assert.deepEqual([...new Set(items.map(item=>item.tier))],['일반','레어','에픽','레전드','신화']);
  for(const item of items.filter(item=>item.value!=='none'))assert.ok(ACCESSORIES[item.value],item.id);
  assert.ok(ownedAvatarItems({avatarInventory:[]}).includes('accessory_none'));
});

test('stationery adds 24 priced accessories with all tiers and mythic artwork',()=>{
  assert.equal(Object.keys(STATIONERY).length,24);
  const items=Object.keys(STATIONERY).map(key=>avatarItem('accessory',key));
  assert.ok(items.every(item=>item?.costSeconds>0));
  assert.equal(new Set(items.map(item=>item.tier)).size,5);
  for(const item of items)assert.equal(STATIONERY[item.value][3]==='신화',item.tier==='신화');
});

test('six cinematic formats include the new highest-priced catalog item',()=>{
  const items=Object.keys(CINEMATIC_EFFECTS).map(key=>avatarItem('effect',key));
  assert.equal(items.length,6);assert.equal(new Set(Object.values(CINEMATIC_EFFECTS).map(item=>item.format)).size,6);
  assert.ok(items.every(item=>item.tier==='신화'&&item.costSeconds>0));
  assert.equal(avatarItem('effect','cosmiccoronation').costSeconds,Math.max(...catalog.map(item=>item.costSeconds)));
  assert.equal(avatarItem('effect','cosmiccoronation').costSeconds,88888*3600);
});
