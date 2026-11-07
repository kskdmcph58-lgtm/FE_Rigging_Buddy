/* Search thread. Stays alive between searches so later searches skip thread start-up. */
const engine = import(`./seed-engine.js${self.location.search}`);
let scanner = null;
let generation = -1;

self.onmessage = ({ data: message }) => engine.then(({ Scanner }) => {
  if (message.type === 'configure') {
    generation = message.generation;
    scanner = new Scanner(message.events, message.compiled, message.module);
    self.postMessage({ type: 'ready', generation });
    return;
  }
  if (message.type === 'scan') {
    if (message.generation !== generation) return;
    const started = performance.now();
    scanner.scan(message.begin, message.size);
    const { hits, prefix } = scanner.take();
    self.postMessage({ type: 'done', generation, size: message.size, hits, prefix, ms: performance.now() - started });
  }
}).catch(error => {
  self.postMessage({ type: 'error', generation: message.generation, message: error?.message ?? String(error) });
});
