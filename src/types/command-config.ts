export interface CommandEntry {
  command: string;
  description: string;
  reason?: string;
}

export interface ToolCommands {
  allowed: CommandEntry[];
}

export interface SystemCommands {
  allowSudo: boolean;
  allowNetworkConfig: boolean;
}

export interface CommandConfig {
  systemCommands: SystemCommands;
  system: ToolCommands;      // Added system commands section
  surrealdb: ToolCommands;
  docker: ToolCommands;
  kubernetes: ToolCommands;
  helm: ToolCommands;
  localClusters: ToolCommands;
  blocked: CommandEntry[];
}
