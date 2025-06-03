import { spawn } from 'bun';
import { TerminalSession, CommandExecutionResult, ActiveSession } from './types.js';
import { DEFAULT_COMMAND_TIMEOUT, SHELL, SHELL_ARGS } from './config.js';
import { configManager } from './config-manager.js';
import {capture} from "./utils/capture.js";

interface CompletedSession {
    pid: number;
    output: string;
    exitCode: number | null;
    startTime: Date;
    endTime: Date;
}

export class TerminalManager {
  private sessions: Map<number, TerminalSession> = new Map();
  private completedSessions: Map<number, CompletedSession> = new Map();
  private nextPid: number = 1;
  
  private getNextPid(): number {
    const pid = this.nextPid;
    this.nextPid = (this.nextPid + 1) >>> 0; // Wrap around at 2^32
    return pid;
  }

  async executeCommand(command: string, timeoutMs: number = DEFAULT_COMMAND_TIMEOUT, shell?: string): Promise<CommandExecutionResult> {
    // Get the shell from config if not specified
    let shellToUse: string = shell || SHELL;
    let shellArgs: string[] = SHELL_ARGS;
    
    try {
      const config = await configManager.getConfig();
      if (!shell && config.defaultShell) {
        shellToUse = config.defaultShell;
      }
    } catch (error) {
      console.error('Failed to get shell from config, using default:', error);
    }

    const proc = spawn([shellToUse, ...shellArgs, command], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, TERM: 'xterm-256color' } // Ensure proper terminal type for Linux
    });

    const pid = this.getNextPid();
    let output = '';

    const session: TerminalSession = {
      pid,
      process: proc,
      lastOutput: '',
      isBlocked: false,
      startTime: new Date()
    };
    
    this.sessions.set(pid, session);

    // Set up signal handlers for Linux process management
    const cleanup = () => {
      try {
        if (!proc.killed) {
          // Send SIGTERM first for graceful shutdown
          proc.kill('SIGTERM');
          
          // After 2 seconds, force kill if still running
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 2000);
        }
      } catch (error) {
        capture('server_request_error', { error: `Failed to cleanup process ${pid}: ${error}` });
      }
    };

    // Handle process exit
    process.on('exit', cleanup);
    
    try {
      // Capture output using Bun's native stream reading
      let stdoutText = '';
      let stderrText = '';

      // Read stdout
      if (proc.stdout) {
        const reader = proc.stdout.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          stdoutText += chunk;
          session.lastOutput = chunk;
        }
      }

      // Read stderr
      if (proc.stderr) {
        const reader = proc.stderr.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          stderrText += chunk;
          session.lastOutput = chunk;
        }
      }

      // Wait for process completion with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          cleanup();
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Wait for process exit
      const exitPromise = proc.exited;
      
      try {
        const exitCode = await Promise.race([exitPromise, timeoutPromise]);
        
        this.completedSessions.set(pid, {
          pid,
          output: session.lastOutput,
          exitCode: typeof exitCode === 'number' ? exitCode : null,
          startTime: session.startTime,
          endTime: new Date()
        });
        this.sessions.delete(pid);

        const result: CommandExecutionResult = {
          pid,
          output: stdoutText + stderrText,
          startTime: session.startTime,
          endTime: new Date()
        };

        // Clean up exit handler
        process.off('exit', cleanup);

        return result;
      } catch (error) {
        cleanup();
        throw error;
      }
    } catch (error) {
      capture('server_request_error', { error: `Command execution failed: ${error}` });
      throw error;
    }
  }

  private handleProcessCompletion(pid: number, session: TerminalSession, output: string, exitCode: number | null) {
    // Store completed session
    this.completedSessions.set(pid, {
      pid,
      output: session.lastOutput || output,
      exitCode,
      startTime: session.startTime,
      endTime: new Date()
    });
    
    // Keep only last 100 completed sessions
    if (this.completedSessions.size > 100) {
      const oldestKey = Array.from(this.completedSessions.keys())[0];
      this.completedSessions.delete(oldestKey);
    }
    
    this.cleanup(pid);
  }

  private cleanup(pid: number) {
    const session = this.sessions.get(pid);
    if (session) {
      try {
        session.process.kill('SIGTERM');
      } catch (error) {
        capture('server_request_error', { 
          error: error instanceof Error ? error.message : String(error),
          message: `Error cleaning up process ${pid}`
        });
      }
      this.sessions.delete(pid);
    }
  }

  getNewOutput(pid: number): string | null {
    // First check active sessions
    const session = this.sessions.get(pid);
    if (session) {
      const output = session.lastOutput;
      session.lastOutput = '';
      return output;
    }

    // Then check completed sessions
    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      // Format completion message with exit code and runtime
      const runtime = (completedSession.endTime.getTime() - completedSession.startTime.getTime()) / 1000;
      return `Process completed with exit code ${completedSession.exitCode}\nRuntime: ${runtime}s\nFinal output:\n${completedSession.output}`;
    }

    return null;
  }

  getSession(pid: number): TerminalSession | undefined {
    return this.sessions.get(pid);
  }

  forceTerminate(pid: number): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }

    try {
      session.process.kill();
      this.sessions.delete(pid);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      capture('server_request_error', {error: errorMessage, message: `Failed to terminate process ${pid}`});
      return false;
    }
  }

  listActiveSessions(): ActiveSession[] {
    const now = new Date();
    return Array.from(this.sessions.values()).map(session => ({
      pid: session.pid,
      isBlocked: session.isBlocked,
      runtime: now.getTime() - session.startTime.getTime()
    }));
  }

  listCompletedSessions(): CompletedSession[] {
    return Array.from(this.completedSessions.values());
  }
}

export const terminalManager = new TerminalManager();