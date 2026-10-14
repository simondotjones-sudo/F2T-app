// Existing workflow suites now run through client 1's restricted database role.
// Multi-tenant tests exercise the real resolver and all other client roles.
export const tenantFixture={name:'primark-tenant-fixture',setup(b){
 b.onResolve({filter:/^sharp$/},()=>({path:new URL(import.meta.resolve('sharp')).pathname,external:true}));
 b.onResolve({filter:/(?:^@\/lib\/|^\.\/|^\.\.\/\.\.\/lib\/)tenant-context$/},()=>({path:'tenant',namespace:'tenant-fixture'}));
 b.onLoad({filter:/.*/,namespace:'tenant-fixture'},()=>({loader:'js',contents:`
 const tenant={id:1,name:'Primark',slug:'primark',schema_name:'public',role_name:'lms_client_1',active:true,registration_code:'safety',logo_url:'/branding/primark-logo.svg',theme_color:'#008bc9',revision:1};
 export const currentTenant=async()=>tenant;
 export const tenantBySlug=async slug=>slug==='primark'?tenant:null;
 export const withTenant=(_tenant,fn)=>fn();
 export const forEachTenant=fn=>fn();
 export const CLIENT_COOKIE='lms_client';` }));
}};
export function pglitePool(pg){let pending=Promise.resolve();async function lock(){const old=pending;let release;pending=new Promise(r=>release=r);await old;return release;}async function query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:r.rowCount??r.affectedRows??r.rows.length};}return {async query(sql,args){const release=await lock();try{return await query(sql,args);}finally{release();}},async connect(){const release=await lock();return {query,release};}};}
