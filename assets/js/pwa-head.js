/* Shared metadata on every HTML entry, including Pages' deep-route 404 shell. */
(() => {
  const root = new URL('../../', document.currentScript.src);
  function link(rel,path) {
    const node=document.createElement('link');node.rel=rel;node.href=new URL(path,root);document.head.append(node);
  }
  link('manifest','manifest.webmanifest');
  link('apple-touch-icon','assets/pwa/apple-touch-icon.png');
  link('stylesheet','assets/css/pwa.css');
  for(const [name,content] of [['theme-color','#078d81'],['mobile-web-app-capable','yes'],
    ['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-title','Rangerbook'],['apple-mobile-web-app-status-bar-style','default']]) {
    const node=document.createElement('meta');node.name=name;node.content=content;document.head.append(node);
  }
  // Parser-blocking: establish the native versioned fetch before the V2 adapter.
  document.write('<script src="'+new URL('assets/js/pwa-data.js',root)+'"><\/script>');
  const script=document.createElement('script');script.src=new URL('assets/js/pwa.js',root);script.defer=true;
  document.head.append(script);
})();
