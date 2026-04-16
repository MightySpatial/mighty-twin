/**
 * @mightyspatial/widget-sdk
 *
 * Third-party, sandboxed widget SDK for Mighty platform apps.
 * Widgets built with this SDK run in an iframe and communicate with the host
 * viewer via structured postMessage requests. This is the contract used when
 * a customer ships their own widget and it must be isolated from the host.
 *
 * For first-party, in-process widgets with direct Cesium access, use
 * @mightyspatial/widget-host instead.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WidgetContext {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'creator' | 'viewer';
  };
  site: {
    id: string;
    name: string;
    slug: string;
  };
  config: Record<string, unknown>;
  platform: 'web' | 'mobile';
}

export interface CameraPosition {
  longitude: number;
  latitude: number;
  height: number;
  heading?: number;
  pitch?: number;
  roll?: number;
}

export interface Layer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  opacity: number;
}

export interface Feature {
  id: string;
  layerId: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

export interface PickEvent {
  feature: Feature | null;
  layer: Layer | null;
  position: { longitude: number; latitude: number; height: number };
  screenPosition: { x: number; y: number };
}

export interface ToastOptions {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export interface ModalOptions {
  title: string;
  content: string | HTMLElement;
  buttons?: Array<{
    label: string;
    value: unknown;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
}

export interface PanelOptions {
  position: 'left' | 'right' | 'bottom';
  width?: number | string;
  height?: number | string;
  title?: string;
  content: HTMLElement | string;
}

// ─── Event Emitter ───────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  protected emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach(handler => handler(...args));
  }
}

// ─── Message Protocol ────────────────────────────────────────────────────────

interface WidgetMessage {
  type: string;
  id: string;
  payload?: unknown;
}

interface WidgetResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Widget Class ────────────────────────────────────────────────────────────

export class Widget extends EventEmitter {
  private messageId = 0;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  
  public context: WidgetContext | null = null;
  public platform: 'web' | 'mobile' = 'web';
  
  public viewer: ViewerAPI;
  public layers: LayersAPI;
  public features: FeaturesAPI;
  public ui: UIAPI;
  public storage: StorageAPI;
  public network: NetworkAPI;
  public api: MightyDTAPI;
  public device: DeviceAPI;
  public auth: AuthAPI;

  constructor() {
    super();
    
    // Initialize sub-APIs
    this.viewer = new ViewerAPI(this);
    this.layers = new LayersAPI(this);
    this.features = new FeaturesAPI(this);
    this.ui = new UIAPI(this);
    this.storage = new StorageAPI(this);
    this.network = new NetworkAPI(this);
    this.api = new MightyDTAPI(this);
    this.device = new DeviceAPI(this);
    this.auth = new AuthAPI(this);
    
    // Listen for messages from parent
    window.addEventListener('message', this.handleMessage.bind(this));
    
    // Request initialization
    this.send('widget:init', {});
  }

  private handleMessage(event: MessageEvent): void {
    const message = event.data as WidgetMessage | WidgetResponse;
    
    // Handle response to our request
    if ('success' in message && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      
      if (message.success) {
        pending.resolve(message.data);
      } else {
        pending.reject(new Error(message.error || 'Unknown error'));
      }
      return;
    }
    
    // Handle events from parent
    if ('type' in message) {
      switch (message.type) {
        case 'widget:ready':
          this.context = message.payload as WidgetContext;
          this.platform = this.context.platform;
          this.emit('ready', this.context);
          break;
        
        case 'viewer:cameraChanged':
          this.viewer['emit']('cameraChanged', message.payload);
          break;
        
        case 'viewer:pick':
          this.viewer['emit']('pick', message.payload);
          break;
        
        case 'feature:selected':
          this.emit('feature:selected', message.payload);
          break;
        
        case 'layer:added':
          this.emit('layer:added', message.payload);
          break;
        
        case 'layer:removed':
          this.emit('layer:removed', message.payload);
          break;
        
        case 'config:changed':
          if (this.context) {
            this.context.config = message.payload as Record<string, unknown>;
          }
          this.emit('config:changed', message.payload);
          break;
        
        case 'resize':
          this.emit('resize', message.payload);
          break;
        
        case 'destroy':
          this.emit('destroy');
          break;
      }
    }
  }

  send(type: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageId}`;
      
      this.pendingRequests.set(id, { resolve, reject });
      
      window.parent.postMessage({
        type,
        id,
        payload,
      }, '*');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
}

// ─── Sub-APIs ────────────────────────────────────────────────────────────────

class ViewerAPI extends EventEmitter {
  constructor(private widget: Widget) {
    super();
  }

  async flyTo(position: CameraPosition & { duration?: number }): Promise<void> {
    await this.widget.send('viewer:flyTo', position);
  }

  async getCamera(): Promise<CameraPosition> {
    return this.widget.send('viewer:getCamera', {}) as Promise<CameraPosition>;
  }

  async highlight(featureId: string, options?: { color?: string }): Promise<void> {
    await this.widget.send('viewer:highlight', { featureId, options });
  }

  async clearHighlight(): Promise<void> {
    await this.widget.send('viewer:clearHighlight', {});
  }

  async zoomToExtent(extent: [number, number, number, number]): Promise<void> {
    await this.widget.send('viewer:zoomToExtent', { extent });
  }
}

class LayersAPI extends EventEmitter {
  constructor(private widget: Widget) {
    super();
  }

  async list(): Promise<Layer[]> {
    return this.widget.send('layers:list', {}) as Promise<Layer[]>;
  }

  async setVisible(layerId: string, visible: boolean): Promise<void> {
    await this.widget.send('layers:setVisible', { layerId, visible });
  }

  async setOpacity(layerId: string, opacity: number): Promise<void> {
    await this.widget.send('layers:setOpacity', { layerId, opacity });
  }

  async setStyle(layerId: string, style: Record<string, unknown>): Promise<void> {
    await this.widget.send('layers:setStyle', { layerId, style });
  }

  async addTemporary(options: {
    name: string;
    type: 'geojson';
    data: GeoJSON.FeatureCollection;
  }): Promise<{ id: string }> {
    return this.widget.send('layers:addTemporary', options) as Promise<{ id: string }>;
  }

  async removeTemporary(layerId: string): Promise<void> {
    await this.widget.send('layers:removeTemporary', { layerId });
  }
}

class FeaturesAPI extends EventEmitter {
  constructor(private widget: Widget) {
    super();
  }

  async query(options: {
    layerId: string;
    bbox?: [number, number, number, number];
    where?: string;
    limit?: number;
  }): Promise<Feature[]> {
    return this.widget.send('features:query', options) as Promise<Feature[]>;
  }

  async get(layerId: string, featureId: string): Promise<Feature> {
    return this.widget.send('features:get', { layerId, featureId }) as Promise<Feature>;
  }

  async update(layerId: string, featureId: string, updates: {
    properties?: Record<string, unknown>;
    geometry?: GeoJSON.Geometry;
  }): Promise<Feature> {
    return this.widget.send('features:update', { layerId, featureId, updates }) as Promise<Feature>;
  }
}

class UIAPI {
  constructor(private widget: Widget) {}

  async toast(options: ToastOptions): Promise<void> {
    await this.widget.send('ui:toast', options);
  }

  async modal(options: ModalOptions): Promise<unknown> {
    return this.widget.send('ui:modal', options);
  }

  async openPanel(options: PanelOptions): Promise<void> {
    // Serialize content if HTMLElement
    const payload = {
      ...options,
      content: options.content instanceof HTMLElement
        ? options.content.outerHTML
        : options.content,
    };
    await this.widget.send('ui:openPanel', payload);
  }

  async closePanel(): Promise<void> {
    await this.widget.send('ui:closePanel', {});
  }

  async addToolbarButton(options: {
    id: string;
    icon: string;
    tooltip: string;
    onClick?: () => void;
  }): Promise<void> {
    // onClick is handled locally
    if (options.onClick) {
      this.widget.on(`toolbar:${options.id}:click`, options.onClick);
    }
    await this.widget.send('ui:addToolbarButton', {
      id: options.id,
      icon: options.icon,
      tooltip: options.tooltip,
    });
  }
}

class StorageAPI {
  public local: LocalStorage;
  public shared: SharedStorage;
  public offline: OfflineStorage;

  constructor(private widget: Widget) {
    this.local = new LocalStorage(widget);
    this.shared = new SharedStorage(widget);
    this.offline = new OfflineStorage(widget);
  }
}

class LocalStorage {
  constructor(private widget: Widget) {}

  async get(key: string): Promise<unknown> {
    return this.widget.send('storage:local:get', { key });
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.widget.send('storage:local:set', { key, value });
  }

  async delete(key: string): Promise<void> {
    await this.widget.send('storage:local:delete', { key });
  }
}

class SharedStorage {
  constructor(private widget: Widget) {}

  async get(key: string): Promise<unknown> {
    return this.widget.send('storage:shared:get', { key });
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.widget.send('storage:shared:set', { key, value });
  }
}

class OfflineStorage {
  constructor(private widget: Widget) {}

  async get(key: string): Promise<unknown> {
    return this.widget.send('storage:offline:get', { key });
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.widget.send('storage:offline:set', { key, value });
  }
}

class NetworkAPI {
  constructor(private widget: Widget) {}

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const result = await this.widget.send('network:fetch', { url, options }) as {
      status: number;
      headers: Record<string, string>;
      body: string;
    };
    
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }
}

class MightyDTAPI {
  constructor(private widget: Widget) {}

  async get(path: string): Promise<unknown> {
    return this.widget.send('api:get', { path });
  }

  async post(path: string, data: unknown): Promise<unknown> {
    return this.widget.send('api:post', { path, data });
  }

  async put(path: string, data: unknown): Promise<unknown> {
    return this.widget.send('api:put', { path, data });
  }

  async delete(path: string): Promise<unknown> {
    return this.widget.send('api:delete', { path });
  }
}

class DeviceAPI {
  public camera: CameraDevice;
  public location: LocationDevice;

  constructor(private widget: Widget) {
    this.camera = new CameraDevice(widget);
    this.location = new LocationDevice(widget);
  }
}

class CameraDevice {
  constructor(private widget: Widget) {}

  async capture(options?: { quality?: number }): Promise<{ dataUrl: string }> {
    return this.widget.send('device:camera:capture', options || {}) as Promise<{ dataUrl: string }>;
  }
}

class LocationDevice {
  constructor(private widget: Widget) {}

  async get(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
    return this.widget.send('device:location:get', {}) as Promise<{
      latitude: number;
      longitude: number;
      accuracy: number;
    }>;
  }
}

class AuthAPI {
  constructor(private widget: Widget) {}

  async getToken(): Promise<string> {
    return this.widget.send('auth:getToken', {}) as Promise<string>;
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const Mighty = {
  Widget,
}

export default Mighty
