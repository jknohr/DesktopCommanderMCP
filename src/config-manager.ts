import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import yaml from 'yaml';
import { VERSION } from './version.js';
import { CONFIG_FILE } from './config.js';
import { CommandConfig } from './types/command-config';

export interface ServerConfig {
  commandConfig?: CommandConfig;
  defaultShell?: string;
  allowedDirectories?: string[];
  telemetryEnabled?: boolean;
  fileWriteLineLimit?: number;
  fileReadLineLimit?: number;
  version?: string;
  [key: string]: any;
}

/**
 * Singleton config manager for the server
 */
class ConfigManager {
  private configPath: string;
  private commandConfigPath: string;
  private config: ServerConfig = {};
  private initialized = false;

  constructor() {
    this.configPath = CONFIG_FILE;
    this.commandConfigPath = path.join(path.dirname(CONFIG_FILE), 'config', 'commands.yaml');
  }

  private async loadCommandConfig(): Promise<CommandConfig> {
    try {
      const configDir = path.dirname(this.commandConfigPath);
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
      }

      let commandConfig: CommandConfig;
      try {
        const yamlContent = await fs.readFile(this.commandConfigPath, 'utf8');
        commandConfig = yaml.parse(yamlContent);
      } catch (error) {
        console.warn('Command config not found, using empty configuration');
        commandConfig = {
          systemCommands: {
            allowSudo: false,
            allowNetworkConfig: false
          },
          surrealdb: { allowed: [] },
          docker: { allowed: [] },
          kubernetes: { allowed: [] },
          helm: { allowed: [] },
          localClusters: { allowed: [] },
          blocked: []
        };
        // Create default command config file
        await fs.writeFile(
          this.commandConfigPath,
          yaml.stringify(commandConfig),
          'utf8'
        );
      }
      return commandConfig;
    } catch (error) {
      console.error('Failed to load command config:', error);
      throw error;
    }
  }

  /**
   * Initialize configuration - load from disk or create default
   */
  async init() {
    if (this.initialized) return;

    try {
      // Load command configuration
      const commandConfig = await this.loadCommandConfig();

      // Ensure config directory exists
      const configDir = path.dirname(this.configPath);
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true });
      }

      // Check if config file exists
      try {
        await fs.access(this.configPath);
        // Load existing config
        const configData = await fs.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
      } catch (error) {
        // Config file doesn't exist, create default
        this.config = this.getDefaultConfig();
        await this.saveConfig();
      }

      // Update command configuration
      this.config.commandConfig = commandConfig;
      this.config.version = VERSION;

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize config:', error);
      this.config = this.getDefaultConfig();
      this.initialized = true;
    }
  }

  /**
   * Alias for init() to maintain backward compatibility
   */
  async loadConfig() {
    return this.init();
  }

  /**
   * Create default configuration
   */
  private getDefaultConfig(): ServerConfig {
    return {
      defaultShell: '/bin/bash',
      allowedDirectories: [],
      telemetryEnabled: true,
      fileWriteLineLimit: 50,
      fileReadLineLimit: 1000,
      version: VERSION
    };
  }

  /**
   * Save config to disk
   */
  private async saveConfig() {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Get the entire config
   */
  async getConfig(): Promise<ServerConfig> {
    await this.init();
    return { ...this.config };
  }

  /**
   * Get a specific configuration value
   */
  async getValue(key: string): Promise<any> {
    await this.init();
    return this.config[key];
  }

  /**
   * Set a specific configuration value
   */
  async setValue(key: string, value: any): Promise<void> {
    await this.init();
    
    // Special handling for telemetry opt-out
    if (key === 'telemetryEnabled' && value === false) {
      // Get the current value before changing it
      const currentValue = this.config[key];
      
      // Only capture the opt-out event if telemetry was previously enabled
      if (currentValue !== false) {
        // Import the capture function dynamically to avoid circular dependencies
        const { capture } = await import('./utils/capture.js');
        
        // Send a final telemetry event noting that the user has opted out
        // This helps us track opt-out rates while respecting the user's choice
        await capture('server_telemetry_opt_out', {
          reason: 'user_disabled',
          prev_value: currentValue
        });
      }
    }
    
    // Update the value
    this.config[key] = value;
    await this.saveConfig();
  }

  /**
   * Update multiple configuration values at once
   */
  async updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.init();
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    return { ...this.config };
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(): Promise<ServerConfig> {
    this.config = this.getDefaultConfig();
    await this.saveConfig();
    return { ...this.config };
  }
}

// Export singleton instance
export const configManager = new ConfigManager();