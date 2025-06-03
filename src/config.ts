import { join } from 'path';
import { homedir } from 'os';
import { platform } from 'process';

// Use user's home directory for configuration files
export const USER_HOME = homedir();
// Use Claude Desktop's config directory on Linux
const CONFIG_DIR = platform === 'linux'
  ? join(USER_HOME, '.config', 'Claude')
  : join(USER_HOME, '.claude-server-commander');

// Paths relative to the config directory
export const CONFIG_FILE = join(CONFIG_DIR, 'claude_desktop_config.json');
export const TOOL_CALL_FILE = join(CONFIG_DIR, 'claude_tool_call.log');
export const TOOL_CALL_FILE_MAX_SIZE = 1024 * 1024 * 10; // 10 MB

// Shell configuration
export const SHELL = '/bin/bash';
export const SHELL_ARGS = ['-c'];

export const DEFAULT_COMMAND_TIMEOUT = 1000; // milliseconds
