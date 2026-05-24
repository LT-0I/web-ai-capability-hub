import { initNativeHostListener } from './native-host';

/**
 * Background script entry point
 * Initializes native messaging and tool dispatch.
 */
export default defineBackground(() => {
  initNativeHostListener();
});
