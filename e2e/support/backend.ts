import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

import { expect } from '@playwright/test';

import { backendArguments, backendEnvironment } from './environment';

// Starts an extra API process on the run's database. Playwright's webServer
// owns the main API; this is for tests that need a second, fresh process.

export interface RunningBackend {
  url: string;
  stop(): Promise<void>;
}

export async function startBackend(port: number): Promise<RunningBackend> {
  const url = `http://localhost:${port}`;
  const child = spawn('dotnet', backendArguments({ build: false }), {
    env: { ...process.env, ...backendEnvironment(port) },
    stdio: 'ignore',
    // On Linux and macOS, its own process group lets stop() end `dotnet run`
    // and the API process it starts together.
    detached: process.platform !== 'win32',
  });

  const backend: RunningBackend = {
    url,
    async stop() {
      killProcessTree(child);
      await expect.poll(() => isHealthy(url), { message: `${url} did not stop`, timeout: 15_000 }).toBe(false);
    },
  };

  try {
    await expect
      .poll(() => isHealthy(url), { message: `${url}/health did not answer`, timeout: 60_000 })
      .toBe(true);
  } catch (error) {
    killProcessTree(child);
    throw error;
  }
  return backend;
}

async function isHealthy(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/health`)).ok;
  } catch {
    return false;
  }
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
}
