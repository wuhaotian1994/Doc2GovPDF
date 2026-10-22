// Static resources only; document text and local fonts never leave the worker.
class EngineResources {
  constructor(manifest) {
    this.manifest = manifest;
    this.pending = new Map();
    this.cacheName = 'gongwen-resources-v1-' + manifest.version;
  }
  async bytes(asset) {
    if (!this.pending.has(asset.url)) {
      // Deduplicate only in-flight reads. CacheStorage owns verified reusable
      // bytes; retaining fulfilled promises also retains every large buffer.
      const work = this.load(asset).finally(() => {
        if (this.pending.get(asset.url) === work) this.pending.delete(asset.url);
      });
      this.pending.set(asset.url, work);
    }
    return this.pending.get(asset.url);
  }
  async load(asset) {
    const url = new URL(asset.url, self.location.href).href;
    let cache;
    try { cache = await caches.open(this.cacheName); } catch { /* Online use remains available. */ }
    const cached = cache && await cache.match(url);
    if (cached) {
      const data = await cached.arrayBuffer();
      if (await this.valid(data, asset.sha256)) return data;
      await cache.delete(url);
    }
    const downloadFailure = () => Error('排版资源下载失败，填写内容未改变。请检查网络后点击“重新生成预览”。');
    let response;
    try { response = await fetch(url, {cache: 'no-store', integrity: asset.integrity}); }
    catch { throw downloadFailure(); }
    if (!response.ok) throw Error('排版资源下载失败，请联网后重试。');
    let data;
    try { data = await response.arrayBuffer(); }
    catch { throw downloadFailure(); }
    if (!await this.valid(data, asset.sha256)) throw Error('排版资源版本不一致，请关闭旧标签后重新打开。');
    if (cache) {
      try { await cache.put(url, new Response(data, {headers: {'Content-Type': asset.type}})); } catch { /* Cache quota cannot discard a usable download. */ }
    }
    return data;
  }
  async valid(data, expected) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return [...digest].map(value => value.toString(16).padStart(2, '0')).join('') === expected;
  }
  hasCoreCharacters(text) {
    const ranges = this.manifest.coreCoverage;
    for (const character of text) {
      if (/[\s\p{Cf}]/u.test(character)) continue;
      const code = character.codePointAt(0);
      let low = 0, high = ranges.length - 1, found = false;
      while (low <= high) {
        const middle = (low + high) >> 1, [start, end] = ranges[middle];
        if (code < start) high = middle - 1;
        else if (code > end) low = middle + 1;
        else { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }
  async prepare(model, complete) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = JSON.parse(self.documentEngine(JSON.stringify({method:'RequiredFallbackFonts', args:[model, complete]})));
      if (reply.error) throw Error(reply.error);
      const needs = reply.value || [];
      if (!needs.length) return;
      // Register one face at a time so decoded bytes and base64/JSON bridges
      // for two complete fonts do not overlap at their largest allocations.
      for (const need of needs) {
        const font = this.manifest.fonts.find(font => font.name === need.name);
        if (!font) throw Error('找不到所需备用字体资源。');
        const full = need.complete || !this.hasCoreCharacters(need.text);
        postMessage({resource: full ? 'full-font' : 'core-font'});
        const data = new Uint8Array(await this.bytes(full ? font.full : font.core));
        let binary = '';
        for (let offset = 0; offset < data.length; offset += 32768) binary += String.fromCharCode(...data.subarray(offset, offset + 32768));
        const loaded = JSON.parse(self.documentEngine(JSON.stringify({method:'RegisterFallbackFont', args:[font.name, btoa(binary), full]})));
        if (loaded.error) throw Error(loaded.error);
      }
    }
    const final = JSON.parse(self.documentEngine(JSON.stringify({method:'RequiredFallbackFonts', args:[model, complete]})));
    if (final.error || final.value?.length) throw Error(final.error || '所需字体尚未准备完成。');
  }
}
self.EngineResources = EngineResources;
