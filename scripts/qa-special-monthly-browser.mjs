// Local-only browser QA with synthetic data. Uses actual monthly components and
// actual Dashboard cancellation handlers; the Supabase adapter is a test fixture.
// Set PLAYWRIGHT_MODULE_PATH if playwright is provided by the workspace runtime.
import { createServer } from 'vite';
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const repo = process.cwd();
const fixture = mkdtempSync(path.join(tmpdir(), 'special-monthly-browser-'));
const output = '/tmp/printer-monthly-browser-qa';
mkdirSync(output, { recursive: true });
const source = ts.createSourceFile('dashboard.tsx', readFileSync('src/app/printer/dashboard/page.tsx','utf8'), ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name) {
  let expression;
  function visit(n) { if(ts.isVariableDeclaration(n) && n.name.getText(source)===name) expression=n.initializer.getText(source); ts.forEachChild(n,visit); }
  visit(source); if(!expression)throw new Error('Missing Dashboard handler '+name);
  return ts.transpileModule(`const ${name} = ${expression};`,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
}
writeFileSync(path.join(fixture,'adapter.ts'), `
export const qaState = {
  monthly: [
    {snapshot_id:'101',report_date:'2026-09-11',job_type:'note_based',paper_type:'สติกเกอร์เหนียว',paper_used_a3:10,product_name_snapshot:'สินค้าตัวอย่าง A / 1L.'},
    {snapshot_id:'102',report_date:'2026-09-11',job_type:'note_based',paper_type:'สติกเกอร์เหนียว',paper_used_a3:6,product_name_snapshot:'สินค้าตัวอย่าง B — ชื่อยาวสำหรับทดสอบการแสดงผลบนโทรศัพท์'},
    {snapshot_id:'103',report_date:'2026-09-11',job_type:'business_card',paper_type:'300 แกรม',paper_used_a3:18,product_name_snapshot:'นามบัตรตัวอย่าง'},
    {snapshot_id:'104',report_date:'2026-10-01',job_type:'business_card',paper_type:'300 แกรม',paper_used_a3:5,product_name_snapshot:'ตัวอย่างเดือนตุลาคม'},
  ],
  sourceReports:[{id:201,order_id:7},{id:202,order_id:null}],
  order:{id:7,product_id:'OTHER',product_name:'สินค้าตัวอย่าง A / 1L.',good_a3:8,waste_a3:2,qty_per_a3_used:1,paper_type:'สติกเกอร์เหนียว',created_by_user_id:'actor',lot_number:'TEST'},
  calls:[],
};
window.qaState = qaState;
export const supabase = {
  rpc:async(name,args)=>{
    qaState.calls.push({name,args});
    const month=args.p_month?.slice(0,7);
    const selected=qaState.monthly.filter(r=>r.report_date.startsWith(month));
    if(name==='get_special_job_paper_month'){
      const groups=new Map();
      for(const r of selected){const k=JSON.stringify([r.job_type,r.paper_type]);const g=groups.get(k)||{job_type:r.job_type,paper_type:r.paper_type,paper_used_a3:0};g.paper_used_a3+=r.paper_used_a3;groups.set(k,g)}
      return {data:[...groups.values()],error:null};
    }
    if(name==='get_special_job_paper_details')return {data:selected.filter(r=>r.job_type===args.p_job_type&&r.paper_type===args.p_paper_type&&BigInt(r.snapshot_id)>BigInt(args.p_after_id)).slice(0,200),error:null};
    if(name==='delete_special_job_paper_snapshot'){
      qaState.monthly=qaState.monthly.filter(r=>!(r.snapshot_id===args.p_snapshot_id&&r.report_date.startsWith(month)));return {data:true,error:null};
    }
    if(name==='reset_special_job_paper_month'){
      qaState.monthly=qaState.monthly.filter(r=>!r.report_date.startsWith(month));return {data:3,error:null};
    }
    throw new Error('Unexpected RPC '+name);
  },
  from:(table)=>({
    delete:()=>{const filters={};const chain={eq:(key,val)=>{filters[key]=val;return chain},then:(done)=>{qaState.calls.push({table,delete:filters});if(table==='paper_reports')qaState.sourceReports=qaState.sourceReports.filter(r=>r.order_id!==filters.order_id);done({error:null})}};return chain},
    update:(value)=>({eq:async()=>{qaState.calls.push({table,update:value});if(table==='orders')Object.assign(qaState.order,value);return {error:null}}}),
  }),
};
`);
writeFileSync(path.join(fixture,'entry.tsx'), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import Swal from 'sweetalert2';
import Summary from '${repo}/src/app/printer/paper-report/SpecialMonthlySummary';
import {supabase,qaState} from './adapter';
const AppSwal=Swal;
const isAdmin=true,currentUserId='actor';
const productMetaMap={OTHER:{qtyPerA3:1}};
const getCurrentUserIdentifier=()=>'test actor';
const setOrders=()=>{},setStockDetailOrder=()=>{};
const hasStockReconciliation=(order)=>order.good_a3!=null;
${handler('undoReconcile')}
${handler('handleCancelOrder')}
function App(){return <main className="min-h-screen bg-[#F5F7F8] p-3 sm:p-5"><div className="mx-auto max-w-6xl space-y-4">
  <p className="text-sm text-slate-500">ข้อมูลสมมติสำหรับตรวจสอบหน้าจอเท่านั้น</p>
  <Summary allowed={true} revision={0}/>
  <section className="rounded-xl border bg-white p-4"><h2 className="mb-3 font-bold">ตรวจสอบการยกเลิก Order (ข้อมูลสมมติ)</h2>
    <button className="mr-3 rounded border p-2" onClick={()=>undoReconcile(qaState.order)}>ยกเลิกการตัดสต็อค (ทดสอบ)</button>
    <button className="rounded border p-2" onClick={()=>handleCancelOrder(qaState.order)}>ยกเลิก Order (ทดสอบ)</button>
  </section>
</div></main>}
createRoot(document.getElementById('root')).render(<App/>);
`);
const css = readdirSync(path.join(repo,'.next/static'), {recursive:true}).filter(p=>String(p).endsWith('.css')).map(p=>path.join(repo,'.next/static',String(p)));
assert.ok(css.length,'Run npm run build before browser QA');
writeFileSync(path.join(fixture,'index.html'),`<!doctype html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(p=>`<link rel="stylesheet" href="/@fs${p}">`).join('')}<title>Monthly local QA</title></head><body><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>`);
const server=await createServer({root:fixture,configFile:false,resolve:{alias:[
  {find:'@/lib/supabase',replacement:path.join(fixture,'adapter.ts')},
  {find:'@',replacement:path.join(repo,'src')},
  ...['react-dom','react','sweetalert2'].map(name=>({find:name,replacement:path.join(repo,'node_modules',name)})),
]},server:{host:'127.0.0.1',port:4179,strictPort:true,fs:{allow:[repo,fixture]}}});
let browser;
try {
  await server.listen();
  const pw=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
  browser=await pw.chromium.launch({channel:'chrome',headless:true});
  const results=[];
  for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4179');
    await page.getByRole('button',{name:'ดูรายการ งานจากหมายเหตุ สติกเกอร์เหนียว',exact:true}).waitFor();
    await page.screenshot({path:path.join(output,name+'-summary.png'),fullPage:true,animations:"disabled"});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' aggregate overflow');
    await page.getByRole('button',{name:'ดูรายการ งานจากหมายเหตุ สติกเกอร์เหนียว',exact:true}).click();
    const detail=page.locator('#special-monthly-details');
    const remove=detail.getByRole('button',{name:'ลบรายการ สินค้าตัวอย่าง A / 1L. 11/09/2026 10 A3',exact:true}).filter({visible:true});
    await remove.waitFor();
    await page.screenshot({path:path.join(output,name+'-details.png'),fullPage:true,animations:"disabled"});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' detail overflow');
    assert.match(await detail.innerText(),/11\/09\/2026/);
    const before=await page.evaluate(()=>({sources:JSON.stringify(window.qaState.sourceReports),order:JSON.stringify(window.qaState.order)}));
    await remove.click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'ยกเลิก');
    await page.screenshot({path:path.join(output,name+'-confirmation.png'),fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.qaState.monthly.find(r=>r.snapshot_id==='101').paper_used_a3),10);
    await remove.click();
    await page.getByRole('button',{name:'ลบรายการ',exact:true}).click();
    await page.waitForFunction(()=>!window.qaState.monthly.some(r=>r.snapshot_id==='101'));
    await detail.getByRole('button',{name:'ลบรายการ สินค้าตัวอย่าง B — ชื่อยาวสำหรับทดสอบการแสดงผลบนโทรศัพท์ 11/09/2026 6 A3',exact:true}).filter({visible:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.qaState.monthly.filter(r=>r.job_type==='note_based').reduce((s,r)=>s+r.paper_used_a3,0)),6);
    assert.deepEqual(await page.evaluate(()=>({sources:JSON.stringify(window.qaState.sourceReports),order:JSON.stringify(window.qaState.order)})),before);
    await page.screenshot({path:path.join(output,name+'-after-delete.png'),fullPage:true,animations:"disabled"});
    await page.getByRole('button',{name:'ล้างข้อมูลเดือนนี้',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'ยกเลิก');
    await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.qaState.monthly.length),3);
    await page.getByRole('button',{name:'ล้างข้อมูลเดือนนี้',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'ล้างข้อมูลเดือนนี้',exact:true}).click();
    await page.waitForFunction(()=>window.qaState.monthly.length===1);
    assert.equal(await page.evaluate(()=>window.qaState.monthly[0].report_date),'2026-10-01');
    assert.deepEqual(await page.evaluate(()=>({sources:JSON.stringify(window.qaState.sourceReports),order:JSON.stringify(window.qaState.order)})),before);
    // Reload fresh fixtures and exercise actual Dashboard handlers through their dialogs.
    await page.reload();
    await page.getByRole('button',{name:'ยกเลิกการตัดสต็อค (ทดสอบ)',exact:true}).click();
    await page.getByRole('button',{name:'ยืนยันยกเลิกตัดสต็อค',exact:true}).click();
    await page.waitForFunction(()=>window.qaState.order.good_a3===null);
    await page.getByRole('heading',{name:'ยกเลิกตัดสต็อคสำเร็จ',exact:true}).waitFor();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'ยกเลิก Order (ทดสอบ)',exact:true}).click();
    await page.locator('input.swal2-input').fill('เหตุผลทดสอบ');
    await page.getByRole('button',{name:'ยืนยันยกเลิก',exact:true}).click();
    await page.waitForFunction(()=>window.qaState.order.is_cancelled===true);
    assert.equal(await page.evaluate(()=>window.qaState.monthly.length),4);
    assert.equal(await page.evaluate(()=>window.qaState.monthly.filter(r=>r.report_date.startsWith('2026-09')).reduce((sum,r)=>sum+r.paper_used_a3,0)),34);
    assert.equal(await page.evaluate(()=>window.qaState.calls.some(c=>c.name==='delete_paper_reports_individually')),false);
    assert.deepEqual(errors,[]);
    results.push({viewport:name,width,height,passed:true,checks:['summary','detail','snapshot name/date/paper/A3','no overflow','safe confirmation focus','cancel','single contribution deletion 16 to 6','sources unchanged','full-month reset isolated','Dashboard undo and cancellation preserve monthly usage']});
    await page.close();
  }
  writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({output,results},null,2));
}finally{await browser?.close();await server.close();}
