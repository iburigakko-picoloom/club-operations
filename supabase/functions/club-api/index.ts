import postgres from 'postgres';
import {createApi} from './api.mjs';
import {exchangeLine} from './line.mjs';

const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,idle_timeout:20,connect_timeout:10});
const transaction=(fn: (connection: unknown)=>unknown)=>sql.begin(async c=>{
 // Built-in credentials stay in Supabase. Restrict every transaction to the app role.
 await c.unsafe('SET LOCAL ROLE club_runtime');
 await c.unsafe("SET LOCAL statement_timeout='15s'");
 await c.unsafe("SET LOCAL lock_timeout='10s'");
 await c.unsafe("SELECT pg_advisory_xact_lock(hashtextextended('club-operations:club',0))");
 return await fn(c);
});
const lineConfig=()=>{const channel=Deno.env.get('LINE_CHANNEL_ID')||'',secret=Deno.env.get('LINE_CHANNEL_SECRET')||'';return {channel,secret,enabled:Deno.env.get('LINE_LOGIN_ENABLED')==='1'&&/^\d+$/.test(channel)&&!!secret};};
Deno.serve(createApi({transaction,lineConfig,exchangeLine}));
