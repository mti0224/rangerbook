/* Pin and verify a page's V2 release even on its first, uncontrolled visit. */
(() => {
  'use strict';
  const root = new URL('../../', document.currentScript.src);
  const nativeFetch = window.fetch.bind(window);
  let release;
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  function report(kind) { window.dispatchEvent(new CustomEvent('rangerbook:pwa-status',{detail:{kind}})); }
  async function versionedFetch(input, options) {
    const url = new URL(typeof input==='string' || input instanceof URL ? input : input.url, location.href);
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
      const response=await nativeFetch(input,{...options,cache:'no-store'});
      if(!response.ok || await digest(await response.clone().arrayBuffer())!==entry.hash) {
        report('data-unavailable');
        throw new Error('V2 release mismatch or unavailable data');
      }
      return response;
    } catch(error) { report('data-unavailable'); throw error; }
  }
  window.RangerbookPwaData={fetch:versionedFetch};
  window.fetch=versionedFetch;
})();
