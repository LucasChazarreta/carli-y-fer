import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
const moduleURL=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
test('panel guides invitation creation, renders per-person states and submits edits as one invitation',async t=>{
 const {document,window}=parseHTML(await fs.readFile('public/admin.html','utf8'));
 globalThis.document=document;globalThis.window=window;
 window.qrcode=()=>({addData(){},make(){},createSvgTag(){return '<svg></svg>'}});
 const interval=globalThis.setInterval;globalThis.setInterval=()=>0;t.after(()=>globalThis.setInterval=interval);
 for(const d of document.querySelectorAll('dialog')){d.showModal=()=>{d.open=true};d.close=()=>{d.open=false};}
 const form=document.querySelector('#invitation-form');form.reset=()=>{};Object.defineProperty(form,'elements',{value:{display_name:form.querySelector('[name="display_name"]')}});
 let rows=[{id:'i1',display_name:'Familia <Gómez>',revision:2,revoked_at:null,guests:[{id:'g1',name:'Ana',status:'confirmed',dietary:'',notes:''},{id:'g2',name:'Juan',status:'pending',dietary:'',notes:''}]}],saved;
 globalThis.__panelAPI={privateRows:async()=>rows,invitationAdmin:async body=>{saved=body;return {id:'i1'}}};
 let source=await fs.readFile('public/admin-invitations.js','utf8');
 source=source.replace('"./api.js"',JSON.stringify(moduleURL('export const api=globalThis.__panelAPI;'))).replace('"./config.js"',JSON.stringify(moduleURL('export const config={siteUrl:"https://wedding.example/"};'))).replace('"./utils.js"',JSON.stringify(moduleURL(await fs.readFile('public/utils.js','utf8')))).replace('"./invitation-links.js"',JSON.stringify(moduleURL(await fs.readFile('public/invitation-links.js','utf8'))));
 const {initInvitations}=await import(moduleURL(source));const manager=initInvitations(async()=>true);
 document.querySelector('#guest-filter option').setAttribute('selected','');await manager.load();
 assert.equal(document.querySelectorAll('.invitation-card').length,1);assert.match(document.querySelector('.invitation-card').textContent,/1 de 2 confirmados/);assert.equal(document.querySelectorAll('gómez').length,0);
 const edit=document.querySelector('[data-command="edit"]');await document.querySelector('#invitation-list').onclick({target:edit});
 assert.equal(document.querySelectorAll('.person-editor').length,2);assert.equal(form.elements.display_name.value,'Familia <Gómez>');
 document.querySelector('[data-field="name"]').value='Ana María';await form.onsubmit({preventDefault(){}});
 assert.equal(saved.action,'save');assert.equal(saved.id,'i1');assert.equal(saved.revision,2);assert.equal(saved.guests.length,2);assert.equal(saved.guests[0].name,'Ana María');
 document.querySelector('#new-invitation').onclick();assert.equal(document.querySelectorAll('.person-editor').length,1);assert.equal(form.elements.display_name.value,'');
});
