/**
 * WebSocket client for the Lattice Relay Obsidian plugin.
 */

import WebSocket from 'ws';
import { logger } from './logger.js';
import type { ServerConfig } from './config.js';
import type { PluginConnection } from './plugin-connection.js';

export interface PluginRequest {
  auth: string;
  method: string;
  params: Record<string, unknown>;
  id?: string;
}

export interface PluginResponse {
  result?: unknown;
  error?: string;
  id?: string;
}

export class ObsidianWebSocketClient implements PluginConnection {
  private ws: WebSocket | null = null;
  private config: ServerConfig;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private broadcastHandler?: (message: unknown) => void;

  constructor(config: ServerConfig, wsUrl: string) {
    this.config = config;
    this.wsUrl = wsUrl;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Connecting to Lattice Relay plugin at ${this.wsUrl}`);

      try {
        this.ws = new WebSocket(this.wsUrl, {
          // TODO: SSL context for remote connections (Phase 5+)
          // rejectUnauthorized: config.useSSL
        });

        this.ws.on('open', () => {
          logger.info('Connected to Lattice Relay plugin');
          this.reconnectAttempts = 0;
          resolve();
        });

        // Persistent message listener to handle both responses and broadcasts
        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());

            // Check if this is a response to our request
            if (message.id && this.pendingRequests.has(message.id)) {
              const { resolve: resolveRequest, reject: rejectRequest } = this.pendingRequests.get(message.id)!;
              this.pendingRequests.delete(message.id);

              if (message.error) {
                logger.error(`Plugin returned error:`, message.error);
                rejectRequest(new Error(message.error));
              } else {
                logger.debug(`Plugin response received`,
                  typeof message.result === 'string'
                    ? message.result.substring(0, 100) + '...'
                    : message.result
                );
                resolveRequest(message.result);
              }
            } else {
              // This is a broadcast notification from the vault
              logger.debug('Broadcast received:', message);
              if (this.broadcastHandler) {
                this.broadcastHandler(message);
              }
            }
          } catch (error) {
            logger.error('Failed to parse WebSocket message:', error);
          }
        });

        this.ws.on('error', (error) => {
          logger.error('WebSocket error:', error);
          reject(error);
        });

        this.ws.on('close', () => {
          logger.warn('WebSocket connection closed');
          this.ws = null;
        });

        this.ws.on('ping', () => {
          logger.debug('Received ping from plugin');
        });

      } catch (error) {
        logger.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async ensureConnection(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
    }

    this.reconnectAttempts++;
    logger.info(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    await this.connect();
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    await this.ensureConnection();

    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }

    // Generate unique request ID
    const requestId = `${method}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const request: PluginRequest = {
      auth: this.config.apiKey,
      method,
      params,
      id: requestId
    };

    logger.debug(`Calling plugin method: ${method}`, params);

    return new Promise((resolve, reject) => {
      // Track this request
      this.pendingRequests.set(requestId, { resolve, reject });

      // Set up timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000); // 30 second timeout

      // Override resolve/reject to clear timeout
      const wrappedResolve = (value: unknown) => {
        clearTimeout(timeout);
        resolve(value);
      };

      const wrappedReject = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };

      this.pendingRequests.set(requestId, { resolve: wrappedResolve, reject: wrappedReject });

      // Send request
      try {
        this.ws!.send(JSON.stringify(request));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  /**
   * Register a handler for broadcast notifications from the vault
   */
  onBroadcast(handler: (message: unknown) => void): void {
    this.broadcastHandler = handler;
  }

  async close(): Promise<void> {
    if (this.ws) {
      logger.info('Closing WebSocket connection');
      this.ws.close();
      this.ws = null;
    }
  }
}
