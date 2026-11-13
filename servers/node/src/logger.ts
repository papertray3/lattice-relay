/**
 * Simple logging utility with file output
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  private level: LogLevel;
  private logFile: string;
  private logStream: fs.WriteStream | null = null;

  constructor(level: LogLevel = 'info') {
    this.level = level;
    // Write logs to a temp file that can be accessed
    this.logFile = path.join(os.tmpdir(), 'lattice-relay-server.log');
    
    try {
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.info(`[Logger] Initialized, logging to: ${this.logFile}`);
    } catch (error) {
      console.error('Failed to open log file:', error);
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private writeLog(levelName: string, message: string, args: unknown[]) {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + args.map(a => 
      typeof a === 'string' ? a : JSON.stringify(a).substring(0, 200)
    ).join(' ') : '';
    const logMessage = `[${timestamp}] [${levelName}] ${message}${argsStr}\n`;
    
    // Write to console (stderr to avoid stdout interference)
    console.error(logMessage.trim());
    
    // Write to file and flush immediately
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.write(logMessage);
    }
  }

  debug(message: string, ...args: unknown[]) {
    if (this.shouldLog('debug')) {
      this.writeLog('DEBUG', message, args);
    }
  }

  info(message: string, ...args: unknown[]) {
    if (this.shouldLog('info')) {
      this.writeLog('INFO', message, args);
    }
  }

  warn(message: string, ...args: unknown[]) {
    if (this.shouldLog('warn')) {
      this.writeLog('WARN', message, args);
    }
  }

  error(message: string, ...args: unknown[]) {
    if (this.shouldLog('error')) {
      this.writeLog('ERROR', message, args);
    }
  }
}

// Export singleton instance
export const logger = new Logger();
