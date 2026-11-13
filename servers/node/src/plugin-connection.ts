/** What tools and the server need from the plugin connection. ObsidianWebSocketClient implements it. */
export interface PluginCaller {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface PluginConnection extends PluginCaller {
  isConnected(): boolean;
  connect(): Promise<void>;
}
