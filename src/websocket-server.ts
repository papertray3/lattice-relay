import type LatticeRelayPlugin from './main';
import { SimpleWebSocketServer, SimpleWebSocket } from './simple-websocket';
import { logger } from './logger';

export interface MCPRequest {
	auth?: string;
	method: string;
	params: Record<string, any>;
	id?: string;
}

export interface MCPResponse {
	result?: any;
	error?: string;
	id?: string;
}

export class MCPWebSocketServer {
	private httpServer: any = null;
	private wsServer: SimpleWebSocketServer | null = null;
	private clients: Set<SimpleWebSocket> = new Set();
	private plugin: LatticeRelayPlugin;

	constructor(plugin: LatticeRelayPlugin) {
		this.plugin = plugin;
	}

	start(): void {
		if (this.httpServer) {
			logger.warn('WebSocket server already running');
			return;
		}

		const { host, port } = this.plugin.settings;

		try {
			// Create HTTP server using Node.js built-in
			const http = require('http');
			this.httpServer = http.createServer();

			// Create our simple WebSocket server
			this.wsServer = new SimpleWebSocketServer(this.httpServer);

			this.wsServer.onconnection = (ws: SimpleWebSocket, req: any) => {
				logger.debug('Client connected');
				this.clients.add(ws);

				this.handleConnection(ws);

				ws.onclose = () => {
					this.clients.delete(ws);
					logger.debug('Client disconnected');
				};
			};

			this.wsServer.onerror = (error: Error) => {
				logger.error('WebSocket server error:', error);
			};

			// Start HTTP server with better error handling
			this.httpServer.on('error', (err: any) => {
				logger.error('HTTP server error:', err);
				if (err.code === 'EADDRINUSE') {
					logger.error(`Port ${port} is already in use. Change port in settings.`);
				}
			});

			// Log immediately that we're trying to start
			logger.info(`Attempting to start server on ${host}:${port}...`);

			this.httpServer.listen(port, host, () => {
				logger.info(`✅ WebSocket server listening on ${host}:${port}`);
			});

		} catch (error) {
			logger.error('Failed to start WebSocket server:', error);
			logger.error('Error details:', error);
			throw error;
		}
	}

	stop(): void {
		// Close all client connections
		for (const client of this.clients) {
			client.close();
		}
		this.clients.clear();

		if (this.httpServer) {
			this.httpServer.close(() => {
				logger.info('WebSocket server stopped');
			});
			this.httpServer = null;
		}
	}

	isRunning(): boolean {
		return this.httpServer !== null;
	}

	private handleConnection(ws: SimpleWebSocket): void {
		ws.onmessage = async (msg) => {
			let request: MCPRequest | undefined;
			try {
				logger.debug('WebSocket message received');
				request = JSON.parse(msg.data) as MCPRequest;
				logger.debug(`Parsed request: ${request.method}`);

				// Authenticate
				if (this.plugin.settings.requireAuth) {
					if (!request.auth || request.auth !== this.plugin.settings.apiKey) {
						const response: MCPResponse = {
							error: 'Unauthorized: Invalid API key',
							id: request.id
						};
						ws.send(JSON.stringify(response));
						return;
					}
				}

				// Handle request
				logger.debug(`Calling handler for ${request.method}`);
				const result = await this.plugin.handleRequest(request);
				logger.debug(`Handler returned for ${request.method}`);
				const response: MCPResponse = {
					result,
					id: request.id
				};
				logger.debug(`Sending response for ${request.method}`);
				ws.send(JSON.stringify(response));
				logger.debug(`Response sent for ${request.method}`);

			} catch (error) {
				logger.error('Request handling error:', error);
				const response: MCPResponse = {
					error: error instanceof Error ? error.message : 'Unknown error',
					id: request?.id
				};
				ws.send(JSON.stringify(response));
			}
		};

		ws.onerror = (error: Error) => {
			logger.error('WebSocket connection error:', error);
		};
	}

	/**
	 * Broadcast a message to all connected clients
	 * Used for real-time event notifications (e.g., job status updates)
	 */
	broadcast(message: any): void {
		const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
		logger.debug(`Broadcasting to ${this.clients.size} clients:`, messageStr);

		for (const client of this.clients) {
			try {
				client.send(messageStr);
			} catch (error) {
				logger.error('Error broadcasting to client:', error);
			}
		}
	}
}
