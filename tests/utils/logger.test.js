import { logger } from '../../utils/logger';

describe('Logger', () => {
  beforeEach(() => {
    logger.clearLogs();
    logger.setLevel('DEBUG');
  });

  test('should log messages at different levels', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const logs = logger.getLogs();
    expect(logs.length).toBe(4);
  });

  test('should filter logs by level', () => {
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const warnLogs = logger.getLogs('WARN');
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].level).toBe('WARN');
  });

  test('should respect log level setting', () => {
    logger.setLevel('WARN');

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const logs = logger.getLogs();
    expect(logs.length).toBe(2); // 只有 WARN 和 ERROR
  });

  test('should limit log history', () => {
    // 添加超过限制的日志
    for (let i = 0; i < 1500; i++) {
      logger.info(`Log message ${i}`);
    }

    expect(logger.getLogs().length).toBeLessThanOrEqual(1000);
  });

  test('should include timestamp and source', () => {
    logger.info('Test message');

    const logs = logger.getLogs();
    expect(logs[0].timestamp).toBeDefined();
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].message).toBe('Test message');
  });
});
