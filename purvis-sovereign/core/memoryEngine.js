// /core/memoryEngine.js
// MEMORY ENGINE — in-memory store of every input/output pair processed by the pipeline.
// Swap this implementation later for Redis, MongoDB, or vector store without touching callers.

const log = [];

function record(entry) {
  const stamped = {
    id: log.length + 1,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  log.push(stamped);
  return stamped;
}

function recent(limit = 20) {
  return log.slice(-limit).reverse();
}

function size() {
  return log.length;
}

function clear() {
  log.length = 0;
}

module.exports = { record, recent, size, clear };
