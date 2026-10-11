import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  busyShare,
  cgroupCpuMax,
  isBrowserProcess,
  kbField,
  mergePeak,
  parseCpuTimes,
  parseStat,
} from "../../../scripts/bench/proc";

describe("/proc parsing", () => {
  it("reads the parent and CPU times after a command name with spaces", () => {
    const stat =
      "4242 (chrome (renderer) x) S 4200 4200 1 0 -1 4194560 100 0 0 0 250 50 7 3 20 0 12 0 99 0 0";
    expect(parseStat(stat)).toEqual({
      ppid: 4200,
      utime: 250,
      stime: 50,
      cutime: 7,
      cstime: 3,
    });
  });

  it("reads kB fields", () => {
    const status = "Name:\tchrome\nVmPeak:\t  900 kB\nVmRSS:\t   123456 kB\n";
    expect(kbField(status, "VmRSS")).toBe(123456);
    expect(kbField("Rss:  10 kB\nPss:  7 kB\n", "Pss")).toBe(7);
    expect(kbField(status, "Pss")).toBeNull();
  });

  it("measures the busy share of all CPUs", () => {
    const a = parseCpuTimes("cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 1 2 3 4\n");
    expect(a).toEqual({ busy: 150, total: 1000 });
    const b = parseCpuTimes("cpu  200 0 100 1100 100 0 0 0 0 0\n");
    expect(busyShare(a, b)).toBeCloseTo(150 / 500, 10);
    expect(busyShare(a, a)).toBe(0);
  });

  it("knows Chromium's processes", () => {
    expect(isBrowserProcess("chrome")).toBe(true);
    expect(isBrowserProcess("chrome_crashpad")).toBe(true);
    expect(isBrowserProcess("headless_shell")).toBe(true);
    expect(isBrowserProcess("esbuild")).toBe(false);
    expect(isBrowserProcess("node")).toBe(false);
  });

  it("keeps the peak of each figure and survives a missing PSS", () => {
    let p = mergePeak(null, {
      nodeRssMb: 100,
      browserRssMb: 500,
      totalRssMb: 600,
      totalPssMb: 400,
      processes: 8,
    });
    p = mergePeak(p, {
      nodeRssMb: 150,
      browserRssMb: 300,
      totalRssMb: 450,
      totalPssMb: null,
      processes: 10,
    });
    expect(p).toEqual({
      nodeRssMb: 150,
      browserRssMb: 500,
      totalRssMb: 600,
      totalPssMb: 400,
      processes: 10,
      samples: 2,
    });
  });

  it("reads the cgroup CPU limit on v2 and v1", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wa-cgroup-"));
    try {
      const write = (file: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
      };
      expect(cgroupCpuMax(root)).toBeNull();
      // v1, no limit.
      write("cpu/cpu.cfs_quota_us", "-1\n");
      write("cpu/cpu.cfs_period_us", "100000\n");
      expect(cgroupCpuMax(root)).toBe("max 100000");
      // v1, two CPUs.
      write("cpu/cpu.cfs_quota_us", "200000\n");
      expect(cgroupCpuMax(root)).toBe("200000 100000");
      // v2 wins when both are there.
      write("cpu.max", "150000 100000\n");
      expect(cgroupCpuMax(root)).toBe("150000 100000");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
