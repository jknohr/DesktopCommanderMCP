import { spawn } from 'bun';
import { ProcessInfo, ServerResult } from '../types.js';
import { KillProcessArgsSchema } from './schemas.js';

// Verify process exists
async function checkProcessExists(pid: number): Promise<boolean> {
  try {
    const proc = spawn(['ps', '-p', pid.toString()], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function listProcesses(): Promise<ServerResult> {
  try {
    // -w for unlimited width to prevent command truncation
    const proc = spawn(['ps', 'auxww'], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (proc.exitCode !== 0) {
      return {
        content: [{ type: "text", text: `Error listing processes: ${stderr}` }],
        isError: true
      };
    }

    // Parse Linux ps aux format
    const processes = stdout.split('\n')
      .slice(1) // Skip header
      .filter(Boolean)
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return {
          pid: parseInt(parts[1]),
          command: parts.slice(10).join(' '), // Command is everything after 10th column
          cpu: parts[2], // CPU% is in 3rd column
          memory: parts[3], // Memory% is in 4th column
        };
      });

    return {
      content: [{
        type: "text",
        text: processes.map(p =>
          `PID: ${p.pid}, Command: ${p.command}, CPU: ${p.cpu}%, Memory: ${p.memory}%`
        ).join('\n')
      }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: Failed to list processes: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}

export async function killProcess(args: unknown): Promise<ServerResult> {
  const parsed = KillProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: "text", text: `Error: Invalid arguments for kill_process: ${parsed.error}` }],
      isError: true
    };
  }

  const pid = parsed.data.pid;

  try {
    // First verify the process exists
    if (!await checkProcessExists(pid)) {
      return {
        content: [{ type: "text", text: `Process ${pid} does not exist` }],
        isError: true
      };
    }

    // Try SIGTERM first (graceful shutdown)
    const proc = spawn(['kill', pid.toString()], {
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const stderr = await new Response(proc.stderr).text();

    if (proc.exitCode !== 0) {
      // If SIGTERM fails, try SIGKILL
      const forceProc = spawn(['kill', '-9', pid.toString()], {
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      const forceStderr = await new Response(forceProc.stderr).text();
      
      if (forceProc.exitCode !== 0) {
        return {
          content: [{ type: "text", text: `Error: Failed to force kill process: ${forceStderr}` }],
          isError: true
        };
      }
    }

    // Verify process was actually killed
    if (await checkProcessExists(pid)) {
      return {
        content: [{ type: "text", text: `Failed to kill process ${pid} - process still exists after SIGKILL` }],
        isError: true
      };
    }

    return {
      content: [{ type: "text", text: `Successfully terminated process ${pid}` }]
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: Failed to kill process: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
}
