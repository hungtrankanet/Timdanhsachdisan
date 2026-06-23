import { EventEmitter } from 'events';

class LogEmitter extends EventEmitter {
  log(message, type = 'system') {
    const vnTimeStr = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const formatted = `${vnTimeStr} - ${message}`;
    console.log(`[${type.toUpperCase()}] ${formatted}`);
    this.emit('log', { formatted, type });
  }
}

export const logger = new LogEmitter();
export const log = (msg) => logger.log(msg, 'system');
export const logMaps = (msg) => logger.log(msg, 'maps');
export const logZalo = (msg) => logger.log(msg, 'zalo');
export default logger;
