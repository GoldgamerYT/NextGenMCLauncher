import { useUIStore } from '../stores/uiStore';
import { useProfileStore } from '../stores/profileStore';

interface GameLogMessage {
  type: 'log' | 'error' | 'status' | 'progress';
  profile?: string;
  message?: string;
  payload?: any;
}

export class GameWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 3000;
  private messageHandlers: Map<string, (data: GameLogMessage) => void> = new Map();

  constructor(url: string = 'ws://localhost:35555/api/ws') {
    this.url = url;
  }

  /**
   * Connect to WebSocket
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(messageData: string): void {
    try {
      const message: GameLogMessage = JSON.parse(messageData);
      const uiStore = useUIStore();
      const profileStore = useProfileStore();

      switch (message.type) {
        case 'log':
          uiStore.addGameLog(message.message || '');
          break;

        case 'error':
          uiStore.addGameLog(`[ERROR] ${message.message || ''}`);
          uiStore.addNotification({
            type: 'error',
            message: message.message || 'Game error occurred',
            duration: 5000,
          });
          break;

        case 'status':
          // Handle status updates (running, stopped, installing, etc.)
          if (message.profile && message.payload) {
            // Update profile status in store
            console.log(`Profile ${message.profile} status:`, message.payload);
          }
          break;

        case 'progress':
          // Handle progress updates
          if (message.payload?.progress !== undefined) {
            uiStore.setLaunchProgress(message.payload.progress);
          }
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }

      // Call registered handlers
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers(message);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Attempt to reconnect to WebSocket
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      const uiStore = useUIStore();
      uiStore.addNotification({
        type: 'error',
        message: 'Lost connection to game server. Please restart the launcher.',
        duration: 10000,
      });
    }
  }

  /**
   * Send message through WebSocket
   */
  public send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  /**
   * Register handler for specific message type
   */
  public on(type: string, handler: (data: GameLogMessage) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Disconnect WebSocket
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const gameWs = new GameWebSocketClient();
