import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
process.chdir(root); // Browser location must match npm run setup, from any CLI cwd.
const at=process.argv.indexOf('--work');if(at<0)throw new Error('--work required');
const work=path.resolve(process.argv[at+1]);
const props=JSON.parse(await fs.readFile(path.join(work,'input-props.json'),'utf8'));
const schedule=JSON.parse(await fs.readFile(path.join(work,'overlay-schedule.json'),'utf8'));
await fs.mkdir(path.join(work,'overlays'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'../fonts'),outDir:path.join(work,'remotion-bundle')});
const browser=await openBrowser('chrome',{onBrowserDownload:()=>{throw new Error('Chromium is missing. Run npm run setup in remotion/ before rendering.');}});
try{
 const composition=await selectComposition({serveUrl,id:'Overlays',inputProps:props,puppeteerInstance:browser});
 let next=0,done=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(next<schedule.length){const item=schedule[next++];
   await renderStill({composition,serveUrl,inputProps:props,frame:item.frame,output:path.join(work,item.file),imageFormat:'png',puppeteerInstance:browser,logLevel:'error'});
   if(++done%25===0||done===schedule.length)console.log(`renderStill ${done}/${schedule.length}`);
  }
 }));
}finally{await browser.close({silent:true});}
