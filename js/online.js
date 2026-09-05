/* ============================================================
 * online.js — 斗兽棋联机对战（WebRTC 点对点，无需自建服务器）
 * 依赖 PeerJS（通过 CDN 加载）
 * ============================================================ */

const Online = {
  peer: null,
  conn: null,
  role: null,          // 'host' | 'guest'
  myPlayer: null,      // 1=红方 2=蓝方
  roomCode: '',
  connected: false,
  onConnect: null,
  onDisconnect: null,
  onReceive: null,
  _pendingCallback: null,

  /* 生成6位房间码 */
  genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  /* 房主：创建房间 */
  createRoom(onReady) {
    this._cleanup();
    this.role = 'host';
    this.myPlayer = 1;
    this.roomCode = this.genCode();
    const peerId = 'dsq-' + this.roomCode;

    this.peer = new Peer(peerId, { debug: 1 });
    this.peer.on('open', (id) => {
      console.log('联机: 房间已创建', id);
      if (onReady) onReady(this.roomCode);
    });
    this.peer.on('connection', (conn) => {
      this._setupConn(conn);
    });
    this.peer.on('error', (err) => {
      console.error('联机错误:', err);
      if (err.type === 'unavailable-id') {
        // ID冲突，重新生成
        this.roomCode = this.genCode();
        this.peer.destroy();
        this.createRoom(onReady);
      }
    });
  },

  /* 访客：加入房间 */
  joinRoom(code, onResult) {
    this._cleanup();
    this.role = 'guest';
    this.myPlayer = 2;
    this.roomCode = code;
    const targetId = 'dsq-' + code;

    this.peer = new Peer({ debug: 1 });
    this.peer.on('open', () => {
      const conn = this.peer.connect(targetId, { reliable: true });
      this._setupConn(conn, onResult);
    });
    this.peer.on('error', (err) => {
      console.error('联机错误:', err);
      if (onResult) onResult(false, err.type || err.message);
    });
  },

  /* 建立连接 */
  _setupConn(conn, onResult) {
    this.conn = conn;
    conn.on('open', () => {
      this.connected = true;
      console.log('联机: 连接成功');
      if (this.role === 'guest' && onResult) onResult(true);
      if (this.role === 'host' && this.onConnect) this.onConnect();
      // 连接建立后，房主发送当前游戏状态
      if (this.role === 'host') {
        setTimeout(() => this.sendState(), 300);
      }
    });
    conn.on('data', (data) => {
      this._handleData(data);
    });
    conn.on('close', () => {
      this.connected = false;
      if (this.onDisconnect) this.onDisconnect();
    });
    conn.on('error', (err) => {
      console.error('数据连接错误:', err);
    });
  },

  /* 处理收到的数据 */
  _handleData(data) {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'state':
        if (data.snapshot) {
          try {
            restoreSnap(data.snapshot);
            render();
            if (this.onReceive) this.onReceive('state');
          } catch (e) {
            console.error('恢复状态失败:', e);
          }
        }
        break;
      case 'chat':
        if (this.onReceive) this.onReceive('chat', data.msg);
        break;
      case 'newgame':
        if (typeof newGame === 'function') newGame();
        if (this.onReceive) this.onReceive('newgame');
        break;
      case 'ping':
        this.send('pong', {});
        break;
    }
  },

  /* 发送原始消息 */
  send(type, payload) {
    if (!this.conn || !this.connected) return false;
    try {
      this.conn.send({ type, ...payload });
      return true;
    } catch (e) {
      console.error('发送失败:', e);
      return false;
    }
  },

  /* 发送当前完整游戏状态 */
  sendState() {
    if (!this.connected) return;
    try {
      const snap = saveSnap();
      this.send('state', { snapshot: snap });
    } catch (e) {
      console.error('序列化状态失败:', e);
    }
  },

  /* 发送新局指令 */
  sendNewGame() {
    this.send('newgame', {});
  },

  /* 判断是否轮到本地玩家 */
  isMyTurn() {
    return this.connected && curPlayer === this.myPlayer;
  },

  /* 清理 */
  _cleanup() {
    if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.connected = false;
    this.role = null;
    this.roomCode = '';
  },

  disconnect() {
    this._cleanup();
    if (this.onDisconnect) this.onDisconnect();
  }
};
