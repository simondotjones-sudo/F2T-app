import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {'/api/pwa/icon':['./public/branding/**']},
  async headers(){return [{source:'/sw.js',headers:[{key:'Content-Type',value:'application/javascript; charset=utf-8'},{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Service-Worker-Allowed',value:'/'},{key:'X-Content-Type-Options',value:'nosniff'}]},{source:'/offline.html',headers:[{key:'Cache-Control',value:'no-cache'},{key:'X-Content-Type-Options',value:'nosniff'}]}];}
};

export default nextConfig;
