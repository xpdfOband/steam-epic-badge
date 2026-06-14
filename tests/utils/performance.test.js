import { throttle, waitForElement, createLookupMap, createLookupSet } from '../../utils/performance';

describe('Performance Utils', () => {
  describe('throttle', () => {
    test('should throttle function calls', async () => {
      let callCount = 0;
      const throttledFn = throttle(() => callCount++, 100);
      throttledFn();
      throttledFn();
      throttledFn();
      await new Promise(resolve => setTimeout(resolve, 150));
      // 应该调用了两次：一次立即执行，一次在 trailing edge 执行
      expect(callCount).toBe(2);
    });

    test('should execute on trailing edge', async () => {
      let lastValue = null;
      const throttledFn = throttle((value) => { lastValue = value; }, 100);
      throttledFn('first');
      throttledFn('second');
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(lastValue).toBe('second');
    });

    test('should pass arguments correctly', async () => {
      let result = null;
      const throttledFn = throttle((a, b) => { result = a + b; }, 100);
      throttledFn(1, 2);
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(result).toBe(3);
    });
  });

  describe('waitForElement', () => {
    test('should resolve when element exists', async () => {
      const element = document.createElement('div');
      element.id = 'test-element';
      document.body.appendChild(element);
      const result = await waitForElement('#test-element');
      expect(result).toBe(element);
      document.body.removeChild(element);
    });

    test('should reject after timeout', async () => {
      await expect(waitForElement('#non-existent', 100))
        .rejects
        .toThrow('Element #non-existent not found within 100ms');
    });

    test('should resolve when element is added later', async () => {
      const element = document.createElement('div');
      element.id = 'delayed-element';
      setTimeout(() => {
        document.body.appendChild(element);
      }, 50);
      const result = await waitForElement('#delayed-element', 1000);
      expect(result).toBe(element);
      document.body.removeChild(element);
    });
  });

  describe('createLookupMap', () => {
    test('should create map with custom key function', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];
      const map = createLookupMap(items, item => item.id);
      expect(map.size).toBe(3);
      expect(map.get(1)).toEqual({ id: 1, name: 'Item 1' });
      expect(map.get(2)).toEqual({ id: 2, name: 'Item 2' });
      expect(map.get(3)).toEqual({ id: 3, name: 'Item 3' });
    });

    test('should handle empty array', () => {
      const map = createLookupMap([], item => item.id);
      expect(map.size).toBe(0);
    });
  });

  describe('createLookupSet', () => {
    test('should create set with custom key function', () => {
      const items = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];
      const set = createLookupSet(items, item => item.id);
      expect(set.size).toBe(3);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.has(3)).toBe(true);
      expect(set.has(4)).toBe(false);
    });
  });
});
