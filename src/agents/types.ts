export interface BackupRecord {
  path: string;
  ts: number;
}

export interface AgentAdapter {
  readonly id: "claude" | "codex" | "kimi";
  readonly displayName: string;
  /** Path to the agent config file (e.g. ~/.claude/settings.json). */
  readonly configPath: string;
  detect(): Promise<boolean>;
  isInstalled(binaryPath: string): Promise<boolean>;
  install(opts: { binaryPath: string; backup?: BackupRecord }): Promise<BackupRecord>;
  remove(opts: { binaryPath: string }): Promise<void>;
  /** Restore from a backup file. Used by uninstall when full-recovery mode is on. */
  restoreFromBackup(backup: BackupRecord): Promise<void>;
}