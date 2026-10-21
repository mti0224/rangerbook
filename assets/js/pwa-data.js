/* Pin and verify a page's V2 release even on its first, uncontrolled visit. */
(() => {
  'use strict';
  const root = new URL('../../', document.currentScript.src);
  const nativeFetch = window.fetch.bind(window);
  let release;
  const pending=new Map();
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  function report(kind) { window.dispatchEvent(new CustomEvent('rangerbook:pwa-status',{detail:{kind}})); }
  async function versionedFetch(input, options) {
    const url = new URL(typeof input==='string' || input instanceof URL ? input : input.url, location.href);
    if(String(options?.method || input?.method || 'GET').toUpperCase()!=='GET')return nativeFetch(input,options);
    if (url.origin!==root.origin || !url.pathname.startsWith(root.pathname+'res/v2/')) return nativeFetch(input,options);
    try {
      // If crypto is unavailable, leave the ordinary website functional; SW is
      // only registered on secure origins, where integrity verification exists.
      if (!window.isSecureContext || !crypto.subtle) return nativeFetch(input,options);
      release ||= nativeFetch(new URL('pwa-data.json',root),{cache:'no-store'}).then(async r=>{
        if (!r.ok) throw new Error('PWA release unavailable');
        const value=await r.json();
        if(value.schemaVersion!==1 || !value.files) throw new Error('Invalid PWA release');
        return value;
      });
      const metadata=await release;
      const entry=metadata.files[url.pathname.slice(root.pathname.length)];
      if (!entry) throw new Error('Unversioned V2 file');
      // Content-addressed URLs reuse the HTTP cache across page navigations and
      // unrelated data releases. Every body is still checked against this page's pin.
      const versioned=new URL(url);versioned.search='?rb-v='+entry.hash;
      const key=versioned.href;
      if(!pending.has(key)) pending.set(key,(async()=>{
        for(const cache of ['force-cache','reload']) {
          const response=await nativeFetch(key,{...options,cache});
          if(response.ok && await digest(await response.clone().arrayBuffer())===entry.hash)return response;
        }
        throw new Error('V2 release mismatch or unavailable data');
      })().catch(error=>{pending.delete(key);throw error;}));
      return (await pending.get(key)).clone();
    } catch(error) { report('data-unavailable'); throw error; }
  }
  window.RangerbookPwaData={fetch:versionedFetch};
  window.fetch=versionedFetch;
})();
