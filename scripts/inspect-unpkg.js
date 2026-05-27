const pkgUrl = 'https://unpkg.com/@ffmpeg/core@0.12.10/';
(async ()=>{
  try {
    const base = 'https://app.unpkg.com/@ffmpeg/core@0.12.10/files/dist/';
    for (const sub of ['umd/', 'esm/']) {
      const url = base + sub;
      console.log('Listing', url);
      const res = await fetch(url);
      const text = await res.text();
      const links = Array.from(text.matchAll(/href=\"([^\"]*files\/dist\/[^"]+)\"/g)).map(m=>m[1]);
      if (links.length === 0) {
        console.log(' no links found in', url);
      } else {
        console.log(' links:');
        for (const l of links.slice(0,200)) console.log('  ', l);
      }
    }
    if (links.length === 0) {
      console.log('no links found in dist listing');
      console.log(text.slice(0,2000));
    } else {
      console.log('found links:');
      for (const l of links.slice(0,50)) console.log(l);
    }
  } catch (e) {
    console.error('error', e.message || e);
    process.exitCode = 1;
  }
})();
