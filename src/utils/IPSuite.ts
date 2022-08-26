import TcpSocket from 'react-native-tcp-socket';
import UdpSockets from 'react-native-udp';

import EventEmitter from 'eventemitter3';
import {Buffer} from 'buffer';

import LZString from 'lz-string';

const CONNECTED = 'CONNECTED';

const createServer = (protocol: Protocol, callback?: () => void) => {
  return new Server(protocol, callback);
};

const createClient = (
  protocol: Protocol,
  serverAddress: Address,
  callback?: () => void,
) => {
  return new Client(protocol, serverAddress, callback);
};

class Server extends EventEmitter<ServerEvents> {
  private _self!: TcpSocket.Server | typeof UdpSockets.Socket.prototype;
  private _client: TcpSocket.Socket | null = null;
  private _clientAddress: Address = {
    address: '',
    port: 0,
  };

  private _connected: boolean = false;
  public delimiter: string | undefined;
  public compressed: boolean = false;

  constructor(protocol: Protocol, callback?: () => void) {
    super();

    if (protocol === Protocol.TCP) {
      this._self = new TcpSocket.Server(socket => {
        this._client = socket;
        this.emit('connected');

        socket.on('data', data => {
          let dataString = data.toString();
          let dataBuffer: Array<string> = [];
          if (this.delimiter) {
            dataBuffer = dataString.split(this.delimiter);
          } else {
            dataBuffer.push(dataString);
          }
          dataBuffer.forEach(chunk => {
            if (this.compressed) {
              chunk = LZString.decompressFromUTF16(chunk);
            }
            this.emit('message', chunk);
          });
        });
      });
    } else if (protocol === Protocol.UDP) {
      this._self = UdpSockets.createSocket({
        type: 'udp4',
        debug: true,
        reusePort: true,
      }).on('message', (data: Buffer, rinfo) => {
        this._clientAddress = rinfo;
        let dataString = data.toString();
        if (dataString === CONNECTED) {
          this.emit('connected');
          return;
        }

        if (this.compressed) {
          dataString = LZString.decompressFromUTF16(dataString);
        }
        this.emit('message', dataString);
      });
    }

    this.once('connected', () => {
      console.log(
        'Connected to',
        this._client?.address() ?? this._clientAddress,
      );
      callback?.();
    }).on('connected', () => (this._connected = true));

    this._self.once('listening', () => this.emit('listening'));
    this._self.on('close', () => {
      this._connected = false;
      this.emit('close');
    });
    this._self.on('error', error => {
      this._connected = false;
      this.emit('error', error);
    });
  }

  public get connected(): boolean {
    return this._connected;
  }

  public get clientAddress(): Address {
    const {remotePort = 0, remoteAddress = ''} = this._client ?? {};
    return this._clientAddress ?? {port: remotePort, address: remoteAddress};
  }

  address(): Address | null {
    return this._self.address();
  }

  public listen(options: Address, callback?: () => void): void {
    if (this._self instanceof TcpSocket.Server) {
      this._self.listen({
        port: options.port,
        host: options.address ?? '0.0.0.0',
        reuseAddress: true,
      });
    } else if (this._self instanceof UdpSockets.Socket) {
      this._self.bind(options);
    }
    this.once('listening', () => callback?.());
  }

  public send(
    data: string | Uint8Array | Buffer,
    callback?: (error: Error | undefined) => void,
  ): void {
    if (this.compressed) {
      data = LZString.compressToUTF16(data.toString());
    }
    if (this._self instanceof TcpSocket.Server) {
      if (this.delimiter) {
        data = data.toString().concat(this.delimiter ?? '');
      }
      this._client?.write(data, undefined, callback);
    } else if (this._self instanceof UdpSockets.Socket) {
      const {address, port} = this._clientAddress;
      this._self.send(data, undefined, undefined, port, address, callback);
    }
  }

  public close(): void {
    this._connected = false;
    this._self.close();
    // this._self.removeAllListeners();
  }
}

class Client extends EventEmitter<ClientEvents> {
  private _self!: TcpSocket.Socket | typeof UdpSockets.Socket.prototype;
  private _serverAddress!: Address;

  private _destroyed: boolean = false;
  private _connected: boolean = false;
  private _reconnectTimeout: any;

  public delimiter: string | undefined;
  public compressed: boolean = false;

  constructor(
    protocol: Protocol,
    serverAddress: Address,
    callback?: () => void,
  ) {
    super();

    if (protocol === Protocol.TCP) {
      this._self = new TcpSocket.Socket().on('data', data => {
        let dataString = data.toString();
        let dataBuffer: Array<string> = [];
        if (this.delimiter) {
          dataBuffer = dataString.split(this.delimiter);
        } else {
          dataBuffer.push(dataString);
        }
        dataBuffer.forEach(chunk => {
          if (this.compressed) {
            chunk = LZString.decompressFromUTF16(chunk);
          }
          this.emit('message', chunk);
        });
      });
    } else if (protocol === Protocol.UDP) {
      this._self = UdpSockets.createSocket({
        type: 'udp4',
        debug: true,
        reusePort: true,
      }).on('message', (data: Buffer) => {
        let dataString = data.toString();
        if (this.compressed) {
          dataString = LZString.decompressFromUTF16(dataString);
        }
        this.emit('message', dataString);
      });
    }
    this.connect(serverAddress, callback).on(
      'connected',
      () => (this._connected = true),
    );

    this._self.on('close', () => {
      this._connected = false;
      this._destroyed = true;
      this.emit('close');
    });
    this._self.on('error', (error: Error) => {
      this._connected = false;
      this._destroyed = true;
      this.emit('error', error);
    });
  }

  public get remoteAddress(): string {
    return this._self instanceof TcpSocket.Socket
      ? this._self.remoteAddress || ''
      : this._serverAddress.address;
  }

  public get connected(): boolean {
    return this._connected;
  }

  public get destroyed(): boolean {
    return this._destroyed;
  }

  address(): Partial<Address> {
    return this._self.address();
  }

  connect(serverAddress: Address, callback?: () => void): Client {
    if (this._connected) {
      throw new Error('Client already connected');
    }
    console.log('client:', serverAddress);
    const {port, address} = serverAddress;
    if (this._self instanceof TcpSocket.Socket) {
      this._self.connect(
        {
          port,
          host: address,
          reuseAddress: true,
        },
        () => {
          this._serverAddress = serverAddress;
          this.emit('connected');
          callback?.();
        },
      );
    } else if (this._self instanceof UdpSockets.Socket) {
      this._self
        .once('listening', () =>
          (this._self as typeof UdpSockets.Socket.prototype).send(
            Buffer.from(CONNECTED),
            undefined,
            undefined,
            port,
            address,
            error => {
              if (error) {
                console.log('connect error', error);
                return;
              }
              this._serverAddress = serverAddress;
              this.emit('connected');
              callback?.();
            },
          ),
        )
        .bind();
    }

    return this;
  }

  reconnect(timeout: number, callback?: () => void): void {
    if (this._connected) {
      throw new Error('Client already connected');
    }

    this._reconnectTimeout = setTimeout(() => {
      const {port, address} = this._serverAddress;
      if (this._self instanceof TcpSocket.Socket) {
        this._self.connect(
          {
            port,
            host: address,
            reuseAddress: true,
          },
          () => {
            this.emit('connected');
            callback?.();
          },
        );
      } else if (this._self instanceof UdpSockets.Socket) {
        // if (this._self.)
        this._self.once('listening', () =>
          (this._self as typeof UdpSockets.Socket.prototype).send(
            Buffer.from(CONNECTED),
            undefined,
            undefined,
            port,
            address,
            error => {
              if (error) {
                console.log('connect error', error);
                return;
              }
              this.emit('connected');
              console.log(port, address);
              callback?.();
            },
          ),
        );
        // .bind(port);
      }

      clearTimeout(this._reconnectTimeout);
    }, timeout);
  }

  destroy(): void {
    this._connected = false;
    this._destroyed = true;
    if (this._self instanceof TcpSocket.Socket) {
      this._self.destroy();
    } else if (this._self instanceof UdpSockets.Socket) {
      this._self.close();
    }
  }

  public send(
    data: string | Uint8Array | Buffer,
    callback?: (error: Error | undefined) => void,
  ): void {
    if (this.compressed) {
      data = LZString.compressToUTF16(data.toString());
    }
    if (this._self instanceof TcpSocket.Socket) {
      if (this.delimiter) {
        data = data.toString().concat(this.delimiter ?? '');
      }
      this._self.write(data, undefined, callback);
    } else if (this._self instanceof UdpSockets.Socket) {
      const {address, port} = this._serverAddress;
      this._self.send(data, undefined, undefined, port, address, callback);
    }
  }
}

enum Protocol {
  TCP,
  UDP,
}

interface Address {
  address: string;
  port: number;
}

interface ServerEvents extends ClientEvents {
  listening: () => void;
}

interface ClientEvents {
  connected: () => void;
  message: (data: string | Buffer) => void;
  close: () => void;
  error: (err: Error) => void;
}

export {createServer, createClient, Server, Client, Protocol};
