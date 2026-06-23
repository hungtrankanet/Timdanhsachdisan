import { EventEmitter } from 'events';

class LogEmitter extends EventEmitter {
  log(message) {
    const formatted = `${new Date().toLocaleTimeString()} - ${message}`;
    console.log(formatted);
    this.emit('log', formatted);
  }
}

export const logger = new LogEmitter();
export const log = (msg) => logger.log(msg);
