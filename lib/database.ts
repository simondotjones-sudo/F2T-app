import {AsyncLocalStorage} from 'node:async_hooks';
import {databaseDriver} from './database-driver';
import {currentTenant,withTenant} from './tenant-context';
import type {Tenant} from './tenant-types';

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
type Executor = { query: (sql: string, values?: unknown[]) => Promise<QueryResult> };
const transactions=new AsyncLocalStorage<Executor>();
// The final phase of an authorised registry transaction: drop privileges to the
// selected client's role and keep application helpers on the same connection.
// The caller must commit/roll back next; no control-plane queries may follow.
export async function inClientScope<T>(client:Executor,tenant:Tenant,operation:()=>Promise<T>){
  if(transactions.getStore())throw new Error('Cannot change client inside a client transaction.');
  await configure(client,tenant);
  return withTenant(tenant,()=>transactions.run(client,operation));
}
async function configure(client:Executor,tenant:Awaited<ReturnType<typeof currentTenant>>){
  const schema=tenant.id===1?'public':`lms_tenant_${tenant.id}`;
  const role=`lms_client_${tenant.id}`;
  if(!Number.isSafeInteger(tenant.id)||tenant.id<1||tenant.schema_name!==schema||tenant.role_name!==role)throw new Error('Invalid client context.');
  // SET LOCAL is reset on commit AND rollback before this connection is reused.
  await client.query(`SET LOCAL ROLE "${role}"`);
  await client.query(`SET LOCAL search_path = pg_catalog, "${schema}", pg_temp`);
}

export async function inTransaction<T>(operation: (client: Executor) => Promise<T>) {
  const active=transactions.getStore();if(active)return operation(active);
  const tenant=await currentTenant();
  const client = await databaseDriver().pool.connect();
  try {
    await client.query('BEGIN');
    await configure(client as Executor,tenant);
    const result = await transactions.run(client as Executor,()=>operation(client as Executor));
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

// Existing application statements use positional ? parameters. Never interpolate values.
export function postgresSql(sql: string) {
  let result = '', index = 0, quote = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      result += c;
      if (c === quote) { if (sql[i + 1] === quote) result += sql[++i]; else quote = ''; }
    } else if (c === "'" || c === '"') { quote = c; result += c; }
    else result += c === '?' ? `$${++index}` : c;
  }
  return result;
}
export class PreparedStatement {
  constructor(readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new PreparedStatement(this.sql, values.map(v => v === undefined ? null : v)); }
  async execute(client?: Executor):Promise<QueryResult> { return client ? client.query(postgresSql(this.sql), this.values) : inTransaction(tx=>tx.query(postgresSql(this.sql),this.values)); }
  async first<T = Record<string, unknown>>() { return (await this.execute()).rows[0] as T | undefined ?? null; }
  async all<T = Record<string, unknown>>() { return { results: (await this.execute()).rows as T[] }; }
  async run() { const result = await this.execute(); return { meta: { changes: result.rowCount ?? 0 } }; }
}
export function db() {
  return {
    prepare: (sql: string) => new PreparedStatement(sql),
    async batch(statements: PreparedStatement[]) {
      if(!statements.length)return [];
      return inTransaction(async client=>{const results=[];for(const statement of statements){const result=await statement.execute(client);results.push({meta:{changes:result.rowCount??0}});}return results;});
    },
  };
}
