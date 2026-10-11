// Memory and CPU readings from /proc for the scan benchmark (T-033). Linux
// only; every reader returns null elsewhere instead of throwing.
//
// Only the benchmark's own processes count: the Node process and the
// Chromium processes under it. Other children (tsx's esbuild helper) and the
// rest of the machine are left out, since other jobs may share it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export interface ProcStat {
  ppid: number;
  // Clock ticks: user and system time of the process, and of its children
  // that have exited and been waited for.
  utime: number;
  stime: number;
  cutime: number;
  cstime: number;
}

// Fields of /proc/<pid>/stat. The command name sits in brackets and may hold
// spaces, so read the fields after the last ")".
export function parseStat(stat: string): ProcStat {
  const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return {
    ppid: Number(f[1]),
    utime: Number(f[11]),
    stime: Number(f[12]),
    cutime: Number(f[13]),
    cstime: Number(f[14]),
  };
}

// A "Name:   1234 kB" field from /proc/<pid>/status or smaps_rollup.
export function kbField(text: string, field: string): number | null {
  const m = new RegExp(`^${field}:\\s+(\\d+) kB$`, "m").exec(text);
  return m ? Number(m[1]) : null;
}

export interface CpuTimes {
  // Clock ticks summed over all CPUs.
  busy: number;
  total: number;
}

// The first "cpu" line of /proc/stat: user nice system idle iowait irq
// softirq steal (guest time is already inside user and nice).
export function parseCpuTimes(procStat: string): CpuTimes {
  const line = procStat.split("\n").find((l) => /^cpu\s/.test(l)) ?? "";
  const [user, nice, system, idle, iowait, irq, softirq, steal] = line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map(Number);
  const busy =
    user + nice + system + (irq || 0) + (softirq || 0) + (steal || 0);
  return { busy, total: busy + idle + (iowait || 0) };
}

// Share of all CPUs that was busy between two readings, from 0 to 1.
export function busyShare(a: CpuTimes, b: CpuTimes): number {
  const total = b.total - a.total;
  return total > 0 ? (b.busy - a.busy) / total : 0;
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function readCpuTimes(): CpuTimes | null {
  const text = read("/proc/stat");
  return text ? parseCpuTimes(text) : null;
}

let clockTicks: number | null = null;

// USER_HZ, the unit of the times in /proc/<pid>/stat. 100 on common kernels.
export function ticksPerSecond(): number {
  if (clockTicks === null) {
    try {
      clockTicks =
        Number(
          execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim(),
        ) || 100;
    } catch {
      clockTicks = 100;
    }
  }
  return clockTicks;
}

// Chromium's processes: the browser, zygotes, renderers, GPU and utility
// processes, and crashpad. Covers the headless shell build too.
export function isBrowserProcess(comm: string): boolean {
  return /^(chrome|chromium|headless_shell|chrome_crashpad)/i.test(comm.trim());
}

interface Proc {
  pid: number;
  comm: string;
  stat: ProcStat;
}

// The Node process and the browser processes below it.
export function benchProcesses(root = process.pid): Proc[] {
  let entries: string[];
  try {
    entries = fs.readdirSync("/proc").filter((e) => /^\d+$/.test(e));
  } catch {
    return [];
  }
  const all = new Map<number, Proc>();
  const children = new Map<number, number[]>();
  for (const e of entries) {
    const text = read(`/proc/${e}/stat`);
    if (!text) continue;
    const pid = Number(e);
    const stat = parseStat(text);
    all.set(pid, {
      pid,
      comm: text.slice(text.indexOf("(") + 1, text.lastIndexOf(")")),
      stat,
    });
    if (!children.has(stat.ppid)) children.set(stat.ppid, []);
    children.get(stat.ppid)!.push(pid);
  }
  const rootProc = all.get(root);
  if (!rootProc) return [];
  const out = [rootProc];
  const queue = [...(children.get(root) ?? [])];
  while (queue.length) {
    const p = all.get(queue.shift()!);
    if (!p) continue;
    if (isBrowserProcess(p.comm)) out.push(p);
    queue.push(...(children.get(p.pid) ?? []));
  }
  return out;
}

// CPU-seconds used so far by the Node process and the browser processes,
// including browser processes that already exited (their parent's cutime).
// Take the difference of two readings.
export function benchCpuSeconds(root = process.pid): number | null {
  const procs = benchProcesses(root);
  if (!procs.length) return null;
  const ticks = procs.reduce((n, p) => {
    // The root's cutime holds every child it reaped, browsers from earlier
    // runs included; differences of two readings cancel those out.
    return n + p.stat.utime + p.stat.stime + p.stat.cutime + p.stat.cstime;
  }, 0);
  return ticks / ticksPerSecond();
}

export interface MemorySample {
  nodeRssMb: number;
  browserRssMb: number;
  totalRssMb: number;
  // Proportional set size: pages shared between processes are split between
  // them, so shared libraries are not counted many times over.
  totalPssMb: number | null;
  processes: number;
}

// One reading of the Node process and its browser processes. A process that
// exits while it is read is skipped.
export function sampleMemory(root = process.pid): MemorySample | null {
  const procs = benchProcesses(root);
  if (!procs.length) return null;
  let nodeKb = 0;
  let browserKb = 0;
  let pssKb: number | null = null;
  let counted = 0;
  for (const p of procs) {
    const rss = kbField(read(`/proc/${p.pid}/status`) ?? "", "VmRSS");
    if (rss === null) continue;
    counted++;
    if (p.pid === root) nodeKb = rss;
    else browserKb += rss;
    const pss = kbField(read(`/proc/${p.pid}/smaps_rollup`) ?? "", "Pss");
    if (pss !== null) pssKb = (pssKb ?? 0) + pss;
  }
  const mb = (kb: number) => kb / 1024;
  return {
    nodeRssMb: mb(nodeKb),
    browserRssMb: mb(browserKb),
    totalRssMb: mb(nodeKb + browserKb),
    totalPssMb: pssKb === null ? null : mb(pssKb),
    processes: counted,
  };
}

export interface MemoryPeak {
  nodeRssMb: number;
  browserRssMb: number;
  totalRssMb: number;
  totalPssMb: number | null;
  processes: number;
  samples: number;
}

export function mergePeak(
  peak: MemoryPeak | null,
  s: MemorySample,
): MemoryPeak {
  return {
    nodeRssMb: Math.max(peak?.nodeRssMb ?? 0, s.nodeRssMb),
    browserRssMb: Math.max(peak?.browserRssMb ?? 0, s.browserRssMb),
    totalRssMb: Math.max(peak?.totalRssMb ?? 0, s.totalRssMb),
    totalPssMb:
      s.totalPssMb === null
        ? (peak?.totalPssMb ?? null)
        : Math.max(peak?.totalPssMb ?? 0, s.totalPssMb),
    processes: Math.max(peak?.processes ?? 0, s.processes),
    samples: (peak?.samples ?? 0) + 1,
  };
}

// Takes a reading every `intervalMs` and keeps the peak of each figure. A
// reading costs about 10 ms of CPU, and a peak shorter than the interval can
// be missed.
export function startMemorySampler(
  intervalMs = 1000,
  root = process.pid,
): { stop(): MemoryPeak | null } {
  let peak: MemoryPeak | null = null;
  const tick = () => {
    const s = sampleMemory(root);
    if (s) peak = mergePeak(peak, s);
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    stop() {
      clearInterval(timer);
      tick();
      return peak;
    },
  };
}

// The cgroup CPU limit as cgroup v2 writes it: "<quota> <period>" in
// microseconds, or "max <period>" for no limit. On cgroup v1 the quota and
// period files are read and put in the same form (a quota of -1 is no
// limit). Null when neither is there.
export function cgroupCpuMax(root = "/sys/fs/cgroup"): string | null {
  const v2 = read(`${root}/cpu.max`)?.trim();
  if (v2) return v2;
  for (const dir of ["cpu", "cpu,cpuacct", "cpuacct,cpu"]) {
    const quota = read(`${root}/${dir}/cpu.cfs_quota_us`)?.trim();
    const period = read(`${root}/${dir}/cpu.cfs_period_us`)?.trim();
    if (!quota || !period) continue;
    return `${Number(quota) < 0 ? "max" : quota} ${period}`;
  }
  return null;
}

// 1, 5 and 15 minute load averages, as a sign of other work on the machine.
export function loadAverage(): number[] | null {
  const text = read("/proc/loadavg");
  return text ? text.split(" ").slice(0, 3).map(Number) : null;
}
