/**
 * lt-max-spike.js
 * 單階段極限壓測：在固定速率與併發下大量送單
 */
import http from "http";
import querystring from "querystring";

const TARGET = process.env.TARGET || "http://localhost:3000/submit";
const LOC_IDS = (process.env.LOC_IDS || "1").split(",").map(s => s.trim());
const RATE_PER_MIN = parseInt(process.env.RATE_PER_MIN || "1200", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "120", 10);
const MINUTES = parseFloat(process.env.MINUTES || "1");

console.log("BOOT lt-max-spike", {
  TARGET, LOC_IDS, RATE_PER_MIN, CONCURRENCY, MINUTES
});

const INTERVAL_MS = 60000 / RATE_PER_MIN; // 平均發送間隔
let sent = 0, done = 0, ok = 0, fail = 0;
let latencies = [];

function now() { return Date.now(); }

function postOrder() {
  const start = now();
  const loc = LOC_IDS[Math.floor(Math.random() * LOC_IDS.length)];
  const postData = querystring.stringify({
    name: `LT_${Math.random().toString(36).slice(2, 8)}`,
    phone: "0912345678",
    email: "loadtest@example.com",
    small_count: 1,
    large_count: 0,
    invoice: "現場開立",
    agree: "on",
    location_id: loc
  });

  const req = http.request(TARGET, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData)
    }
  }, res => {
    res.resume();
    const latency = now() - start;
    latencies.push(latency);
    done++;
    if (res.statusCode >= 200 && res.statusCode < 400) ok++;
    else fail++;
  });

  req.on("error", () => { fail++; done++; });
  req.write(postData);
  req.end();
}

async function main() {
  console.log(`START spike, intervalMs=${INTERVAL_MS}`);
  const endAt = now() + MINUTES * 60000;
  const loop = setInterval(() => {
    if (sent >= RATE_PER_MIN * MINUTES) return clearInterval(loop);
    if (sent - done < CONCURRENCY) {
      postOrder();
      sent++;
    }
  }, INTERVAL_MS);

  const report = setInterval(() => {
    if (latencies.length) {
      const sorted = latencies.slice().sort((a,b)=>a-b);
      const p50 = sorted[Math.floor(sorted.length*0.5)];
      const p95 = sorted[Math.floor(sorted.length*0.95)];
      const p99 = sorted[Math.floor(sorted.length*0.99)];
      console.log(`[${new Date().toISOString()}] sent=${sent} done=${done} ok=${ok} fail=${fail} inflight=${sent-done} p50=${p50} p95=${p95} p99=${p99}`);
    } else {
      console.log(`[${new Date().toISOString()}] sent=${sent} done=${done} ok=${ok} fail=${fail}`);
    }
    if (now() > endAt && done >= sent) {
      clearInterval(loop); clearInterval(report);
      const sorted = latencies.slice().sort((a,b)=>a-b);
      const p50 = sorted[Math.floor(sorted.length*0.5)] || 0;
      const p95 = sorted[Math.floor(sorted.length*0.95)] || 0;
      const p99 = sorted[Math.floor(sorted.length*0.99)] || 0;
      console.log("\n=== FINAL ===");
      console.log(`target=${TARGET}`);
      console.log(`sent=${sent} done=${done} ok=${ok} fail=${fail}`);
      console.log(`latency: p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
      process.exit(0);
    }
  }, 10000);
}
