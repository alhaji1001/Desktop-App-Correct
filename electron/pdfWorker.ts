import path from 'node:path';
import { generateReportCards, type ReportCardData, type ReportCardOptions } from '../src/pdf/reportCard';

const port = process.parentPort;
if (!port) throw new Error('Report PDF worker requires an Electron utility process.');
let cancelled = false;
port.on('message', async (event) => {
  const message = event.data as {type:string;data?:ReportCardData;options?:ReportCardOptions;outputPath?:string;assetsDir?:string};
  if (message.type === 'cancel') { cancelled = true; return; }
  if (message.type !== 'start' || !message.data || !message.options || !message.outputPath || !message.assetsDir) return;
  try {
    const files = await generateReportCards(message.data, message.options, message.outputPath, message.assetsDir,
      (done,total,currentName)=>port.postMessage({type:'progress',done,total,currentName}),()=>cancelled);
    port.postMessage({type:'complete',files});
  } catch (error) {
    port.postMessage({type:'error',message:error instanceof Error?error.message:'Could not generate report cards.'});
  }
});
