// This command makes real, potentially billable requests only after explicit local confirmation.
import { readEnv,config } from '../src/config.mjs';
import { GoogleCalendar,eventId } from '../src/providers/calendar.mjs';
import { ResendEmail } from '../src/providers/email.mjs';
import { id,email } from '../src/util.mjs';
import { availableSlots } from '../src/time.mjs';
import { DEFAULT_SETTINGS } from '../src/defaults.mjs';
import { mkdirSync,writeFileSync } from 'node:fs';
readEnv();const c=config();
if(!process.argv.includes('--confirm'))throw new Error('This sends one REAL email and creates/deletes one REAL calendar event. Run with --confirm after configuring a dedicated calendar and SMOKE_EMAIL.');
if(c.calendarProvider!=='google'||c.emailProvider!=='resend')throw new Error('Select Google Calendar and Resend explicitly. Mock mode cannot pass live smoke.');
const recipient=email(process.env.SMOKE_EMAIL);if(!recipient)throw new Error('SMOKE_EMAIL is required.');
if(!c.emailAllowlist.includes(recipient))throw new Error('For this smoke command, SMOKE_EMAIL must be in EMAIL_ALLOWLIST even in live mode.');
const calendar=new GoogleCalendar(c),sender=new ResendEmail(c),now=Date.now(),key=`smoke-${id()}`,eid=eventId(key);
const report={date:new Date().toISOString(),mode:'live',calendar:'google',email:'resend',calendarId:c.calendarId,success:false,cleanup:false};
let attempted=false;
try{
  const busy=await calendar.busy(now,now+14*86400000),slot=availableSlots(now,DEFAULT_SETTINGS,busy)[0];
  if(!slot)throw new Error('No free slot in the dedicated calendar in the demo schedule.');
  attempted=true;const event=await calendar.create({...slot,key,leadId:'smoke',name:'Leadloom integration smoke',summary:'Synthetic test. This event will be deleted by the smoke command.',timezone:DEFAULT_SETTINGS.timezone});
  if(!event||!(await calendar.get(eid)))throw new Error('Created event could not be confirmed.');
  report.eventId=event.id;
  const sent=await sender.send({from:c.emailFrom,to:recipient,subject:'Leadloom integration smoke',text:'This is an explicitly requested synthetic integration check. No lead was contacted.',reply_to:c.emailReplyTo},key,'smoke');
  report.emailId=sent.id;report.success=true;
}catch(error){report.error=error.code||error.message;process.exitCode=1;}
finally{
  if(attempted){try{await calendar.cancel({externalId:eid});report.cleanup=(await calendar.get(eid))===null;}catch(error){report.cleanupError=error.code||error.message;process.exitCode=1;}}
  if(attempted&&!report.cleanup)report.success=false;
  mkdirSync('evidence',{recursive:true});writeFileSync('evidence/live-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  if(attempted&&!report.cleanup)console.error(`Inspect the dedicated calendar manually for event ${eid}. Do not blindly repeat this command.`);
}
